// Ponte entre o catálogo de skins do painel e a base pública de itens de
// Counter-Strike.
//
// A FONTE
//
// ByMykel/CSGO-API, os arquivos public/api/en/skins.json (5,2 MB, 2126 itens
// agrupados por skin, cada um com a lista de desgastes) e agents.json (63).
//
// Dos três repositórios cogitados, é o único que serve: Nereziel/
// cs2-WeaponPaints é um plugin C# para servidor de CS2, com índices de pintura
// e nenhuma ficha; ByMykel/counter-strike-items é a interface, não os dados,
// e ela mesma busca deste aqui. Nada é copiado para o projeto: o script vai
// buscar na hora de adicionar e guarda um cache em disco, então o repositório
// não engorda um byte.
//
// Só entram armas, facas, luvas e agentes. Adesivo, chaveiro, pichação e
// broche moram em outros arquivos da mesma API e ficam de fora, que é o que
// foi pedido.

import type { SkinRarity, SkinWear } from "@prisma/client";

/** O que o skins.json entrega, só o que este arquivo usa. */
export interface ItemDaApi {
  id: string;
  name: string;
  image?: string | null;
  phase?: string | null;
  min_float?: number | null;
  max_float?: number | null;
  rarity?: { id?: string; name?: string } | null;
  category?: { name?: string } | null;
  collections?: { name?: string }[] | null;
  crates?: { name?: string }[] | null;
  wears?: { name?: string }[] | null;
  market_hash_name?: string | null;
}

/** Uma linha pronta para virar SkinTemplate. */
export interface EntradaDoCatalogo {
  /** Nome final, como aparece no mercado da Steam. */
  nome: string;
  imagem: string | null;
  raridade: SkinRarity | null;
  desgaste: SkinWear | null;
  /**
   * Em quais desgastes a skin existe. Vai junto porque quem cria a campanha
   * escolhe o desgaste na hora, e oferecer os cinco sempre prometeria item
   * que não existe: 504 das 2126 skins não chegam aos cinco. Agente e faca
   * sem pintura vêm com a lista vazia, que é o certo, eles não têm desgaste.
   */
  desgastesDisponiveis: SkinWear[];
  colecao: string | null;
  /** Só para o relatório; o catálogo não guarda. */
  categoria: string;
}

// Os ids de raridade da API para o enum do banco. As quatro de personagem
// não têm equivalente de arma, então vão pela cor, que é como o jogo as
// apresenta: Distinguished é azul como Mil-Spec, Exceptional é roxo como
// Restricted, Superior é rosa como Classified, Master é vermelho como Covert.
export const RARIDADE_POR_ID: Record<string, SkinRarity> = {
  rarity_common_weapon: "CONSUMER",
  rarity_uncommon_weapon: "INDUSTRIAL",
  rarity_rare_weapon: "MIL_SPEC",
  rarity_mythical_weapon: "RESTRICTED",
  rarity_legendary_weapon: "CLASSIFIED",
  rarity_ancient_weapon: "COVERT",
  rarity_contraband_weapon: "CONTRABAND",
  // Luvas. A API chama de "Extraordinary", e o enum já tinha o nome.
  rarity_ancient: "EXTRAORDINARY",
  rarity_rare_character: "MIL_SPEC",
  rarity_mythical_character: "RESTRICTED",
  rarity_legendary_character: "CLASSIFIED",
  rarity_ancient_character: "COVERT",
};

export const DESGASTE_POR_NOME: Record<string, SkinWear> = {
  "factory new": "FACTORY_NEW",
  "minimal wear": "MINIMAL_WEAR",
  "field tested": "FIELD_TESTED",
  "well worn": "WELL_WORN",
  "battle scarred": "BATTLE_SCARRED",
};

// Como o mundo do CS2 abrevia desgaste. Quem digita o nome de cabeça escreve
// "ak redline ft", não "AK-47 | Redline (Field-Tested)", e recusar isso seria
// exigir que a pessoa copiasse da Steam para poder cadastrar.
const ABREVIACOES: Record<string, string> = {
  fn: "factory new",
  mw: "minimal wear",
  ft: "field tested",
  ww: "well worn",
  bs: "battle scarred",
};

/**
 * Reduz um nome ao que dá para comparar: minúsculas, sem acento, sem os
 * enfeites que a Steam usa (a estrela das facas e luvas, o TM do StatTrak) e
 * sem pontuação, que aparece de tudo quanto é jeito. "AK-47 | Redline
 * (Field-Tested)" e "ak47 redline field tested" viram a mesma coisa.
 */
export function normalizar(termo: string): string {
  const base = termo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/★|™|\bstattrak\b|\bsouvenir\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return base
    .split(" ")
    .map((palavra) => ABREVIACOES[palavra] ?? palavra)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * O nome final da linha.
 *
 * O desgaste entra entre parênteses, escrito como a Steam escreve, com hífen.
 * A fase entra depois quando existe: sem ela, as sete fases de um Doppler
 * produzem sete linhas com o mesmo nome, e o catálogo tem nome único por
 * tenant. É também como as campanhas já são nomeadas aqui.
 */
export function nomeDoItem(
  nome: string,
  desgaste?: string | null,
  fase?: string | null,
): string {
  const partes = [nome];
  if (desgaste) partes.push(`(${desgaste})`);
  if (fase) partes.push(fase);
  return partes.join(" ");
}

/**
 * Transforma os itens da API em linhas de catálogo.
 *
 * Com `comDesgaste`, cada skin vira uma linha por desgaste, e o nome sai como
 * no mercado da Steam: "AK-47 | Redline (Field-Tested)".
 *
 * Sem ele, cada skin vira uma linha só, "AK-47 | Redline", e o campo de
 * desgaste fica vazio. É o modo que o catálogo usa: quem cria a campanha
 * escolhe a skin primeiro e o float depois, então guardar as cinco variações
 * de cada uma encheria a lista de repetição para uma escolha que é feita
 * adiante.
 *
 * A fase continua no nome nos dois modos: sem ela, as sete fases de um
 * Doppler produzem sete linhas com o mesmo nome, e o catálogo exige nome
 * único por tenant.
 */
export function montarIndice(
  skins: ItemDaApi[],
  agentes: ItemDaApi[] = [],
  { comDesgaste = true }: { comDesgaste?: boolean } = {},
): EntradaDoCatalogo[] {
  const linhas: EntradaDoCatalogo[] = [];

  for (const item of skins) {
    // Faca sem pintura ("★ Bayonet") vem sem lista de desgaste na API; ela é
    // uma linha só, sem parênteses.
    const disponiveis = (item.wears ?? [])
      .map((w) => DESGASTE_POR_NOME[normalizar(w.name ?? "")])
      .filter((d): d is SkinWear => Boolean(d));

    const desgastes = !comDesgaste
      ? [null]
      : item.wears?.length
        ? item.wears.map((w) => w.name ?? null)
        : [null];
    for (const desgaste of desgastes) {
      linhas.push({
        nome: nomeDoItem(item.name, desgaste, item.phase),
        imagem: item.image ?? null,
        raridade: RARIDADE_POR_ID[item.rarity?.id ?? ""] ?? null,
        desgaste: desgaste
          ? (DESGASTE_POR_NOME[normalizar(desgaste)] ?? null)
          : null,
        desgastesDisponiveis: disponiveis,
        // Faca e luva não pertencem a coleção, vêm de caixa: 671 dos 2126
        // itens têm collections vazio, e para boa parte deles a caixa é a
        // procedência que existe. "Chroma Case" diz mais que nada.
        colecao: item.collections?.[0]?.name ?? item.crates?.[0]?.name ?? null,
        categoria: item.category?.name ?? "?",
      });
    }
  }

  for (const agente of agentes) {
    linhas.push({
      nome: agente.name,
      imagem: agente.image ?? null,
      raridade: RARIDADE_POR_ID[agente.rarity?.id ?? ""] ?? null,
      // Agente não tem desgaste: é personagem, não pintura.
      desgaste: null,
      desgastesDisponiveis: [],
      colecao: agente.collections?.[0]?.name ?? agente.crates?.[0]?.name ?? null,
      categoria: "Agents",
    });
  }

  return linhas;
}

/**
 * A chave de comparação exata: o normalizado sem os espaços.
 *
 * Existe porque a pontuação vira espaço e nem todo mundo digita a pontuação
 * no mesmo lugar. "AK-47" normaliza para "ak 47" e "ak47" continua "ak47";
 * como texto separado por espaço, os dois nunca se encontram. Sem espaço
 * nenhum, encontram. Foi um teste que mostrou isso, não a leitura do código.
 *
 * O normalizado com espaço continua existindo porque a pontuação por palavras
 * em comum, que gera as sugestões, precisa das palavras.
 */
export function chaveDeBusca(termo: string): string {
  return normalizar(termo).replace(/ /g, "");
}

export interface Achado {
  exata: EntradaDoCatalogo | null;
  /** Quando não há exata: os nomes mais parecidos, para o relatório. */
  sugestoes: EntradaDoCatalogo[];
}

/**
 * Procura uma linha pelo que foi digitado.
 *
 * Exata primeiro, comparando os nomes normalizados. Falhando, pontua por
 * palavras em comum e devolve os mais próximos, porque errar um cadastro em
 * silêncio é pior do que dizer "não achei, você quis dizer isto?".
 */
export function procurar(
  termo: string,
  indice: EntradaDoCatalogo[],
  quantasSugestoes = 5,
): Achado {
  const alvo = normalizar(termo);
  if (!alvo) return { exata: null, sugestoes: [] };

  const chave = chaveDeBusca(termo);
  const exata = indice.find((l) => chaveDeBusca(l.nome) === chave);
  if (exata) return { exata, sugestoes: [] };

  // Prefixo único também é acerto. Agente se chama "Bloody Darryl The
  // Strapped | The Professionals", e ninguém digita o grupo depois da barra;
  // como o começo só cabe num item, não há o que confundir. Vale para o
  // começo e não para qualquer pedaço porque "ak47redline" é começo de cinco
  // linhas, uma por desgaste, e aí a escolha teria de ser adivinhada.
  const porPrefixo = indice.filter((l) => chaveDeBusca(l.nome).startsWith(chave));
  if (porPrefixo.length === 1) return { exata: porPrefixo[0], sugestoes: [] };

  const palavras = alvo.split(" ").filter(Boolean);

  // Palavra rara vale mais que palavra comum. Sem isso, "m4a4 howl bs" (que
  // não existe, o Howl não chega a Battle-Scarred) sugeria outras M4A4 em
  // Battle-Scarred, porque "m4a4", "battle" e "scarred" somavam três acertos
  // contra o único "howl". O peso é o inverso de quantas linhas contêm a
  // palavra: "battle" aparece em 1650 e "howl" em 4, então "howl" decide.
  const frequencia = new Map<string, number>();
  for (const palavra of palavras) {
    frequencia.set(
      palavra,
      indice.filter((l) => normalizar(l.nome).includes(palavra)).length,
    );
  }

  const pontuadas = indice
    .map((linha) => {
      const normalizado = normalizar(linha.nome);
      let peso = 0;
      let acertos = 0;
      for (const palavra of palavras) {
        if (!normalizado.includes(palavra)) continue;
        acertos++;
        peso += 1 / (frequencia.get(palavra) || 1);
      }
      // Empate desempata pelo nome mais curto: entre "AK-47 | Redline" e
      // "AK-47 | Redline (Field-Tested)", quem digitou pouco quis o curto.
      return { linha, peso, acertos, tamanho: normalizado.length };
    })
    .filter((x) => x.acertos > 0)
    .sort((a, b) => b.peso - a.peso || a.tamanho - b.tamanho);

  return {
    exata: null,
    sugestoes: pontuadas.slice(0, quantasSugestoes).map((x) => x.linha),
  };
}
