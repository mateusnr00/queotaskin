// A ordem da vitrine e quem é a campanha principal.
//
// Fica no lib porque a home e a lista de campanhas precisam concordar. Estavam
// cada uma com a sua ordenação escrita à mão, e a mesma campanha podia
// aparecer em posições diferentes nas duas páginas do mesmo site.
//
// A ordem é: principal primeiro, depois a posição definida no painel, e o
// empate cai para a mais recente, que era o único critério que existia antes.

/** O orderBy do Prisma para qualquer listagem pública de campanhas. */
export const ORDEM_DA_VITRINE = [
  { principal: "desc" as const },
  { ordem: "asc" as const },
  { createdAt: "desc" as const },
];

/**
 * Separa a principal do resto.
 *
 * A principal é a marcada no painel. Sem nenhuma marcada, a primeira da ordem
 * assume o lugar: uma vitrine sem card grande fica com um buraco no topo, e
 * "esqueceram de marcar" não é motivo para a página parecer quebrada.
 */
export function separarPrincipal<T extends { principal: boolean }>(
  campanhas: T[],
): { principal: T | null; demais: T[] } {
  if (campanhas.length === 0) return { principal: null, demais: [] };
  const marcada = campanhas.find((c) => c.principal);
  const escolhida = marcada ?? campanhas[0]!;
  return {
    principal: escolhida,
    demais: campanhas.filter((c) => c !== escolhida),
  };
}
