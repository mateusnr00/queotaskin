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
  /** Valor confirmado pelo gateway, quando o provedor o expõe. Hoje: null. */
  valorConfirmado: number | null;
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

  let consulta: { status: string; raw: unknown };
  try {
    consulta = await provider.getStatus(pg.externalId);
  } catch (e) {
    // Gateway indisponível NUNCA vira aprovação.
    return v("UNVERIFIABLE", `gateway indisponível: ${(e as Error).name}`);
  }

  // 7. valor, SE o gateway expõe. Comparado em CENTAVOS inteiros (nada de
  //    float solto), e um valor não-finito (NaN/Infinity) é divergência, não
  //    "sem valor": NaN em comparação escaparia a guarda ingênua.
  const valorGateway = extrairValor(consulta.raw);
  if (valorGateway != null) {
    if (!Number.isFinite(valorGateway)) {
      return v("INVALID", "valor do gateway não é finito", null);
    }
    const centavosGateway = Math.round(valorGateway * 100);
    const centavosEsperado = Math.round(Number(pg.amount) * 100);
    if (centavosGateway !== centavosEsperado) {
      return v("INVALID", "valor do gateway diverge do esperado", valorGateway);
    }
  }

  // 8. status consultado decide.
  if (consulta.status === "APPROVED") return v("VERIFIED_APPROVED", "gateway confirmou", valorGateway);
  if (consulta.status === "REJECTED") return v("VERIFIED_FAILED", "gateway recusou", valorGateway);
  return v("VERIFIED_PENDING", "gateway ainda pendente", valorGateway);
}

function v(
  resultado: ResultadoDaVerificacao,
  detalhe: string,
  valorConfirmado: number | null = null,
): VerificacaoDePagamento {
  return { resultado, detalhe, valorConfirmado };
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
