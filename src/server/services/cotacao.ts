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
  lerPeriodoPtax,
  type CotacaoPtax,
} from "@/lib/ptax";
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

/**
 * As duas taxas de uma data, no formato que a tela e o banco usam.
 *
 * As duas moedas são independentes: se o Olinda publicar uma e não a outra, a
 * que veio continua valendo. Derrubar as duas por causa de uma seria jogar
 * fora informação boa.
 */
export async function cotacaoDoDia(data: Date): Promise<Cotacao | null> {
  const [cny, usd] = await Promise.all([
    cotacaoPtax("CNY", data),
    cotacaoPtax("USD", data),
  ]);
  if (!cny && !usd) return null;
  const dias = [cny?.dataDoBoletim, usd?.dataDoBoletim].filter(
    (d): d is Date => d != null,
  );
  return {
    cnyToBrl: cny?.taxa ?? null,
    usdToBrl: usd?.taxa ?? null,
    // A mais recente das duas: mostrar a mais velha faria a cotação parecer
    // mais defasada do que está.
    atualizadaEm: dias.length
      ? new Date(Math.max(...dias.map((d) => d.getTime())))
      : null,
  };
}

/** A cotação mais recente que existe hoje. */
export function buscarCotacao(): Promise<Cotacao | null> {
  return cotacaoDoDia(new Date());
}
