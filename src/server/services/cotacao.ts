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

const AWESOME = "https://economia.awesomeapi.com.br/json/daily";

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
 * A retaguarda: o fechamento diário da AwesomeAPI.
 *
 * Existe porque o Banco Central não publica toda moeda e nem sempre está no
 * ar, e porque deixar a entrega sem câmbio para sempre é pior do que gravar a
 * taxa de uma fonte de mercado dizendo que foi dela que veio.
 *
 * Pede um PERÍODO pelo mesmo motivo do PTAX: fim de semana não tem fechamento.
 * O token é opcional; sem ele a resposta vem de cache de um minuto, o que para
 * fechamento de dia anterior dá no mesmo.
 */
async function cambioAwesome(
  moeda: "CNY" | "USD",
  ate: Date,
): Promise<CambioDoDia | null> {
  const inicio = new Date(ate);
  inicio.setUTCDate(inicio.getUTCDate() - JANELA_EM_DIAS);
  const token = process.env.AWESOMEAPI_TOKEN?.trim();
  const q = new URLSearchParams({
    start_date: dataParaAwesome(inicio),
    end_date: dataParaAwesome(ate),
  });
  try {
    const res = await fetch(`${AWESOME}/${moeda}-BRL/30?${q}`, {
      // No cabeçalho e não na query: chave em URL acaba em log de acesso.
      headers: token ? { "x-api-key": token } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_EM_MS),
      next: { revalidate: VALIDADE_EM_SEGUNDOS },
    });
    // 404 é "essa moeda não existe", resposta legítima e não erro de rede.
    if (!res.ok) return null;
    const dia = fechamentoAte(lerDiarioAwesome(await res.json()), ate);
    return dia
      ? { taxa: dia.taxa, quando: dia.quando, fonte: "AWESOMEAPI" }
      : null;
  } catch {
    return null;
  }
}

/**
 * O câmbio de um dia, com o oficial na frente.
 *
 * PTAX primeiro porque é a taxa que a Receita espera. A AwesomeAPI entra
 * quando ele não responde por aquela moeda ou por aquele dia. As duas usam a
 * ponta de VENDA, então trocar de fonte não muda o critério, só a origem.
 */
export async function cambioDoDia(
  moeda: "CNY" | "USD",
  ate: Date,
): Promise<CambioDoDia | null> {
  const ptax = await cotacaoPtax(moeda, ate);
  if (ptax) {
    return { taxa: ptax.taxa, quando: ptax.dataDoBoletim, fonte: "PTAX" };
  }
  return cambioAwesome(moeda, ate);
}

/**
 * As duas taxas de uma data, no formato que a tela e o banco usam.
 *
 * As duas moedas são independentes: se o Olinda publicar uma e não a outra, a
 * que veio continua valendo. Derrubar as duas por causa de uma seria jogar
 * fora informação boa.
 */
export async function cotacaoDoDia(data: Date): Promise<
  | (Cotacao & {
      fonteCny: FonteDoCambio | null;
      fonteUsd: FonteDoCambio | null;
    })
  | null
> {
  const [cny, usd] = await Promise.all([
    cambioDoDia("CNY", data),
    cambioDoDia("USD", data),
  ]);
  if (!cny && !usd) return null;
  const dias = [cny?.quando, usd?.quando].filter((d): d is Date => d != null);
  return {
    cnyToBrl: cny?.taxa ?? null,
    usdToBrl: usd?.taxa ?? null,
    // Uma por moeda: as duas podem vir de fontes diferentes, e um rótulo só
    // acabaria creditando à AwesomeAPI um dólar que veio do Banco Central.
    fonteCny: cny?.fonte ?? null,
    fonteUsd: usd?.fonte ?? null,
    // A mais recente das duas: mostrar a mais velha faria a cotação parecer
    // mais defasada do que está.
    atualizadaEm: dias.length
      ? new Date(Math.max(...dias.map((d) => d.getTime())))
      : null,
  };
}

/** A cotação mais recente que existe hoje. */
export function buscarCotacao() {
  return cotacaoDoDia(new Date());
}
