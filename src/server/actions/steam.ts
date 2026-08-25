"use server";

// Server action do link de troca da Steam.
//
// É o único dado do participante que a plataforma precisa para entregar o
// prêmio. Guardamos junto o SteamID64 derivado do link — serve pra conferir
// que o ganhador não trocou de conta entre a compra e o sorteio.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { steamIdFromTradeUrl } from "@/lib/cs2";
import { steamTradeUrlSchema } from "@/lib/validations/steam";
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

  revalidatePath("/minha-conta");
  revalidatePath("/meus-titulos");

  return { ok: true, data: { steamTradeUrl } };
}
