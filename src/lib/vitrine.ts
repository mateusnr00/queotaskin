// A ordem da vitrine e quem é a campanha principal.
//
// Fica no lib porque a home e a lista de campanhas precisam concordar. Estavam
// cada uma com a sua ordenação escrita à mão, e a mesma campanha podia
// aparecer em posições diferentes nas duas páginas do mesmo site.
//
// A ordem é: principal primeiro, depois a posição definida no painel, e o
// empate cai para a mais recente, que era o único critério que existia antes.

/**
 * Quem aparece na vitrine.
 *
 * ACTIVE é o caso óbvio. O outro entrou por um defeito que o sorteio
 * automático criou: quando a campanha encerra, ela vira FINISHED no mesmo
 * instante em que o sorteio nasce, e com isso SUMIA da home e da lista de
 * campanhas na hora. Quem tinha comprado abria o site e não achava mais a
 * campanha, justo nos dez minutos em que ela é a coisa mais interessante do
 * site: o sorteio está para acontecer.
 *
 * Então ela fica até o sorteio TERMINAR. Depois disso sai da vitrine e passa a
 * viver na lista de ganhadores, que é onde o resultado interessa.
 *
 * Sorteio em ERROR também sai: ele exige gente olhando, e uma campanha presa
 * em "aguardando sorteio" para sempre é pior do que ela não estar ali.
 */
export const NA_VITRINE = {
  privacy: "PUBLIC" as const,
  OR: [
    { status: "ACTIVE" as const },
    {
      status: "FINISHED" as const,
      draw: { is: { status: { notIn: ["FINISHED" as const, "ERROR" as const] } } },
    },
  ],
};

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

/**
 * O selo do card para uma campanha que já encerrou e está esperando o sorteio.
 *
 * Devolve null quando não há sorteio em curso, e aí vale o selo automático de
 * venda (o "Aguardando sorteio" que já existia, calculado pelo percentual).
 * Aqui o texto não é dedução sobre a venda: é o estado real da transmissão.
 */
export function seloDoSorteio(
  status: string | null | undefined,
): string | null {
  switch (status) {
    case "WAITING_DRAW":
      return "Sorteio em breve";
    case "COUNTDOWN":
    case "DRAWING":
    case "REVEALING":
      return "Sorteio ao vivo agora";
    default:
      return null;
  }
}
