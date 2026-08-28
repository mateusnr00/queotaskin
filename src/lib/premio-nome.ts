// O nome do prêmio, separado em skin e desgaste, e a raridade que ele carrega.
//
// Fica no lib, e não no componente, porque quem precisa disto não é só a
// página: a action que salva os títulos premiados resolve a raridade a partir
// do mesmo nome, e um "use client" não pode ser importado por ela.

import type { SkinRarity } from "@prisma/client";

import { WEAR_LABEL, WEAR_STEAM } from "@/lib/cs2";

/** Os desgastes escritos por extenso, em ingles e em portugues. */
const DESGASTES = [
  ...Object.values(WEAR_STEAM),
  ...Object.values(WEAR_LABEL),
].map((d) => d.toLowerCase());

/**
 * Separa "AK-47 | Vulcan (Field-Tested)" em nome e desgaste.
 *
 * So corta quando o que esta entre parenteses e mesmo um desgaste conhecido:
 * cortar qualquer parentese final quebraria um premio como "Faca (2 unidades)".
 */
export function separarDesgaste(texto: string): {
  nome: string;
  desgaste: string | null;
} {
  const casa = texto.match(/^(.*)\s*\(([^()]+)\)\s*$/);
  if (!casa) return { nome: texto, desgaste: null };
  const dentro = casa[2].trim();
  if (!DESGASTES.includes(dentro.toLowerCase())) {
    return { nome: texto, desgaste: null };
  }
  return { nome: casa[1].trim(), desgaste: dentro };
}

/**
 * A raridade do prêmio, achada pelo nome no catálogo de skins.
 *
 * Resolver pelo nome, e não guardar a escolha do seletor, é o que faz a
 * colagem em massa ("número, prêmio" por linha) ganhar cor sem trabalho
 * nenhum, e o que impede a raridade de ficar velha quando alguém edita o
 * texto depois. Retorna null para prêmio que não é skin, que continua sendo
 * caso normal: "R$ 500 no Pix" é título premiado legítimo.
 */
export function raridadeDoPremio(
  premio: string,
  catalogo: Map<string, SkinRarity | null>,
): SkinRarity | null {
  const { nome } = separarDesgaste(premio);
  return catalogo.get(chaveDoNome(nome)) ?? null;
}

/** A chave de comparação: sem acento, sem caixa, sem espaço sobrando. */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
