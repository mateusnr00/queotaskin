"use server";

// Server action do time do coração.
//
// Dado cosmético e público: aparece ao lado do nome nas listas de ganhadores.
// Por ser público, ele passa pela mesma checagem de sessão que qualquer outro
// campo da conta, e o id é conferido contra a lista de times antes de entrar no
// banco. Sem essa conferência, um POST com texto arbitrário viraria conteúdo
// exibido ao lado do nome de alguém em página pública.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { timeExiste } from "@/server/services/times";
import type { ActionResult } from "@/server/actions/auth";

export async function salvarTimeDoCoracaoAction(
  raw: unknown,
): Promise<ActionResult<{ favoriteTeamId: string | null }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "Você precisa estar logado." };
  }

  // Nulo e string vazia significam a mesma coisa vinda do formulário: parar de
  // torcer. Guardar "" no banco faria `timePorId` procurar por vazio a cada
  // leitura, então normaliza para nulo aqui, na entrada.
  const id = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;

  if (id !== null && !(await timeExiste(id))) {
    return { ok: false, error: "Time desconhecido." };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { favoriteTeamId: id },
  });

  revalidatePath("/minha-conta");

  return { ok: true, data: { favoriteTeamId: id } };
}
