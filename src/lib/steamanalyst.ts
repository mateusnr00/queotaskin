// A leitura do despejo da SteamAnalyst.
//
// A rota é uma só e devolve TODOS os itens de uma vez:
// GET https://api.steamanalyst.com/v2/{API_KEY}
//
// Isso decide o desenho: ela não serve para consultar uma skin. Serve para
// encher o catálogo inteiro de uma vez, e é assim que ela entra aqui. O painel
// continua perguntando o preço de UMA skin, e a resposta vem do catálogo que
// este despejo abasteceu.
//
// QUAL PREÇO USAR, SEGUNDO A PRÓPRIA DOCUMENTAÇÃO
//
// 1. Manipulação em curso (`ongoing_price_manipulation` = "1"): usar
//    `safe_price`. Nesse caso a média de 7 dias nem vem na resposta.
// 2. Item comum: `avg_price_7_days`. A documentação é explícita: é este o
//    valor para usar num projeto, e não o `current_price`.
// 3. Item raro (acima de 400 dólares, faca e luva): não existe média, existe
//    faixa sugerida. A documentação manda usar `suggested_amount_min` para a
//    maioria dos projetos, porque o máximo representa padrão e phase de alto
//    valor, que a nossa skin quase nunca é.
//
// `current_price` fica de fora em todos os casos, porque é o anúncio mais
// barato do momento, o número que qualquer um levanta ou derruba sozinho.
//
// ITEM SUSPEITO NÃO ENTRA
//
// `suspicious` marca preço fora da curva para o desgaste. Preço errado no
// catálogo vira preço de cota errado, e cota errada é dinheiro real: melhor
// não ter valor nenhum e a pessoa digitar.
//
// TUDO EM DÓLAR
//
// A SteamAnalyst responde em dólar. A conversão para real acontece no serviço,
// com a mesma cotação que a tela de Entregas já usa.

import type { SkinWear } from "@prisma/client";

import { WEAR_STEAM } from "@/lib/cs2";

export const BASE_STEAMANALYST = "https://api.steamanalyst.com/v2";

/** Um item cru do despejo, com só o que a gente lê. */
export interface ItemDaSteamAnalyst {
  market_name?: string;
  avg_price_7_days_raw?: number | string | null;
  suggested_amount_min_raw?: number | string | null;
  suggested_amount_avg_raw?: number | string | null;
  safe_price_raw?: number | string | null;
  ongoing_price_manipulation?: string | number | null;
  suspicious?: string | number | boolean | null;
  sold_last_7d?: string | number | null;
  avg_daily_volume?: string | number | null;
}

export interface PrecoLido {
  /** Em dólar. */
  usd: number;
  /** De qual campo ele saiu, para o log e para a auditoria. */
  campo: "avg_price_7_days" | "safe_price" | "suggested_amount_min";
  /** Volume diário médio, quando informado. */
  volume: number | null;
}

function numero(valor: unknown): number | null {
  if (valor == null) return null;
  const n = typeof valor === "number" ? valor : Number(String(valor).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ligado(valor: unknown): boolean {
  return valor === 1 || valor === "1" || valor === true;
}

/**
 * O preço em dólar de um item do despejo, ou null quando não dá para confiar.
 *
 * A ordem é a da documentação, e a recusa é tão importante quanto a escolha:
 * item suspeito e item sem nenhum dos três campos saem daqui como null, e o
 * catálogo simplesmente não aprende nada sobre eles.
 */
export function precoDoItem(item: ItemDaSteamAnalyst): PrecoLido | null {
  if (ligado(item.suspicious)) return null;

  const volume = numero(item.avg_daily_volume);

  if (ligado(item.ongoing_price_manipulation)) {
    const seguro = numero(item.safe_price_raw);
    return seguro == null ? null : { usd: seguro, campo: "safe_price", volume };
  }

  const media7 = numero(item.avg_price_7_days_raw);
  if (media7 != null) {
    return { usd: media7, campo: "avg_price_7_days", volume };
  }

  const minimoSugerido = numero(item.suggested_amount_min_raw);
  if (minimoSugerido != null) {
    return {
      usd: minimoSugerido,
      campo: "suggested_amount_min",
      volume,
    };
  }

  return null;
}

export interface NomeDeMercado {
  /** O nome como o catálogo guarda: sem o acabamento entre parênteses. */
  base: string;
  wear: SkinWear | null;
  statTrak: boolean;
  souvenir: boolean;
}

/**
 * Separa "★ Karambit | Fade (Factory New)" no que o catálogo guarda.
 *
 * O catálogo tem uma linha por skin, sem desgaste, e uma lista de desgastes
 * disponíveis; a SteamAnalyst tem uma linha por combinação. É esta função que
 * liga os dois.
 *
 * StatTrak e Souvenir viram sinalizador em vez de ficarem no nome, pelo mesmo
 * motivo: no catálogo eles são colunas, não parte do texto.
 */
export function lerNomeDeMercado(marketName: string): NomeDeMercado | null {
  let nome = marketName.trim();
  if (!nome) return null;

  const statTrak = nome.includes("StatTrak™");
  const souvenir = nome.startsWith("Souvenir ");
  nome = nome
    .replace(/StatTrak™\s*/g, "")
    .replace(/^Souvenir\s+/, "")
    .trim();

  let wear: SkinWear | null = null;
  const casa = nome.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (casa) {
    const dentro = casa[2]!.trim().toLowerCase();
    const achado = (Object.keys(WEAR_STEAM) as SkinWear[]).find(
      (w) => WEAR_STEAM[w].toLowerCase() === dentro,
    );
    if (achado) {
      wear = achado;
      nome = casa[1]!.trim();
    }
  }

  if (!nome) return null;
  return { base: nome, wear, statTrak, souvenir };
}

/** A chave de comparação de nomes: sem caixa e sem espaço sobrando. */
export function chaveDoNome(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}
