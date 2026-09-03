import type { SkinWear } from "@prisma/client";

import { separarFaseDaDoppler, WEAR_STEAM } from "@/lib/cs2";

// A leitura do despejo de preços de mercado.
//
// O painel precisa do preço de centenas de skins, 865 no catálogo de hoje.
// Perguntar uma por uma ao Mercado da Comunidade Steam é o que já não funciona:
// a rota deles é por item, não é documentada e é limitada por IP, e um IP de
// datacenter (que é de onde a Vercel fala) é o primeiro a apanhar. Fossem cinco
// desgastes por skin, seriam mais de quatro mil chamadas por clique. A saída é
// o despejo: uma resposta com o mercado inteiro, que a gente cruza com o
// catálogo.
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
// MAIS DE UMA FONTE, E DE PROPÓSITO
//
// A primeira tentativa apostou num endereço só e ele respondeu uma página HTML
// em vez do arquivo: fonte gratuita de terceiro sai do ar, muda de caminho e
// não avisa ninguém. Agora são várias, tentadas em ordem, cada uma com o seu
// leitor. Uma fora do ar deixou de ser o fim do recurso.
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
  /** A fase da Doppler, quando a fonte separa. */
  fase: string | null;
}

function numero(valor: unknown): number | null {
  if (valor == null) return null;
  const n =
    typeof valor === "number" ? valor : Number(String(valor).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------------------------------------------------------------------------
// CSGOTRADER
// ---------------------------------------------------------------------------

interface JanelasDaSteam {
  last_24h?: number | string | null;
  last_7d?: number | string | null;
  last_30d?: number | string | null;
  last_90d?: number | string | null;
  /** As fases, quando a fonte separa: { "Phase 1": 812.4, "Ruby": 1990 }. */
  doppler?: Record<string, unknown> | null;
}

interface ItemDoCsgotrader {
  steam?: JanelasDaSteam | null;
}

/** A ordem das janelas: 7 dias manda, as outras entram quando ela não veio. */
const JANELAS_DO_CSGOTRADER: [string, keyof JanelasDaSteam][] = [
  ["steam_last_7d", "last_7d"],
  ["steam_last_30d", "last_30d"],
  ["steam_last_24h", "last_24h"],
  ["steam_last_90d", "last_90d"],
];

/**
 * Lê o despejo do CSGOTRADER, ficando só com o bloco da Steam.
 *
 * A resposta é um objeto com o nome de mercado na chave e um bloco por
 * mercado dentro (Steam, Buff, Skinport e outros). Só o da Steam é lido: a
 * régua escolhida é o preço da Steam, e misturar mercado com mercado daria
 * um número que não é de lugar nenhum.
 *
 * As fases da Doppler viram linhas separadas, com o mesmo nome de mercado e a
 * fase à parte. É assim que a "★ Karambit | Doppler Phase 2" do catálogo acha
 * o preço dela em vez de herdar o da Phase 4, que custa um terço.
 */
export function lerDespejoDoCsgotrader(corpo: unknown): PrecoEmLote[] {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return [];

  const saida: PrecoEmLote[] = [];
  for (const [marketName, bruto] of Object.entries(
    corpo as Record<string, ItemDoCsgotrader>,
  )) {
    const steam = bruto?.steam;
    if (!steam || typeof steam !== "object") continue;

    for (const [campo, chave] of JANELAS_DO_CSGOTRADER) {
      const usd = numero(steam[chave]);
      if (usd != null) {
        saida.push({ marketName, usd, campo, volume: null, fase: null });
        break;
      }
    }

    const fases = steam.doppler;
    if (fases && typeof fases === "object" && !Array.isArray(fases)) {
      for (const [fase, valor] of Object.entries(fases)) {
        // A fase pode vir como número solto ou como o mesmo bloco de janelas.
        const usd =
          numero(valor) ??
          (valor && typeof valor === "object"
            ? numero((valor as JanelasDaSteam).last_7d) ??
              numero((valor as JanelasDaSteam).last_30d)
            : null);
        if (usd == null) continue;
        saida.push({
          marketName,
          usd,
          campo: "steam_doppler",
          volume: null,
          fase: fase.trim(),
        });
      }
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// CSGOBACKPACK
// ---------------------------------------------------------------------------

interface JanelaDoBackpack {
  average?: number | string | null;
  median?: number | string | null;
  sold?: number | string | null;
}

/**
 * Lê o despejo do CSGOBACKPACK.
 *
 * Outro formato, mesma régua: os números dele saem do histórico do Mercado da
 * Steam. A mediana é preferida à média pelo mesmo motivo de sempre, um anúncio
 * fora da curva não pode mexer no preço da cota.
 */
export function lerDespejoDoCsgobackpack(corpo: unknown): PrecoEmLote[] {
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return [];
  const lista = (corpo as { items_list?: unknown }).items_list;
  if (!lista || typeof lista !== "object" || Array.isArray(lista)) return [];

  const janelas: [string, string][] = [
    ["backpack_7_days", "7_days"],
    ["backpack_30_days", "30_days"],
    ["backpack_24_hours", "24_hours"],
    ["backpack_all_time", "all_time"],
  ];

  const saida: PrecoEmLote[] = [];
  for (const [marketName, bruto] of Object.entries(
    lista as Record<string, { price?: Record<string, JanelaDoBackpack> }>,
  )) {
    const preco = bruto?.price;
    if (!preco || typeof preco !== "object") continue;

    for (const [campo, chave] of janelas) {
      const janela = preco[chave];
      if (!janela || typeof janela !== "object") continue;
      const usd = numero(janela.median) ?? numero(janela.average);
      if (usd == null) continue;
      saida.push({
        marketName,
        usd,
        campo,
        volume: numero(janela.sold),
        fase: null,
      });
      break;
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// AS FONTES, EM ORDEM
// ---------------------------------------------------------------------------

export interface FonteDeDespejo {
  /** O nome que aparece na tela e no log quando ela responde ou falha. */
  nome: string;
  url: string;
  ler: (corpo: unknown) => PrecoEmLote[];
}

/**
 * Os cabeçalhos de quem não é robô.
 *
 * A primeira tentativa levou 403 de uma fonte e uma página HTML da outra, as
 * duas assinaturas de proteção anti-bot: o desafio do Cloudflare responde 200
 * com HTML, não 403, e é por isso que as duas falhas diferentes têm a mesma
 * causa. O `fetch` do Node se anuncia como "node" e é barrado na porta.
 *
 * Não é disfarce para furar limite: são arquivos públicos, um pedido por
 * clique, e a identificação é a de um navegador comum porque é o que esses
 * servidores aceitam.
 */
const COMO_NAVEGADOR = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
} as const;

/** Os cabeçalhos de uma ida à rede, iguais para todas as fontes. */
export function cabecalhosDoDespejo(): Record<string, string> {
  return { ...COMO_NAVEGADOR };
}

/**
 * As fontes tentadas, em ordem, até uma responder.
 *
 * `PRECOS_DESPEJO_URL` entra na frente de todas quando existe, com o leitor do
 * CSGOTRADER. É a válvula para trocar de endereço sem esperar por um deploy de
 * código, que é exatamente o aperto em que esse recurso já esteve.
 */
export function fontesDeDespejo(
  urlDoAmbiente?: string | null,
): FonteDeDespejo[] {
  const fontes: FonteDeDespejo[] = [];
  const daEnv = urlDoAmbiente?.trim();
  if (daEnv) {
    fontes.push({
      nome: "endereço do ambiente",
      url: daEnv,
      ler: lerDespejoDoCsgotrader,
    });
  }
  fontes.push(
    {
      nome: "csgotrader",
      url: "https://prices.csgotrader.app/latest/prices_v6.json",
      ler: lerDespejoDoCsgotrader,
    },
    {
      nome: "csgobackpack",
      url: "https://csgobackpack.net/api/GetItemsList/v2/?prices=true",
      ler: lerDespejoDoCsgobackpack,
    },
  );
  return fontes;
}

// ---------------------------------------------------------------------------
// OS NOMES
// ---------------------------------------------------------------------------

export interface NomeDeMercado {
  /** O nome que o catálogo guarda: sem acabamento e sem fase. */
  base: string;
  wear: SkinWear | null;
  statTrak: boolean;
  souvenir: boolean;
  /** A fase da Doppler, quando o nome traz. */
  fase: string | null;
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
 *
 * A fase só sai do nome quando o que sobra termina em "Doppler". Sem essa
 * trava, uma skin que por acaso terminasse em "Emerald" perderia a última
 * palavra e deixaria de casar com coisa nenhuma.
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

  const comFase = separarFaseDaDoppler(nome);
  const fase: string | null = comFase.fase;
  nome = comFase.base;

  if (!nome) return null;
  return { base: nome, wear, statTrak, souvenir, fase };
}

/** A chave de comparação de nomes: sem caixa e sem espaço sobrando. */
export function chaveDoNome(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, " ");
}
