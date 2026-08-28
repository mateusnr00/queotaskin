// Serviço de reservas, coração da concorrência do sistema.
//
// COMO EVITAMOS VENDA DUPLA DE NÚMEROS:
//
// 1. A tabela Ticket tem @@unique([raffleId, number]). O banco GARANTE que
//    não existam duas linhas com o mesmo (raffleId, number). Esse é o lock real.
//
// 2. Tentamos inserir todos os tickets dentro de uma transação Prisma. Se UM
//    INSERT falha com erro de unique constraint (P2002), a transação inteira
//    rola pra trás, nenhum ticket é criado, nenhuma reserva é gravada.
//
// 3. Depois do erro, fazemos uma query separada pra descobrir QUAIS números
//    estão tomados e devolvemos isso pra UI mostrar uma mensagem útil ao
//    participante ("os números 5, 12 já foram reservados, escolha outros").
//
// Não usamos `SELECT FOR UPDATE` porque o Prisma não expõe row-level locks
// elegantes, e a unique constraint resolve o problema de forma mais simples
// e mais portável.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { onlyDigits } from "@/lib/cpf";
import {
  NotFoundError,
  ReservationConflictError,
  ValidationError,
} from "@/lib/errors";
import type { CreateReservationInput } from "@/lib/validations/raffle";
import { pickAvailableNumbers } from "@/server/services/raffles";
import { bilhetesDe, dobroAtivo } from "@/lib/promocao-em-dobro";

// Expira reservas PENDING da rifa específica que já passaram do expiresAt.
// Chamada antes de cada createReservation pra liberar números rapidamente
// SEM esperar o cron rodar. Indexada por (status, expiresAt) e raffleId.
export async function expireForRaffle(
  raffleId: string,
  now: Date = new Date()
): Promise<number> {
  const expired = await prisma.reservation.findMany({
    where: {
      raffleId,
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: { id: true },
    take: 100,
  });
  if (expired.length === 0) return 0;

  const ids = expired.map((r) => r.id);
  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { reservationId: { in: ids } } }),
    prisma.reservation.updateMany({
      where: { id: { in: ids } },
      data: { status: "EXPIRED" },
    }),
  ]);
  return expired.length;
}

// Expira UMA reserva específica se ela já passou do expiresAt. Chamada na
// página do comprovante pra evitar o estado híbrido "countdown zerou no
// cliente mas servidor ainda diz PENDING". Idempotente: se já está EXPIRED
// (ou em qualquer status terminal), retorna false sem tocar em nada.
export async function expireReservationIfDue(
  reservationId: string,
  now: Date = new Date()
): Promise<boolean> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: { id: true, status: true, expiresAt: true },
  });
  if (!reservation) return false;
  if (reservation.status !== "PENDING") return false;
  if (reservation.expiresAt > now) return false;

  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { reservationId } }),
    prisma.reservation.update({
      where: { id: reservationId },
      data: { status: "EXPIRED" },
    }),
  ]);
  return true;
}

// Calcula quantos tickets uma reserva DEVERIA ter (com base no valor total
// e preço por número) e pega N números aleatórios disponíveis na rifa.
// Usado pra "ressuscitar" tickets quando a reserva foi marcada PAID após
// ter expirado (cron deletou os tickets originais).
//
// Retorna [] se a rifa é grátis ou se a conta não bate. Lança se não há
// números suficientes disponíveis (rifa lotou).
export async function computeTicketsToRecreate(
  reservationId: string
): Promise<number[]> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      totalAmount: true,
      dobroAplicado: true,
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
  if (!reservation) return [];

  const fee =
    reservation.raffle.hasFee && reservation.raffle.feeAmount
      ? Number(reservation.raffle.feeAmount)
      : 0;
  const pricePerNumber = reservation.raffle.isFree
    ? 0
    : Number(reservation.raffle.pricePerNumber);
  if (pricePerNumber <= 0) return [];

  const pagas = Math.round(
    (Number(reservation.totalAmount) - fee) / pricePerNumber
  );
  if (pagas <= 0) return [];

  // O valor pago só conta as cotas compradas. Quem comprou durante a promoção
  // recebeu o dobro, e recriar pelo valor devolveria metade dos números.
  const qty = bilhetesDe(pagas, reservation.dobroAplicado);

  return pickAvailableNumbers(
    reservation.raffle.id,
    qty,
    reservation.raffle.totalNumbers
  );
}

export async function createReservation(input: CreateReservationInput) {
  // 0. ANTES de tudo: libera números de reservas que já expiraram nessa rifa.
  // Custo: 1 query indexada. Se nada expirou, retorna imediatamente.
  // Garante que números pendentes vencidos virem disponíveis pro próximo
  // comprador, sem depender do cron de 5min.
  await expireForRaffle(input.raffleId);

  // 1. Carrega a rifa e valida estado.
  const raffle = await prisma.raffle.findUnique({
    where: { id: input.raffleId },
  });
  if (!raffle) throw new NotFoundError("Rifa");
  if (raffle.status !== "ACTIVE") {
    throw new ValidationError("Esta rifa não está disponível para venda");
  }

  // 2. Valida que os números estão dentro do intervalo da rifa.
  const out = input.numbers.filter(
    (n) => n < 1 || n > raffle.totalNumbers
  );
  if (out.length > 0) {
    throw new ValidationError(
      `Números fora do intervalo (1 a ${raffle.totalNumbers}): ${out.join(", ")}`
    );
  }

  // 3. Valida limites min/max por reserva.
  if (input.numbers.length < raffle.minPurchase) {
    throw new ValidationError(
      `Mínimo ${raffle.minPurchase} número(s) por reserva`
    );
  }
  if (raffle.maxPurchase && input.numbers.length > raffle.maxPurchase) {
    throw new ValidationError(
      `Máximo ${raffle.maxPurchase} número(s) por reserva`
    );
  }

  // 4. Calcula valores. Quando a rifa está marcada como grátis, o preço
  //    efetivo é zero, mesmo se pricePerNumber tiver algum valor residual
  //    (admin pode ter mudado de paga pra grátis sem zerar o campo).
  const pricePerNumber = raffle.isFree ? 0 : Number(raffle.pricePerNumber);
  // O valor é o das cotas escolhidas. A promoção em dobro NÃO entra aqui: ela
  // muda quantos números saem, nunca quanto se paga.
  const totalAmount = pricePerNumber * input.numbers.length;
  const isFreeReservation = totalAmount <= 0;
  const now = new Date();

  // 4b. Promoção em dobro: sorteia os números extras agora, antes da
  //     transação, e decide uma vez só. Consultar a janela mais de uma vez
  //     durante a compra deixaria a virada da hora cair no meio de um pedido.
  const comDobro = dobroAtivo(
    {
      ativa: raffle.promotionsDoubleEnabled,
      inicio: raffle.promotionsDoubleFrom,
      fim: raffle.promotionsDoubleUntil,
    },
    now
  );
  let numerosExtras: number[] = [];
  if (comDobro) {
    try {
      // Os escolhidos ainda não estão na tabela, então o sorteio pode repetir
      // um deles. O filtro aqui embaixo é o que impede isso, e por isso pedimos
      // com folga antes de cortar.
      const escolhidos = new Set(input.numbers);
      const sorteados = await pickAvailableNumbers(
        raffle.id,
        Math.min(
          input.numbers.length * 2,
          raffle.totalNumbers
        ),
        raffle.totalNumbers
      );
      numerosExtras = sorteados
        .filter((n) => !escolhidos.has(n))
        .slice(0, input.numbers.length);
    } catch {
      // Sem números livres suficientes para dobrar, a compra continua sem a
      // promoção. Recusar a venda porque o brinde não coube seria pior.
      numerosExtras = [];
    }
  }
  const dobroAplicado = numerosExtras.length > 0;
  const expiresAt = new Date(
    now.getTime() + raffle.reservationTimeoutMinutes * 60_000
  );

  // 5. Transação: cria reserva + tickets. Se qualquer ticket colidir, rolla tudo.
  //    Reservas grátis pulam o ciclo PENDING → PIX → PAID: já nascem PAID
  //    com os tickets PAID e paidAt agora, não tem o que cobrar, não tem
  //    countdown, não tem cobrança Pix. O job de expiração ignora qualquer
  //    coisa que não esteja PENDING, então a reserva fica garantida pra
  //    sempre. A UI do comprovante já detecta PAID e renderiza a tela
  //    comemorativa, sem código extra.
  try {
    return await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.create({
        data: {
          raffleId: raffle.id,
          participantName: input.participantName.trim(),
          participantPhone: input.participantPhone
            ? onlyDigits(input.participantPhone)
            : null,
          participantCpf: input.participantCpf
            ? onlyDigits(input.participantCpf)
            : null,
          participantEmail: input.participantEmail ?? null,
          totalAmount,
          dobroAplicado,
          expiresAt,
          status: isFreeReservation ? "PAID" : "PENDING",
          paidAt: isFreeReservation ? now : null,
          utmSource: input.utmSource ?? null,
          utmMedium: input.utmMedium ?? null,
          utmCampaign: input.utmCampaign ?? null,
          utmContent: input.utmContent ?? null,
        },
      });

      const comoTicket = (number: number) => ({
        raffleId: raffle.id,
        number,
        status: isFreeReservation ? ("PAID" as const) : ("RESERVED" as const),
        reservationId: reservation.id,
        paidAt: isFreeReservation ? now : null,
      });

      // Os escolhidos entram sem tolerância: colidiu, a compra inteira volta
      // atrás e a pessoa escolhe de novo. É o que ela pediu e pagou.
      await tx.ticket.createMany({ data: input.numbers.map(comoTicket) });

      // Os bônus entram com `skipDuplicates`, e a diferença é deliberada.
      // Foram sorteados antes da transação, então alguém pode ter levado um
      // deles nesse intervalo. Derrubar a venda inteira porque um número de
      // brinde colidiu seria punir o comprador por causa do presente: aqui o
      // que colidiu simplesmente não entra, e o resto do pedido segue.
      if (numerosExtras.length > 0) {
        await tx.ticket.createMany({
          data: numerosExtras.map(comoTicket),
          skipDuplicates: true,
        });
      }

      return reservation;
    });
  } catch (err) {
    // P2002 = violação de unique constraint do Postgres (via Prisma).
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const taken = await prisma.ticket.findMany({
        where: { raffleId: raffle.id, number: { in: input.numbers } },
        select: { number: true },
      });
      throw new ReservationConflictError(taken.map((t) => t.number).sort((a, b) => a - b));
    }
    throw err;
  }
}

// Job de expiração: roda periodicamente (Inngest). Pega reservas PENDING
// expiradas, marca como EXPIRED e LIBERA os números (deleta os Tickets).
// IMPORTANTE: SetNull no FK Ticket→Reservation faria os tickets ficarem como
// "fantasmas" ocupando os números. Por isso aqui deletamos os tickets explicitamente.
export async function expireReservations(now: Date = new Date()) {
  const expired = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: now },
    },
    select: { id: true },
    take: 500, // processa em batches para não estourar memória
  });

  if (expired.length === 0) {
    return { expired: 0 };
  }

  const ids = expired.map((r) => r.id);

  await prisma.$transaction([
    prisma.ticket.deleteMany({ where: { reservationId: { in: ids } } }),
    prisma.reservation.updateMany({
      where: { id: { in: ids } },
      data: { status: "EXPIRED" },
    }),
  ]);

  return { expired: expired.length };
}
