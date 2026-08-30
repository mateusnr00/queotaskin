// Busca a cotação do yuan e do dólar na AwesomeAPI.
//
// A leitura e as regras estão em src/lib/cotacao.ts, que é puro e testado.
// Aqui fica só a ida à rede, que é o pedaço que não dá para testar sem
// depender de um serviço de fora estar no ar.

import { lerCotacao, type Cotacao } from "@/lib/cotacao";

const URL_DA_COTACAO =
  "https://economia.awesomeapi.com.br/json/last/CNY-BRL,USD-BRL";

/**
 * Quanto tempo a resposta vale.
 *
 * Câmbio anda em minutos, não em segundos, e a taxa aqui é ponto de partida
 * para alguém digitar, não preço de execução de ordem. Quinze minutos deixa o
 * consumo em pouco mais de cem chamadas por dia no pior caso, contra as cem
 * mil mensais do plano gratuito.
 */
const VALIDADE_EM_SEGUNDOS = 900;

/** Rede lenta não pode segurar o diálogo de taxas aberto sem resposta. */
const TIMEOUT_EM_MS = 6000;

/**
 * A cotação de agora, ou nulo.
 *
 * Nulo, e não uma taxa qualquer: serviço fora do ar é motivo para a tela
 * dizer "não consegui buscar" e seguir aceitando o valor digitado, nunca para
 * preencher o campo com um número inventado.
 *
 * O token é opcional. A AwesomeAPI atende sem chave com resposta em cache e
 * limite menor, que já serve para um botão que alguém clica de vez em quando;
 * com AWESOMEAPI_TOKEN no ambiente, ele vai no cabeçalho. No cabeçalho e não
 * na query: chave em URL acaba em log de acesso e em histórico.
 */
export async function buscarCotacao(): Promise<Cotacao | null> {
  const token = process.env.AWESOMEAPI_TOKEN?.trim();
  try {
    const res = await fetch(URL_DA_COTACAO, {
      headers: token ? { "x-api-key": token } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_EM_MS),
      next: { revalidate: VALIDADE_EM_SEGUNDOS },
    });
    if (!res.ok) return null;
    const bruto: unknown = await res.json();
    const cotacao = lerCotacao(bruto);
    // Resposta que não trouxe nenhum dos dois pares é o mesmo que não ter
    // resposta, e vale dizer isso em vez de mostrar dois campos vazios como se
    // a busca tivesse dado certo.
    if (cotacao.cnyToBrl == null && cotacao.usdToBrl == null) return null;
    return cotacao;
  } catch {
    // Timeout, DNS, TLS, JSON quebrado: tudo cai aqui e vira "não consegui".
    return null;
  }
}
