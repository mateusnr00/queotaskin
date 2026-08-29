"use server";

// Server action do link de troca da Steam.
//
// É o único dado do participante que a plataforma precisa para entregar o
// prêmio. Guardamos junto o SteamID64 derivado do link, serve pra conferir
// que o ganhador não trocou de conta entre a compra e o sorteio.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { steamIdFromTradeUrl } from "@/lib/cs2";
import { steamTradeUrlSchema } from "@/lib/validations/steam";
import { registrarLog } from "@/server/services/activity-log";
import type { ActionResult } from "@/server/actions/auth";

export async function updateSteamTradeUrlAction(
  raw: unknown,
): Promise<ActionResult<{ steamTradeUrl: string | null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Você precisa estar logado." };
  }

  const parsed = steamTradeUrlSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const value = parsed.data.steamTradeUrl;
  const steamTradeUrl = value === "" ? null : value;

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      steamTradeUrl,
      steamId: steamTradeUrl ? steamIdFromTradeUrl(steamTradeUrl) : null,
    },
  });

  // Ação de site público, fora do recorte "painel e dinheiro", incluída de
  // propósito: é o endereço para onde a skin vai. Se ele muda entre o
  // sorteio e a entrega, é a primeira coisa que se quer olhar.
  //
  // Sem tenantId: a conta do participante é global, não pertence a um
  // painel. Origem PUBLICO porque quem agiu foi o próprio participante, no
  // site público, não um admin no painel; a URL não entra em detalhes
  // porque o valor carrega um token no próprio texto.
  await registrarLog({
    acao: "usuario.trade_url_alterada",
    origem: "PUBLICO",
    alvo: { tipo: "User", id: session.user.id, rotulo: session.user.name },
  });

  revalidatePath("/minha-conta");
  revalidatePath("/meus-titulos");

  return { ok: true, data: { steamTradeUrl } };
}
