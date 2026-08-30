// Busca a cotação PTAX no Olinda, a API aberta do Banco Central.
//
// A leitura e as regras estão em src/lib/ptax.ts, que é puro e testado. Aqui
// fica só a ida à rede, que é o pedaço que não dá para testar sem depender de
// um serviço de fora estar no ar.
//
// Sem chave: o Olinda é aberto. Nada para guardar, nada para rotacionar.

import {
  dataParaPtax,
  inicioDaJanela,
  JANELA_EM_DIAS,
  lerPeriodoPtax,
  type CotacaoPtax,
} from "@/lib/ptax";
import {
  dataParaAwesome,
  fechamentoAte,
  lerDiarioAwesome,
  lerUltimaAwesome,
} from "@/lib/awesome";
import type { Cotacao } from "@/lib/cotacao";

const BASE =
  "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)";

/** Rede lenta não pode segurar a tela esperando resposta. */
const TIMEOUT_EM_MS = 8000;

/**
 * Quanto tempo a resposta vale.
 *
 * PTAX é boletim diário: buscar de novo dentro da mesma hora devolveria o
 * mesmo número. Uma hora é folgado e mantém o Olinda longe de qualquer aperto.
 */
const VALIDADE_EM_SEGUNDOS = 3600;

/**
 * A cotação PTAX de uma moeda no dia pedido, ou no último dia útil antes dele.
 *
 * Pede um PERÍODO e não um dia, de propósito: fim de semana e feriado não têm
 * boletim, e pedir dia a dia andando para trás seriam várias idas à rede para
 * responder uma pergunta só. Com período, a mesma requisição já traz o último
 * boletim que existe na janela.
 *
 * Nulo quando não há boletim na janela inteira, ou quando a rede falhou. Nulo e
 * não um número qualquer: taxa inventada vira custo errado no relatório com
 * cara de custo certo.
 */
export async function cotacaoPtax(
  moeda: "CNY" | "USD",
  ate: Date,
): Promise<CotacaoPtax | null> {
  const q = new URLSearchParams({
    "@moeda": `'${moeda}'`,
    "@dataInicial": `'${dataParaPtax(inicioDaJanela(ate))}'`,
    "@dataFinalCotacao": `'${dataParaPtax(ate)}'`,
    $format: "json",
  });
  try {
    const res = await fetch(`${BASE}?${q}`, {
      signal: AbortSignal.timeout(TIMEOUT_EM_MS),
      next: { revalidate: VALIDADE_EM_SEGUNDOS },
    });
    if (!res.ok) return null;
    return lerPeriodoPtax(await res.json());
  } catch {
    // Timeout, DNS, TLS, JSON quebrado: tudo cai aqui e vira "não consegui".
    return null;
  }
}

const AWESOME = "https://economia.awesomeapi.com.br/json";

/** De onde a taxa veio. Fica gravado na entrega: número sem procedência não
 * se confere depois. */
export type FonteDoCambio = "PTAX" | "AWESOMEAPI";

export interface CambioDoDia {
  taxa: number;
  /** O dia do fechamento usado, que pode ser anterior ao pedido. */
  quando: Date;
  fonte: FonteDoCambio;
}

/**
 * O que uma tentativa de buscar câmbio produziu.
 *
 * As notas existem porque a versão anterior falhava em SILÊNCIO: quando
 * nenhuma fonte respondia por uma moeda, a tela mostrava um traço e não havia
 * como saber se foi 404, timeout, moeda inexistente ou janela sem fechamento.
 * Diagnosticar isso exigia acesso à rede que nem sempre se tem.
 */
export interface TentativaDeCambio {
  cambio: CambioDoDia | null;
  /** Uma linha por fonte consultada, dizendo o que ela respondeu. */
  notas: string[];
}

/** Uma ida à AwesomeAPI, com o motivo da falha quando falha. */
async function pedirAwesome(
  caminho: string,
  ler: (bruto: unknown) => CambioDoDia | null,
): Promise<TentativaDeCambio> {
  const token = process.env.AWESOMEAPI_TOKEN?.trim();
  try {
    const res = await fetch(`${AWESOME}/${caminho}`, {
      // No cabeçalho e não na query: chave em URL acaba em log de acesso.
      headers: token ? { "x-api-key": token } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_EM_MS),
      next: { revalidate: VALIDADE_EM_SEGUNDOS },
    });
    if (!res.ok) {
      // 404 aqui quer dizer "esse par não existe", que é resposta e não erro.
      return {
        cambio: null,
        notas: [
          `AwesomeAPI: HTTP ${res.status}` +
            (res.status === 404 ? " (par inexistente)" : ""),
        ],
      };
    }
    const cambio = ler(await res.json());
    return {
      cambio,
      notas: cambio ? [] : ["AwesomeAPI: respondeu sem cotação utilizável"],
    };
  } catch (e) {
    // "TypeError" sozinho não ajuda ninguém: o fetch do Node lança isso para
    // qualquer falha de rede, e o que interessa está na causa (ECONNREFUSED,
    // ENOTFOUND, e por aí). Timeout vem como AbortError, que já é claro.
    const causa = (e as { cause?: { code?: string } })?.cause?.code;
    const nome = e instanceof Error ? e.name : "erro";
    return {
      cambio: null,
      notas: [
        `AwesomeAPI: ${causa ?? (nome === "TimeoutError" ? "tempo esgotado" : nome)}`,
      ],
    };
  }
}

/** O câmbio de AGORA, pelo /json/last. */
function awesomeAgora(moeda: "CNY" | "USD"): Promise<TentativaDeCambio> {
  const par = `${moeda}-BRL`;
  return pedirAwesome(`last/${par}`, (bruto) => {
    const d = lerUltimaAwesome(bruto, par);
    return d ? { taxa: d.taxa, quando: d.quando, fonte: "AWESOMEAPI" } : null;
  });
}

/**
 * O câmbio de um dia passado, pelo fechamento diário.
 *
 * /json/last serve para hoje e não para ontem; /json/daily aceita start_date e
 * end_date, e é o que permite gravar o câmbio do dia em que a skin saiu.
 *
 * Pede um PERÍODO pelo mesmo motivo do PTAX: fim de semana não fecha.
 */
function awesomeNoDia(
  moeda: "CNY" | "USD",
  ate: Date,
): Promise<TentativaDeCambio> {
  const inicio = new Date(ate);
  inicio.setUTCDate(inicio.getUTCDate() - JANELA_EM_DIAS);
  const q = new URLSearchParams({
    start_date: dataParaAwesome(inicio),
    end_date: dataParaAwesome(ate),
  });
  return pedirAwesome(`daily/${moeda}-BRL/30?${q}`, (bruto) => {
    const d = fechamentoAte(lerDiarioAwesome(bruto), ate);
    return d ? { taxa: d.taxa, quando: d.quando, fonte: "AWESOMEAPI" } : null;
  });
}

/**
 * O câmbio de um dia, com a AwesomeAPI na frente.
 *
 * A ordem era PTAX primeiro, por ele ser a taxa oficial. Foi invertida porque
 * o PTAX NÃO PUBLICA O YUAN: em produção ele serviu o dólar e devolveu vazio
 * para CNY. Manter a fonte oficial na frente de uma moeda que ela não tem é
 * gastar uma ida à rede para receber nada, em toda anotação de custo.
 *
 * O PTAX continua atrás, e ainda ganha quando a AwesomeAPI não responde. Para
 * o dólar ele segue sendo quem cobre a falha com a taxa oficial.
 */
export async function cambioDoDia(
  moeda: "CNY" | "USD",
  ate: Date,
  { deHoje = false }: { deHoje?: boolean } = {},
): Promise<TentativaDeCambio> {
  const a = deHoje ? await awesomeAgora(moeda) : await awesomeNoDia(moeda, ate);
  if (a.cambio) return a;

  const ptax = await cotacaoPtax(moeda, ate);
  if (ptax) {
    return {
      cambio: { taxa: ptax.taxa, quando: ptax.dataDoBoletim, fonte: "PTAX" },
      notas: a.notas,
    };
  }
  return {
    cambio: null,
    notas: [...a.notas, "PTAX: sem boletim para essa moeda na janela"],
  };
}

/**
 * As duas taxas de uma data, no formato que a tela e o banco usam.
 *
 * As duas moedas são independentes: se o Olinda publicar uma e não a outra, a
 * que veio continua valendo. Derrubar as duas por causa de uma seria jogar
 * fora informação boa.
 */
export async function cotacaoDoDia(
  data: Date,
  opcoes?: { deHoje?: boolean },
): Promise<
  | (Cotacao & {
      fonteCny: FonteDoCambio | null;
      fonteUsd: FonteDoCambio | null;
      notasCny: string[];
      notasUsd: string[];
    })
  | null
> {
  const [c, u] = await Promise.all([
    cambioDoDia("CNY", data, opcoes),
    cambioDoDia("USD", data, opcoes),
  ]);
  const cny = c.cambio;
  const usd = u.cambio;
  const dias = [cny?.quando, usd?.quando].filter((d): d is Date => d != null);
  return {
    cnyToBrl: cny?.taxa ?? null,
    usdToBrl: usd?.taxa ?? null,
    // Uma por moeda: as duas podem vir de fontes diferentes, e um rótulo só
    // acabaria creditando à AwesomeAPI um dólar que veio do Banco Central.
    fonteCny: cny?.fonte ?? null,
    fonteUsd: usd?.fonte ?? null,
    // Só quando faltou: nota de sucesso seria ruído.
    notasCny: cny ? [] : c.notas,
    notasUsd: usd ? [] : u.notas,
    // A mais recente das duas: mostrar a mais velha faria a cotação parecer
    // mais defasada do que está.
    atualizadaEm: dias.length
      ? new Date(Math.max(...dias.map((d) => d.getTime())))
      : null,
  };
}

/** A cotação de agora, pelo endpoint de tempo real. */
export function buscarCotacao() {
  return cotacaoDoDia(new Date(), { deHoje: true });
}
