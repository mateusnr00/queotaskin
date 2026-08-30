// A leitura dos times, agora que eles moram no banco.
//
// Tudo aqui devolve `TimeDeCS2`, o mesmo formato que os componentes já
// esperavam quando a lista era constante. Foi de propósito: trocar de onde a
// lista vem não deveria mudar o que as telas recebem.

import { cache } from "react";

import { prisma } from "@/lib/db";
import type { RegiaoDoTime, TimeDeCS2 } from "@/lib/times-cs2";

function paraTime(t: {
  id: string;
  nome: string;
  tag: string;
  cor: string;
  regiao: string;
  escudo: string | null;
}): TimeDeCS2 {
  return {
    id: t.id,
    nome: t.nome,
    tag: t.tag,
    cor: t.cor,
    // A coluna é texto livre no banco. Qualquer coisa fora das duas regiões
    // conhecidas cai em internacional, que é o balde certo para um time que
    // não é brasileiro.
    regiao: (t.regiao === "BR" ? "BR" : "INTER") as RegiaoDoTime,
    escudo: t.escudo,
  };
}

/**
 * Os times que o participante pode escolher.
 *
 * `cache` do React: a página da campanha e a da conta podem pedir a lista mais
 * de uma vez na mesma renderização, e sem isso seriam várias idas ao banco
 * para a mesma resposta. O cache vale por requisição, então uma edição no
 * painel aparece na requisição seguinte, sem invalidação manual.
 */
export const listarTimesAtivos = cache(async (): Promise<TimeDeCS2[]> => {
  const linhas = await prisma.team.findMany({
    where: { ativo: true },
    orderBy: [{ regiao: "asc" }, { ordem: "asc" }, { nome: "asc" }],
  });
  return linhas.map(paraTime);
});

/**
 * TODOS os times, inclusive os desativados. É a lista do painel.
 *
 * O público nunca usa esta: time desativado sai do seletor de propósito.
 */
export const listarTodosOsTimes = cache(
  async (): Promise<(TimeDeCS2 & { ativo: boolean; ordem: number })[]> => {
    const linhas = await prisma.team.findMany({
      orderBy: [{ regiao: "asc" }, { ordem: "asc" }, { nome: "asc" }],
    });
    return linhas.map((t) => ({ ...paraTime(t), ativo: t.ativo, ordem: t.ordem }));
  },
);

/**
 * Um mapa id → time, para resolver vários de uma vez.
 *
 * É o que as listas de ganhadores precisam: elas têm N ids de time e não podem
 * fazer N consultas. Inclui os DESATIVADOS de propósito: quem já torcia por um
 * time que saiu do ar continua tendo o emblema desenhado ao lado do nome, em
 * vez de perder a identidade porque o painel arquivou o time depois.
 */
export const mapaDeTimes = cache(async (): Promise<Map<string, TimeDeCS2>> => {
  const linhas = await prisma.team.findMany();
  return new Map(linhas.map((t) => [t.id, paraTime(t)]));
});

/** Se o id existe. É o que a validação do formulário pergunta. */
export async function timeExiste(id: string): Promise<boolean> {
  return (await prisma.team.count({ where: { id, ativo: true } })) > 0;
}
