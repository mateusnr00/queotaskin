// REGRESSÃO HorsePay (pós-STRONG): um depósito que a HorsePay confirma como
// pago na consulta S2S ("paid" OU "approved") DEVE virar VERIFIED_APPROVED sob
// STRONG - com valor (centavos) e identidade conferidos. Antes, "approved"
// (sinônimo de pago na HorsePay) caía em PENDING e o pagamento NUNCA confirmava,
// mesmo com painel pago e webhook pago.
//
// Prova ponta a ponta: consultarDeposito REAL (fetch stubado) -> getStatus ->
// verifyPayment. O webhook continua sendo só SINAL; a autoridade é o GET S2S.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyPayment } from "@/server/services/payment-verification";
import { consultarDeposito, limparTokens } from "@/lib/horsepay";
import type { ProviderResolution } from "@/server/services/payment-provider";
import type { DepsDaVerificacao } from "@/server/services/payment-verification";

const creds = { clientKey: "k", clientSecret: "s" };
const TOKEN = { status: 200, corpo: { access_token: "tok" } };

function respondeEm(seq: { status: number; corpo: unknown }[]) {
  let i = 0;
  vi.stubGlobal("fetch", async () => {
    const r = seq[Math.min(i++, seq.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corpo,
      text: async () => JSON.stringify(r.corpo),
    } as unknown as Response;
  });
}

// deps de verifyPayment: o Payment vem do "banco" (injetado) e o provider
// HorsePay usa o consultarDeposito REAL contra o fetch stubado.
function deps(externalId: string, amount: number): DepsDaVerificacao {
  return {
    buscarPagamento: async () => ({
      provider: "HORSEPAY",
      externalId,
      amount,
      reservation: { raffleId: "r1" },
    }),
    resolverProvider: (async (): Promise<ProviderResolution> => ({
      ok: true,
      provider: {
        name: "HORSEPAY",
        webhookPath: "horsepay",
        createPixCharge: async () => ({ pixCode: "x", identifier: "x" }),
        getStatus: async (id: string) => consultarDeposito(creds, id),
      },
    })) as DepsDaVerificacao["resolverProvider"],
  };
}

const entrada = (externalId: string) => ({
  paymentId: "p1",
  providerDaRota: "HORSEPAY",
  externalIdDoWebhook: externalId,
});

describe("regressão HorsePay · S2S pago vira VERIFIED_APPROVED sob STRONG", () => {
  beforeEach(() => limparTokens());
  afterEach(() => vi.unstubAllGlobals());

  it('S2S "approved" + value exato + id == externalId => VERIFIED_APPROVED / S2S_STATUS_AMOUNT', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.01, status: "approved", end_to_end: "E1" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("VERIFIED_APPROVED");
    expect(v.metodo).toBe("S2S_STATUS_AMOUNT");
    expect(v.centavosConfirmados).toBe(101);
  });

  it('S2S "paid" também => VERIFIED_APPROVED', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.01, status: "paid" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("VERIFIED_APPROVED");
  });

  it('webhook pago mas S2S "pending" => VERIFIED_PENDING (NÃO aprova; fail-closed)', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.01, status: "pending" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("VERIFIED_PENDING");
  });

  it('STRONG preservado: "approved" + underpayment => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.0, status: "approved" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("INVALID");
  });

  it('STRONG preservado: "approved" + overpayment => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.02, status: "approved" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("INVALID");
  });

  it('STRONG preservado: "approved" + id divergente (confused-deputy) => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 999999, value: 1.01, status: "approved" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("INVALID");
  });

  it('STRONG preservado: "approved" + id ausente => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { value: 1.01, status: "approved" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("INVALID");
  });

  it('estorno "chargedback" => VERIFIED_FAILED (recusa, não aprova)', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.01, status: "chargedback" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("VERIFIED_FAILED");
  });

  // GATE 15: "success" é o status REAL de pago em produção. Prova ponta a ponta
  // + STRONG preservado (valor e identidade continuam obrigatórios).
  it('S2S "success" + value exato + id == externalId => VERIFIED_APPROVED / S2S_STATUS_AMOUNT', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.01, tax: 0.02, status: "success", end_to_end: "E1" } }]);
    const v = await verifyPayment(entrada("8123456"), deps("8123456", 1.01));
    expect(v.resultado).toBe("VERIFIED_APPROVED");
    expect(v.metodo).toBe("S2S_STATUS_AMOUNT");
    expect(v.centavosConfirmados).toBe(101);
  });

  it('STRONG preservado: "success" + underpayment => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.0, status: "success" } }]);
    expect((await verifyPayment(entrada("8123456"), deps("8123456", 1.01))).resultado).toBe("INVALID");
  });

  it('STRONG preservado: "success" + overpayment => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.02, status: "success" } }]);
    expect((await verifyPayment(entrada("8123456"), deps("8123456", 1.01))).resultado).toBe("INVALID");
  });

  it('STRONG preservado: "success" + id divergente => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 999999, value: 1.01, status: "success" } }]);
    expect((await verifyPayment(entrada("8123456"), deps("8123456", 1.01))).resultado).toBe("INVALID");
  });

  it('STRONG preservado: "success" + id ausente => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { value: 1.01, status: "success" } }]);
    expect((await verifyPayment(entrada("8123456"), deps("8123456", 1.01))).resultado).toBe("INVALID");
  });

  it('STRONG preservado: "success" + value malformado (string) => INVALID', async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: "1.01", status: "success" } }]);
    expect((await verifyPayment(entrada("8123456"), deps("8123456", 1.01))).resultado).toBe("INVALID");
  });

  it("status desconhecido continua PENDING (fail-closed, sem substring/truthy)", async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 8123456, value: 1.01, status: "successo_inventado" } }]);
    expect((await verifyPayment(entrada("8123456"), deps("8123456", 1.01))).resultado).toBe("VERIFIED_PENDING");
  });
});
