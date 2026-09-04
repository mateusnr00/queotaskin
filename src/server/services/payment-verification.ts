// VERIFICAÇÃO DE PAGAMENTO. A regra central do P0.
//
// Um POST de webhook é SINAL, não prova. Nada aqui aprova por causa do corpo
// do webhook. Para chegar a VERIFIED_APPROVED é preciso que a API do gateway,
// consultada server-to-server pelo externalId JÁ GRAVADO, confirme o
// pagamento. Gateway em silêncio, transação inexistente ou status diferente
// de aprovado => NÃO aprova. Fail-closed.
//
// Injeção de dependências (`deps`) para os testes exercitarem cada ramo sem
// tocar rede nem gateway real.

import { prisma } from "@/lib/db";
import {
  getProviderForRaffle,
  type PaymentProviderClient,
} from "@/server/services/payment-provider";
import { normalizeBRLToCents, reaisParaCentavos } from "@/lib/pagamentos/dinheiro";

// Providers cuja consulta oficial EXPÕE o valor bruto: para eles, amount é
// OBRIGATÓRIO para aprovar. Sem fallback "verifico só status".
const VALOR_OBRIGATORIO = new Set(["NEXUSPAG", "HORSEPAY"]);

// Providers cuja consulta oficial expõe a IDENTIDADE (id) da transação e cujo
// binding depende dela: para eles a identidade é OBRIGATÓRIA - sem id na
// resposta autoritativa, ou id divergente do externalId gravado, NÃO aprova
// (fail-closed). HorsePay: o externalId é o `id` numérico da cobrança, e a
// consulta devolve esse mesmo `id`, então exigimos a igualdade como prova de
// que a resposta é da transação certa (fecha confused-deputy).
const IDENTIDADE_OBRIGATORIA = new Set(["HORSEPAY"]);

/**
 * Normaliza um id de transação para comparação SEGURA, sem coerção perigosa.
 *
 *  - number: só inteiro seguro >= 0 vira string canônica (`12345` -> "12345");
 *    NaN, Infinity, float, negativo -> null.
 *  - string: trim; não-vazia passa como está.
 *  - qualquer outra coisa (null, undefined, objeto, array) -> null.
 *
 * NUNCA faz parseInt/Number de string: `parseInt("12345abc")` = 12345 casaria
 * um id adulterado. Aqui "12345abc" fica "12345abc" e a comparação estrita
 * falha contra "12345". Permite a equivalência segura 12345 == "12345".
 */
export function normalizeProviderId(v: unknown): string | null {
  if (typeof v === "number") {
    return Number.isSafeInteger(v) && v >= 0 ? String(v) : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    return s.length > 0 ? s : null;
  }
  return null;
}

export type ResultadoDaVerificacao =
  | "VERIFIED_APPROVED" // o gateway confirmou o pagamento
  | "VERIFIED_PENDING" // gateway conhece a transação, ainda não paga
  | "VERIFIED_FAILED" // gateway diz recusado/cancelado
  | "INVALID" // inconsistência: provider/externalId não batem, ou valor diverge
  | "UNVERIFIABLE"; // gateway indisponível ou sem meio de consultar

export interface VerificacaoDePagamento {
  resultado: ResultadoDaVerificacao;
  /** Detalhe curto para o log estruturado. Nunca payload sensível. */
  detalhe: string;
  /** Valor confirmado pelo gateway em CENTAVOS, quando o provedor expõe. */
  centavosConfirmados: number | null;
  /** Como se verificou: S2S_STATUS ou S2S_STATUS_AMOUNT (forte). */
  metodo: string;
}

export interface EntradaDaVerificacao {
  paymentId: string;
  /** provider afirmado pela ROTA que recebeu o webhook. */
  providerDaRota: string;
  /** externalId afirmado pelo CORPO do webhook. */
  externalIdDoWebhook: string;
}

export interface DepsDaVerificacao {
  resolverProvider?: typeof getProviderForRaffle;
  buscarPagamento?: (paymentId: string) => Promise<{
    provider: string;
    externalId: string;
    amount: unknown;
    reservation: { raffleId: string } | null;
  } | null>;
  /** Extrai o valor do `raw` do gateway. Retorna null quando o provedor não expõe. */
  extrairValor?: (raw: unknown) => number | null;
}

export async function verifyPayment(
  entrada: EntradaDaVerificacao,
  deps: DepsDaVerificacao = {},
): Promise<VerificacaoDePagamento> {
  const resolver = deps.resolverProvider ?? getProviderForRaffle;
  const buscar = deps.buscarPagamento ?? padraoBuscarPagamento;
  const extrairValor = deps.extrairValor ?? (() => null); // nenhum gateway expõe valor hoje

  // 1. Payment existe internamente.
  const pg = await buscar(entrada.paymentId);
  if (!pg) return v("INVALID", "pagamento inexistente");

  // 2. pertence a uma reserva/sorteio.
  if (!pg.reservation) return v("INVALID", "reserva do pagamento sumiu");

  // 3. provider da rota corresponde ao Payment.
  if (pg.provider !== entrada.providerDaRota) {
    return v("INVALID", "provider da rota diverge do pagamento");
  }

  // 4. externalId do webhook corresponde ao externalId gravado.
  if (pg.externalId !== entrada.externalIdDoWebhook) {
    return v("INVALID", "externalId do webhook diverge do gravado");
  }

  // 5+6. o gateway reconhece a transação e diz o status. Server-to-server,
  // pelo externalId GRAVADO (nunca por valor vindo do webhook).
  const resolucao = await resolver(pg.reservation.raffleId);
  if (!resolucao.ok) return v("UNVERIFIABLE", `provider não resolvido: ${resolucao.code}`);
  const provider: PaymentProviderClient = resolucao.provider;
  if (!provider.getStatus) return v("UNVERIFIABLE", "provider sem consulta server-to-server");

  // Timeout na fronteira financeira (§16): a consulta que pendura NUNCA vira
  // aprovação. Fail-closed para timeout/500/401/JSON inválido.
  const TIMEOUT_MS = 10_000;
  let consulta: Awaited<ReturnType<NonNullable<PaymentProviderClient["getStatus"]>>>;
  try {
    consulta = await Promise.race([
      provider.getStatus(pg.externalId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(Object.assign(new Error("timeout"), { name: "TimeoutError" })), TIMEOUT_MS),
      ),
    ]);
  } catch (e) {
    return v("UNVERIFIABLE", `gateway não confirmável: ${(e as Error).name}`, null, "S2S_STATUS");
  }

  // Status não-aprovado decide cedo (não precisa de valor para recusar).
  if (consulta.status === "REJECTED") return v("VERIFIED_FAILED", "gateway recusou", null, "S2S_STATUS");
  if (consulta.status !== "APPROVED") return v("VERIFIED_PENDING", "gateway ainda pendente", null, "S2S_STATUS");

  // IDENTIDADE (§7/§8): a resposta autoritativa precisa ser da MESMA transação.
  // Fecha o confused-deputy mesmo que valor e status coincidam.
  if (IDENTIDADE_OBRIGATORIA.has(pg.provider)) {
    // STRONG por id: a identidade é OBRIGATÓRIA. Sem id na consulta, ou id que
    // não bate (comparação normalizada, sem coerção perigosa), NÃO aprova.
    const idEsperado = normalizeProviderId(pg.externalId);
    const idGateway = normalizeProviderId(consulta.identity?.id);
    if (idEsperado == null || idGateway == null || idGateway !== idEsperado) {
      return v("INVALID", "identidade da transação ausente ou divergente na consulta", null, "S2S_STATUS_AMOUNT");
    }
  } else {
    // Demais: se o gateway devolve identidade, ela precisa bater; se não
    // devolve, o binding já vem de a consulta ser feita pelo externalId gravado.
    const idGateway = consulta.identity?.id;
    if (idGateway != null && idGateway !== pg.externalId) {
      return v("INVALID", "identidade da transação no gateway diverge do Payment", null, "S2S_STATUS");
    }
  }

  const centavosEsperado = reaisParaCentavos(Number(pg.amount));

  // VALOR OBRIGATÓRIO para providers que o expõem (NexusPag). Sem fallback.
  if (VALOR_OBRIGATORIO.has(pg.provider)) {
    if (consulta.amountBrl == null) {
      return v("INVALID", "amount ausente na consulta (obrigatório para este provider)", null, "S2S_STATUS_AMOUNT");
    }
    const centavos = normalizeBRLToCents(consulta.amountBrl);
    if (!centavos.ok) {
      return v("INVALID", `amount inválido: ${centavos.motivo}`, null, "S2S_STATUS_AMOUNT");
    }
    if (centavos.centavos !== centavosEsperado) {
      return v("INVALID", "amount do gateway diverge do esperado", centavos.centavos, "S2S_STATUS_AMOUNT");
    }
    return v("VERIFIED_APPROVED", "gateway confirmou status e valor", centavos.centavos, "S2S_STATUS_AMOUNT");
  }

  // Demais providers: valor não exposto oficialmente ainda. Aprova por status.
  const talvezValor = extrairValor(consulta.raw);
  if (talvezValor != null) {
    const c = normalizeBRLToCents(talvezValor);
    if (!c.ok || c.centavos !== centavosEsperado) {
      return v("INVALID", "valor do gateway diverge do esperado", null, "S2S_STATUS");
    }
  }
  return v("VERIFIED_APPROVED", "gateway confirmou status", null, "S2S_STATUS");
}

function v(
  resultado: ResultadoDaVerificacao,
  detalhe: string,
  centavosConfirmados: number | null = null,
  metodo = "S2S_STATUS",
): VerificacaoDePagamento {
  return { resultado, detalhe, centavosConfirmados, metodo };
}

async function padraoBuscarPagamento(paymentId: string) {
  return prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      provider: true,
      externalId: true,
      amount: true,
      reservation: { select: { raffleId: true } },
    },
  });
}
