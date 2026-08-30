"use server";

// Marcar uma entrega como feita, ou desfazer.
//
// A fila de /admin/entregas já dizia quem ganhou, o que ganhou e para onde
// enviar. O que faltava era dizer o que JÁ SAIU: sem isso, campanha sorteada
// há um mês fica do lado da de ontem e quem opera precisa lembrar de cor.
//
// Desfazer existe porque marcar errado é o erro mais provável aqui: são vários
// cards parecidos numa lista, e um toque no lugar errado não pode virar um
// registro que ninguém consegue corrigir.

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { assertRaffleInActiveTenant } from "@/lib/tenant";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

const esquema = z.object({
  raffleId: z.string().min(1),
  entregue: z.boolean(),
  // Número da oferta na Steam, combinação feita, o que for. Teto porque é
  // campo livre exposto a quem tem o painel, e texto sem limite vira problema
  // de armazenamento e de tela.
  observacao: z.string().max(500).optional().nullable(),
});

export async function marcarEntregaAction(
  raw: unknown,
): Promise<ActionResult<{ deliveredAt: string | null }>> {
  const parsed = esquema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Dados inválidos" };

  try {
    const session = await getAdminOrThrow();
    // Sem esta checagem, o id de uma campanha de OUTRO painel marcaria entrega
    // aqui: o id vem do cliente. Ela também devolve o tenant da campanha, que
    // é o que vai para o log.
    const tenantId = await assertRaffleInActiveTenant(
      parsed.data.raffleId,
      session.user,
    );

    const rifa = await prisma.raffle.findUnique({
      where: { id: parsed.data.raffleId },
      select: { title: true, winnerTicketNumber: true },
    });
    if (!rifa) return { ok: false, error: "Campanha não encontrada." };
    // Entrega de campanha sem ganhador não existe, e deixar marcar criaria um
    // registro que não quer dizer nada.
    if (rifa.winnerTicketNumber == null) {
      return { ok: false, error: "Esta campanha ainda não tem ganhador." };
    }

    const agora = new Date();
    const observacao = parsed.data.observacao?.trim() || null;
    const atualizada = await prisma.raffle.update({
      where: { id: parsed.data.raffleId },
      data: parsed.data.entregue
        ? {
            deliveredAt: agora,
            deliveredById: session.user.id,
            deliveryNote: observacao,
          }
        : // Desfazer limpa os três: meia marcação, com data apagada mas autor
          // mantido, mentiria no histórico.
          { deliveredAt: null, deliveredById: null, deliveryNote: null },
    });

    await registrarLog({
      acao: parsed.data.entregue
        ? "entrega.marcada"
        : "entrega.desmarcada",
      tenantId,
      alvo: { tipo: "Raffle", id: parsed.data.raffleId, rotulo: rifa.title },
      detalhes: { titulo: rifa.winnerTicketNumber, observacao },
    });

    revalidatePath("/admin/entregas");

    return {
      ok: true,
      data: { deliveredAt: atualizada.deliveredAt?.toISOString() ?? null },
    };
  } catch {
    return { ok: false, error: "Não foi possível salvar." };
  }
}
