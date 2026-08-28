"use server";

// Server Action de reserva. EXIGE sessão: o usuário precisa ter conta
// cadastrada (CPF + nome) antes de reservar. Os dados do participante
// (nome/CPF) NÃO vêm mais do formulário, são puxados da conta logada.
// Telefone/e-mail/etc continuam opcionais e podem ser enviados pelo form.

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import {
  computeTicketsToRecreate,
  createReservation,
} from "@/server/services/reservations";
import {
  pickAvailableNumbers,
  pickSequentialNumbers,
} from "@/server/services/raffles";
import {
  ensurePixForReservation,
  pollPaymentStatusIfPending,
} from "@/server/services/pix";
import { onlyDigits, isValidCpf } from "@/lib/cpf";
import { DomainError, ReservationConflictError } from "@/lib/errors";
import { getCurrentTenant, assertRaffleInActiveTenant } from "@/lib/tenant";
import {
  estaBloqueado,
  registrarFalha,
} from "@/server/services/login-throttle";
import {
  getAdminOrThrow,
  sessionMayAccessOwnedResource,
} from "@/lib/auth-helpers";
import { autoAwardTicketsForReservation } from "@/server/services/awarded-tickets";
import { autoGenerateSurpriseBoxesForReservation } from "@/server/services/surprise-boxes";
import { awardXpForReservation, getUserXp } from "@/server/services/xp";
import { meetsMinLevel, rankFromXp } from "@/lib/rank";
import type { ActionResult } from "@/server/actions/auth";

// Campos opcionais que o usuário pode complementar no momento da reserva
// (sem prejudicar o "fonte da verdade" que é a conta logada).
const optionalExtras = {
  // CPF é capturado aqui quando a conta não tem um cadastrado e a campanha
  // exige (Pix sempre exige). Aceita vazio, o action decide se erra.
  participantCpf: z
    .string()
    .transform(onlyDigits)
    .refine((v) => v === "" || isValidCpf(v), "CPF inválido")
    .optional()
    .or(z.literal("")),
  participantPhone: z
    .string()
    .transform(onlyDigits)
    .refine(
      (v) => v === "" || (v.length >= 10 && v.length <= 11),
      "Telefone inválido"
    )
    .optional()
    .or(z.literal("")),
  participantEmail: z.string().email().optional().or(z.literal("")),
  participantSocialName: z.string().max(120).optional().or(z.literal("")),
  participantBirthDate: z.coerce.date().optional().nullable(),
  utmSource: z.string().max(120).optional(),
  utmMedium: z.string().max(120).optional(),
  utmCampaign: z.string().max(120).optional(),
  utmContent: z.string().max(120).optional(),
};

// União discriminada: ou {quantity} (sistema sorteia/pega sequencial),
// ou {numbers} (usuário selecionou manualmente).
const reserveSchema = z.union([
  z.object({
    raffleId: z.string().cuid(),
    quantity: z.coerce.number().int().min(1).max(10_000),
    ...optionalExtras,
  }),
  z.object({
    raffleId: z.string().cuid(),
    numbers: z.array(z.coerce.number().int().min(1)).min(1).max(10_000),
    ...optionalExtras,
  }),
]);

export async function createReservationAction(
  raw: unknown
): Promise<
  ActionResult<{ reservationId: string; numbers: number[]; total: number }>
> {
  // 0. EXIGE login. Sem conta, sem reserva.
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      error: "Você precisa estar logado para reservar. Crie sua conta ou entre.",
    };
  }

  const parsed = reserveSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const input = parsed.data;
  const isManual = "numbers" in input;

  // Busca os dados de identidade direto da conta logada, nome vem SEMPRE
  // daqui (a UI não pode sobrescrever). CPF é flexível: prioriza o que veio
  // do form (campanha pedindo CPF a quem ainda não tem na conta), com
  // fallback pro user.cpf se já existir.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, cpf: true, phone: true, email: true },
  });
  if (!user) {
    return { ok: false, error: "Sessão inválida. Faça login novamente." };
  }

  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Host inválido" };

  const raffle = await prisma.raffle.findUnique({
    where: { id: input.raffleId },
    select: {
      id: true,
      totalNumbers: true,
      reservationModel: true,
      status: true,
      pricePerNumber: true,
      tenantId: true,
      minLevel: true,
    },
  });
  if (!raffle) return { ok: false, error: "Rifa não encontrada" };
  // Bloqueio cross-tenant: só permite reservar em rifa do tenant atual.
  if (raffle.tenantId !== tenant.id) {
    return { ok: false, error: "Rifa não encontrada" };
  }
  if (raffle.status !== "ACTIVE") {
    return { ok: false, error: "Rifa não está disponível" };
  }

  // Anti-abuso: teto de reservas PENDENTES por usuário nesta campanha (senão
  // um loop reserva o estoque inteiro sem pagar e o segura até expirar) e
  // freio por janela (cada reserva com valor gera uma cobrança no gateway).
  const PENDENTES_MAX = 5;
  const pendentes = await prisma.reservation.count({
    where: { userId: user.id, raffleId: raffle.id, status: "PENDING" },
  });
  if (pendentes >= PENDENTES_MAX) {
    return {
      ok: false,
      error:
        "Você tem reservas aguardando pagamento nesta campanha. Pague ou espere expirar antes de reservar mais.",
    };
  }
  const chaveReserva = `reserva:${user.id}`;
  if ((await estaBloqueado([chaveReserva])).bloqueado) {
    return {
      ok: false,
      error: "Muitas reservas seguidas. Espere um pouco e tente de novo.",
    };
  }
  await registrarFalha([chaveReserva]);

  // Campanha exclusiva: exige nível mínimo. Checado aqui no servidor porque
  // a página pública só esconde o formulário, esconder botão não é
  // autorização.
  if (raffle.minLevel != null) {
    const xp = await getUserXp(user.id, tenant.id);
    if (!meetsMinLevel(xp, raffle.minLevel)) {
      return {
        ok: false,
        error: `Campanha exclusiva para o nível ${raffle.minLevel} ou acima. Você está no ${rankFromXp(xp).label.toLowerCase()}.`,
      };
    }
  }

  // CPF efetivo: form > conta. Quando vier do form e a conta ainda não tem,
  // salva pra não pedir de novo na próxima reserva.
  const cpfFromForm =
    "participantCpf" in input && input.participantCpf
      ? input.participantCpf
      : "";
  const effectiveCpf = cpfFromForm || user.cpf || null;

  if (cpfFromForm && !user.cpf) {
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { cpf: cpfFromForm },
      });
    } catch {
      // Se já existir outra conta com esse CPF (P2002), seguimos, o CPF
      // ainda vai pro participantCpf da reserva; só não fica no perfil.
    }
  }

  // Dados do participante: identidade vem da conta; contato pode ser
  // complementado pelo formulário (com fallback pra conta).
  const participantData = {
    participantName: user.name,
    participantCpf: effectiveCpf,
    participantPhone:
      (input.participantPhone && input.participantPhone) || user.phone || null,
    participantEmail:
      ("participantEmail" in input && input.participantEmail) ||
      user.email ||
      null,
    utmSource: ("utmSource" in input && input.utmSource) || null,
    utmMedium: ("utmMedium" in input && input.utmMedium) || null,
    utmCampaign: ("utmCampaign" in input && input.utmCampaign) || null,
    utmContent: ("utmContent" in input && input.utmContent) || null,
    affiliateCode: null,
  };

  // Manual: sem retry (a lista de números é fixa, conflito = erro real).
  if (isManual) {
    try {
      const reservation = await createReservation({
        raffleId: raffle.id,
        numbers: input.numbers,
        ...participantData,
      });
      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { userId: user.id },
      });
      // Cria a cobrança Pix (best-effort), mas só quando há valor a
      // cobrar. Reservas grátis já nascem PAID, gerar Pix nelas só causa
      // ruído.
      if (Number(reservation.totalAmount) > 0) {
        await ensurePixForReservation(reservation.id);
      }
      revalidatePath(`/sorteios`);
      revalidatePath(`/admin/sorteios`);
      return {
        ok: true,
        data: {
          reservationId: reservation.id,
          numbers: input.numbers,
          total: Number(reservation.totalAmount),
        },
      };
    } catch (err) {
      if (err instanceof ReservationConflictError) {
        return {
          ok: false,
          error: `Esses números já foram pegos: ${err.takenNumbers.join(", ")}. Atualize a página e escolha outros.`,
        };
      }
      if (err instanceof DomainError) {
        return { ok: false, error: err.message };
      }
      console.error("[createReservationAction manual]", err);
      return { ok: false, error: "Erro ao criar reserva" };
    }
  }

  // Modo quantidade: retry curto em conflito (re-sorteia novos números).
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const numbers =
        raffle.reservationModel === "SEQUENTIAL"
          ? await pickSequentialNumbers(
              raffle.id,
              input.quantity,
              raffle.totalNumbers
            )
          : await pickAvailableNumbers(
              raffle.id,
              input.quantity,
              raffle.totalNumbers
            );

      const reservation = await createReservation({
        raffleId: raffle.id,
        numbers,
        ...participantData,
      });

      await prisma.reservation.update({
        where: { id: reservation.id },
        data: { userId: user.id },
      });

      if (Number(reservation.totalAmount) > 0) {
        await ensurePixForReservation(reservation.id);
      }

      revalidatePath(`/sorteios`);
      revalidatePath(`/admin/sorteios`);

      return {
        ok: true,
        data: {
          reservationId: reservation.id,
          numbers,
          total: Number(reservation.totalAmount),
        },
      };
    } catch (err) {
      if (err instanceof ReservationConflictError && attempt < MAX_RETRIES) {
        continue;
      }
      if (err instanceof DomainError) {
        return { ok: false, error: err.message };
      }
      console.error("[createReservationAction]", err);
      return { ok: false, error: "Erro ao criar reserva" };
    }
  }

  // Distingue esgotado de disputa por número: "tente novamente" numa rifa
  // vendida por inteiro manda o comprador bater numa porta que não abre.
  const livres =
    raffle.totalNumbers -
    (await prisma.ticket.count({ where: { raffleId: raffle.id } }));

  return {
    ok: false,
    error:
      livres <= 0
        ? "Todos os números desta campanha já foram vendidos."
        : "Não conseguimos reservar os números (alta demanda). Tente novamente.",
  };
}

// Server Action chamada pelo botão "Tentar novamente" na página do
// comprovante quando a primeira tentativa de gerar o Pix falhou (env não
// configurada, gateway fora do ar, body rejeitado, etc).
export async function retryPixForReservationAction(
  reservationId: string
): Promise<ActionResult<{ pixCode: string }>> {
  if (typeof reservationId !== "string" || reservationId.length === 0) {
    return { ok: false, error: "ID de reserva inválido" };
  }
  // Defesa em profundidade: a action é chamada da página do comprovante
  // (já gated por tenant), mas validamos aqui também pra impedir injeção
  // de reservationId de outro tenant.
  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Host inválido" };
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { userId: true, raffle: { select: { tenantId: true } } },
  });
  if (!reservation || reservation.raffle.tenantId !== tenant.id) {
    return { ok: false, error: "Reserva não encontrada" };
  }
  // Isolamento: logado só refaz o Pix da própria reserva (admin também);
  // deslogado passa pelo link (cuid), que é a credencial do comprovante.
  if (!(await sessionMayAccessOwnedResource(reservation.userId))) {
    return { ok: false, error: "Reserva não encontrada" };
  }

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip")?.trim() ??
    "0.0.0.0";
  const result = await ensurePixForReservation(reservationId, ip);
  if (!result.ok) {
    return { ok: false, error: result.error };
  }
  revalidatePath(`/comprovante/${reservationId}`);
  return { ok: true, data: { pixCode: result.pix.pixCode } };
}

// Server Action: força consulta do status no gateway (ignora throttle
// quando ativada pelo botão "Já paguei" do usuário). Marca como PAID
// se o gateway confirmar.
export async function checkPaymentStatusAction(
  reservationId: string
): Promise<ActionResult<{ status: "PENDING" | "APPROVED" | "REJECTED" }>> {
  if (typeof reservationId !== "string" || reservationId.length === 0) {
    return { ok: false, error: "ID de reserva inválido" };
  }
  const tenant = await getCurrentTenant();
  if (!tenant) return { ok: false, error: "Host inválido" };
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      userId: true,
      status: true,
      payment: { select: { id: true, externalId: true } },
      raffle: { select: { tenantId: true } },
    },
  });
  if (!reservation || reservation.raffle.tenantId !== tenant.id) {
    return { ok: false, error: "Reserva não encontrada" };
  }
  // Isolamento: logado só consulta a própria reserva (admin também);
  // deslogado passa pelo link (cuid), a credencial do comprovante.
  if (!(await sessionMayAccessOwnedResource(reservation.userId))) {
    return { ok: false, error: "Reserva não encontrada" };
  }
  if (reservation.status === "PAID") {
    return { ok: true, data: { status: "APPROVED" } };
  }
  if (!reservation.payment?.externalId) {
    return { ok: false, error: "Sem cobrança Pix vinculada" };
  }

  // Freio: force:true ignora o throttle interno de poll, então sem um limite
  // aqui o botão "Já paguei" em loop martela o gateway.
  const chavePoll = `poll:${reservationId}`;
  if ((await estaBloqueado([chavePoll])).bloqueado) {
    return { ok: false, error: "Aguarde um instante antes de checar de novo." };
  }
  await registrarFalha([chavePoll]);

  const polled = await pollPaymentStatusIfPending(
    reservation.payment.id,
    reservation.payment.externalId,
    reservation.id,
    { force: true }
  );
  if (polled === null) {
    return { ok: false, error: "Não foi possível consultar o gateway" };
  }
  revalidatePath(`/comprovante/${reservationId}`);
  return { ok: true, data: { status: polled } };
}

// Marca uma reserva como paga MANUALMENTE, usado pelo admin quando o
// webhook do gateway falhou e ele confirma o pagamento por fora (ex.: viu
// no painel da CodePay/SyncPay). Atomicidade total: Payment + Reservation
// + Ticket transicionam juntos. Idempotente (chamar 2x em PAID não faz
// nada). Restrita ao tenant do admin pra impedir cross-tenant.
export async function markReservationPaidAction(
  reservationId: string
): Promise<ActionResult<{ recreatedTickets?: number[] }>> {
  try {
    if (typeof reservationId !== "string" || reservationId.length === 0) {
      return { ok: false, error: "ID de reserva inválido" };
    }
    const session = await getAdminOrThrow();

    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      select: {
        id: true,
        status: true,
        raffleId: true,
        totalAmount: true,
        payment: { select: { id: true } },
        _count: { select: { tickets: true } },
        raffle: {
          select: {
            id: true,
            totalNumbers: true,
            pricePerNumber: true,
            feeAmount: true,
            hasFee: true,
            isFree: true,
          },
        },
      },
    });
    if (!reservation) {
      return { ok: false, error: "Reserva não encontrada" };
    }

    // Cross-tenant guard.
    await assertRaffleInActiveTenant(reservation.raffleId, session.user);

    if (reservation.status === "PAID") {
      return { ok: true, data: {} };
    }
    if (
      reservation.status !== "PENDING" &&
      reservation.status !== "EXPIRED"
    ) {
      return {
        ok: false,
        error: `Não dá pra marcar como paga uma reserva ${reservation.status}.`,
      };
    }

    // Se a reserva expirou, os tickets foram deletados pelo cron (modelo
    // lazy). Recria antes da transação principal, computeTicketsToRecreate
    // lê o estado atual da tabela Ticket. Risco de race se outro comprador
    // pegar os mesmos números entre o pick e o insert: aceitamos (chance
    // baixa, e o insert falha em P2002 se acontecer, admin tenta de novo).
    let toRecreate: number[] | null = null;
    if (
      reservation.status === "EXPIRED" &&
      reservation._count.tickets === 0
    ) {
      try {
        toRecreate = await computeTicketsToRecreate(reservation.id);
      } catch (err) {
        return {
          ok: false,
          error:
            err instanceof Error
              ? err.message
              : "Falha ao escolher números disponíveis",
        };
      }
      if (toRecreate.length === 0) {
        return {
          ok: false,
          error:
            "Não foi possível calcular quantos tickets recriar. Cheque o valor da reserva e o preço por número da rifa.",
        };
      }
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.reservation.update({
        where: { id: reservation.id },
        data: { status: "PAID", paidAt: now },
      });
      await tx.ticket.updateMany({
        where: { reservationId: reservation.id, status: "RESERVED" },
        data: { status: "PAID", paidAt: now },
      });
      if (reservation.payment) {
        await tx.payment.update({
          where: { id: reservation.payment.id },
          data: { status: "APPROVED", paidAt: now },
        });
      }
      if (toRecreate && toRecreate.length > 0) {
        await tx.ticket.createMany({
          data: toRecreate.map((number) => ({
            raffleId: reservation.raffleId,
            number,
            status: "PAID" as const,
            reservationId: reservation.id,
            paidAt: now,
          })),
        });
      }
    });

    // Auto-upgrade tickets pra AWARDED quando o número for um título premiado.
    await autoAwardTicketsForReservation(reservation.id).catch((err) =>
      console.error("[markReservationPaidAction] autoAward falhou:", err)
    );
    // Gera as Caixas Surpresas baseado nos combos da rifa.
    await autoGenerateSurpriseBoxesForReservation(reservation.id).catch((err) =>
      console.error(
        "[markReservationPaidAction] autoGenerateSurpriseBoxes falhou:",
        err
      )
    );

    // Credita o XP do rank também na confirmação manual pelo painel.
    await awardXpForReservation(reservation.id);


    revalidatePath(`/comprovante/${reservationId}`);
    return {
      ok: true,
      data: toRecreate ? { recreatedTickets: toRecreate } : {},
    };
  } catch (err) {
    console.error("[markReservationPaidAction]", err);
    return { ok: false, error: "Erro ao marcar como paga" };
  }
}
