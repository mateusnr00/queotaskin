import type { SkinWear } from "@prisma/client";

import { WEAR_STEAM } from "@/lib/cs2";

// A leitura do despejo de preços de mercado.
//
// O painel precisa do preço de centenas de skins. Perguntar uma por uma ao Mercado da
// Comunidade Steam é o que já não funciona: a rota deles é por item, não é
// documentada e é limitada por IP, e um IP de datacenter (que é de onde a
// Vercel fala) é o primeiro a apanhar. A saída é o despejo: uma resposta com o
// mercado inteiro, que a gente cruza com o catálogo.
//
// A RÉGUA CONTINUA SENDO A STEAM
//
// O despejo traz a mediana do MERCADO DA STEAM por janela de tempo: é o mesmo
// número que a consulta direta daria, entregue por um caminho que responde a
// servidor. Buff e Skinport vêm no mesmo arquivo e são ignorados de propósito,
// porque misturar mercado com mercado daria um preço que não é de lugar
// nenhum.
//
// SETE DIAS É A JANELA
//
// Um dia é curto demais: um único anúncio fora da curva mexe na mediana e o
// preço da cota sai errado. Trinta é longo demais para skin que acabou de
// mudar de patamar. Sete é o meio.
//
// EM DÓLAR
//
// O despejo cobra em dólar. A conversão para real acontece no serviço, com a
// mesma cotação da tela de Entregas.

export interface PrecoEmLote {
  /** O nome de mercado, como a fonte escreve. */
  marketName: string;
  /** Em dólar. */
  usd: number;
  /** De qual campo saiu, para o log e para a auditoria. */
  campo: string;
  /** Volume diário médio, quando a fonte informa. */
  volume: number | null;
}

// ---------------------------------------------------------------------------
// CSGOTRADER: o despejo público
// ---------------------------------------------------------------------------

/** O endereço do despejo gratuito, com a mediana da Steam por janela. */
export const URL_CSGOTRADER = "https://prices.csgotrader.app/latest/prices_v6.json";

interface JanelasDaSteam {
  last_24h?: number | string | null;
  last_7d?: number | string | null;
  last_30d?: number | string | null;
  last_90d?: number | string | null;
}

interface ItemDoCsgotrader {
  steam?: JanelasDaSteam | null;
}

function numero(valor: unknown): number | null {
  if (valor == null) return null;
  const n =
    typeof valor === "number" ? valor : Number(String(valor).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Lê o despejo do CSGOTRADER, ficando só com o bloco da Steam.
 *
 * A resposta é um objeto com o nome de mercado na chave e um bloco por
 * mercado dentro (Steam, Buff, Skinport e outros). Só o da Steam é lido: a
 * régua escolhida é o preço da Steam, e misturar mercado com mercado daria
 * um número que não é de lugar nenhum.
 *
 * A ordem das janelas é 7 dias, 30, 24 horas e 90. A de 7 é a preferida; as
 * outras entram quando ela não veio, o que acontece com item de pouco giro.
 */
export function lerDespejoDoCsgotrader(corpo: unknown): PrecoEmLote[] {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return [];

  const saida: PrecoEmLote[] = [];
  for (const [marketName, bruto] of Object.entries(
    corpo as Record<string, ItemDoCsgotrader>,
  )) {
    const steam = bruto?.steam;
    if (!steam || typeof steam !== "object") continue;

    const candidatos: [string, unknown][] = [
      ["steam_last_7d", steam.last_7d],
      ["steam_last_30d", steam.last_30d],
      ["steam_last_24h", steam.last_24h],
      ["steam_last_90d", steam.last_90d],
    ];
    for (const [campo, valor] of candidatos) {
      const usd = numero(valor);
      if (usd != null) {
        saida.push({ marketName, usd, campo, volume: null });
        break;
      }
    }
  }
  return saida;
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
 * disponíveis; o despejo tem uma linha por combinação. É esta função que liga
 * os dois.
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
