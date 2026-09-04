// Revogacao de sessao via sessionVersion. Estrategia JWT: o token carrega a
// versao emitida no login; a checagem compara com a versao atual no banco.
// Incrementar a versao (recovery, troca de telefone, takeover, logout-all)
// invalida TODAS as sessoes emitidas antes, sem esperar expirar.
//
// Performance (§25): a checagem NAO roda em toda renderizacao. Ela roda onde
// importa - acoes autenticadas sensiveis - com uma leitura de uma linha por
// PK. O middleware de borda segue so conferindo "esta logado".
import { prisma } from "@/lib/db";

/// Incremento ATOMICO. Retorna a nova versao.
export async function revogarTodasAsSessoes(userId: string): Promise<number> {
  const u = await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
  return u.sessionVersion;
}

/// A versao da sessao ainda bate com a do banco? Falso => sessao revogada.
export async function sessaoAindaValida(sessao: {
  userId: string;
  sessionVersion?: number | null;
}): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: sessao.userId },
    select: { sessionVersion: true },
  });
  if (!u) return false;
  return (sessao.sessionVersion ?? -1) === u.sessionVersion;
}
