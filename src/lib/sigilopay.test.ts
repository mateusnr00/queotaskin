import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consultarTransacao,
  criarCobrancaPix,
  EVENTOS_DE_TRANSACAO,
  lerWebhook,
  statusDoEvento,
} from "./sigilopay";

describe("statusDoEvento", () => {
  it("cobre todos os eventos que a SigiloPay documenta", () => {
    // Se a lista crescer sem alguém tratar o evento novo, este teste cai
    // antes de um webhook silencioso em produção.
    for (const evento of EVENTOS_DE_TRANSACAO) {
      expect(statusDoEvento(evento), evento).not.toBeNull();
    }
  });

  it("traduz pagamento e criação", () => {
    expect(statusDoEvento("TRANSACTION_CREATED")).toEqual({
      status: "PENDING",
      desfazPagamento: false,
    });
    expect(statusDoEvento("TRANSACTION_PAID")).toEqual({
      status: "APPROVED",
      desfazPagamento: false,
    });
  });

  it("separa cancelamento de estorno e chargeback", () => {
    // Cancelar é uma cobrança que nunca foi paga. Estorno e chargeback
    // chegam depois do dinheiro ter entrado, e desfazem números já emitidos.
    expect(statusDoEvento("TRANSACTION_CANCELED")).toEqual({
      status: "REJECTED",
      desfazPagamento: false,
    });
    expect(statusDoEvento("TRANSACTION_REFUNDED")).toEqual({
      status: "REJECTED",
      desfazPagamento: true,
    });
    expect(statusDoEvento("TRANSACTION_CHARGED_BACK")).toEqual({
      status: "REJECTED",
      desfazPagamento: true,
    });
  });

  it("devolve null para evento desconhecido, em vez de erro", () => {
    // A SigiloPay reenvia o que não responde 2XX. Tratar evento de saque
    // como falha colocaria a notificação em loop de reentrega.
    expect(statusDoEvento("WITHDRAW_CREATED")).toBeNull();
    expect(statusDoEvento("")).toBeNull();
  });
});

/** Um disparo da SigiloPay, montado no formato da documentacao deles. */
function disparo(
  evento: string,
  statusDaTransacao: string,
  extras: Record<string, unknown> = {},
) {
  return {
    event: evento,
    token: "tok_da_integracao",
    offerCode: null,
    checkoutUrl: "",
    client: {
      id: "cli_1",
      name: "Joao Vitor",
      email: "joao@exemplo.com",
      phone: "11999999999",
      cpf: "12345678909",
      cnpj: null,
      address: null,
    },
    transaction: {
      id: "trx_abc123",
      identifier: "reserva_42",
      status: statusDaTransacao,
      paymentMethod: "PIX",
      originalAmount: 19.9,
      amount: 19.9,
      currency: "BRL",
      originalCurrency: "BRL",
      exchangeRate: null,
      installments: 1,
      createdAt: "2026-08-28T20:00:00.000Z",
      payedAt: null,
      pixInformation: {
        id: "pix_1",
        qrCode: "00020126...5204000053039865802BR",
        endToEndId: null,
      },
      boletoInformation: null,
      ...extras,
    },
    subscription: null,
    orderItems: [],
    trackProps: {},
  };
}

describe("lerWebhook", () => {
  it("acha o id da transação e a nossa referência", () => {
    const r = lerWebhook(disparo("TRANSACTION_PAID", "COMPLETED"));
    expect(r).not.toBeNull();
    expect(r!.idDaTransacao).toBe("trx_abc123");
    expect(r!.nossaReferencia).toBe("reserva_42");
    expect(r!.token).toBe("tok_da_integracao");
    expect(r!.status).toBe("APPROVED");
    expect(r!.desfazPagamento).toBe(false);
  });

  it("marca estorno como desfazendo um pagamento que já valeu", () => {
    const r = lerWebhook(disparo("TRANSACTION_REFUNDED", "REFUNDED"));
    expect(r!.status).toBe("REJECTED");
    expect(r!.desfazPagamento).toBe(true);
  });

  it("não desfaz nada num cancelamento", () => {
    const r = lerWebhook(disparo("TRANSACTION_CANCELED", "FAILED"));
    expect(r!.status).toBe("REJECTED");
    expect(r!.desfazPagamento).toBe(false);
  });

  it("não volta uma reserva paga para pendente num reenvio fora de ordem", () => {
    // A SigiloPay reenvia o que não recebe 2XX. Um TRANSACTION_CREATED
    // chegando depois do pagamento traz a transação já liquidada: obedecer o
    // nome do evento aqui apagaria a venda.
    const r = lerWebhook(disparo("TRANSACTION_CREATED", "COMPLETED"));
    expect(r!.status).toBe("APPROVED");
  });

  it("um CREATED normal continua pendente", () => {
    const r = lerWebhook(disparo("TRANSACTION_CREATED", "PENDING"));
    expect(r!.status).toBe("PENDING");
  });

  it("ignora evento que não é de transação e payload sem forma", () => {
    expect(lerWebhook(disparo("WITHDRAW_PAID", "COMPLETED"))).toBeNull();
    expect(lerWebhook(null)).toBeNull();
    expect(lerWebhook("texto")).toBeNull();
    expect(lerWebhook({})).toBeNull();
  });

  it("sobrevive a um payload sem o objeto da transação", () => {
    const r = lerWebhook({ event: "TRANSACTION_PAID", token: "t" });
    expect(r!.idDaTransacao).toBeNull();
    expect(r!.status).toBe("APPROVED");
  });
});

describe("criarCobrancaPix", () => {
  const creds = { clientId: "pub_1", clientSecret: "sec_1" };
  const cobranca = {
    amount: 19.9,
    identifier: "reserva_42",
    callbackUrl: "https://queotaskin.com/api/webhooks/sigilopay/tok",
    expiresAt: new Date("2026-08-29T02:30:00.000Z"),
    client: {
      name: "Joao",
      email: "joao@exemplo.com",
      cpf: "12345678909",
      phone: "11999999999",
    },
  };

  function respondeCom(corpo: unknown, status = 201) {
    const chamadas: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => corpo,
        text: async () => JSON.stringify(corpo),
      } as unknown as Response;
    });
    return chamadas;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("manda as chaves nos headers e o valor em reais", async () => {
    const chamadas = respondeCom({
      transactionId: "trx_1",
      status: "OK",
      pix: { code: "00020126...", image: "", base64: "" },
    });

    const r = await criarCobrancaPix(creds, cobranca);
    expect(r).toEqual({ transactionId: "trx_1", pixCode: "00020126..." });

    const { url, init } = chamadas[0];
    expect(url).toBe("https://app.sigilopay.com.br/api/v1/gateway/pix/receive");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-public-key"]).toBe("pub_1");
    expect(headers["x-secret-key"]).toBe("sec_1");

    const corpo = JSON.parse(init.body as string);
    // Reais, e não centavos: 19.9 sai como 19.9, e não como 1990.
    expect(corpo.amount).toBe(19.9);
    expect(corpo.identifier).toBe("reserva_42");
    expect(corpo.callbackUrl).toBe(cobranca.callbackUrl);
    expect(corpo.client.document).toBe("12345678909");
    // 02:30 UTC é 23:30 do dia anterior em São Paulo. O vencimento tem de
    // seguir o dia daqui, senão a cobrança nasce vencida de madrugada.
    expect(corpo.dueDate).toBe("2026-08-28");
  });

  it("recusa a transação que volta 201 mas com status de falha", async () => {
    // A documentação lista FAILED, REJECTED e CANCELED no mesmo corpo de
    // sucesso. Sem a guarda, isso viraria uma tela de Pix com campo vazio.
    respondeCom({
      transactionId: "trx_2",
      status: "REJECTED",
      errorDescription: "Transaction denied by anti-fraud",
      pix: { code: "" },
    });
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /REJECTED.*anti-fraud/,
    );
  });

  it("recusa resposta sem o código do Pix", async () => {
    respondeCom({ transactionId: "trx_3", status: "OK", pix: {} });
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /sem transactionId ou sem o código/,
    );
  });

  it("aponta para as credenciais quando o erro é 401", async () => {
    respondeCom({ statusCode: 401, message: "Unauthorized" }, 401);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /recusou as credenciais \(401\)/,
    );
  });

  it("repassa o campo e o motivo do erro 400", async () => {
    respondeCom(
      {
        statusCode: 400,
        errorCode: "INVALID_INPUT",
        message: "O valor fornecido para o campo 'amount' é inválido.",
        details: {
          field: "amount",
          value: -20,
          issue: "O valor deve ser positivo e maior que zero.",
        },
      },
      400,
    );
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /maior que zero.*campo amount/,
    );
  });
});

describe("consultarTransacao", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("traduz o status da consulta", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "trx_1", status: "COMPLETED" }),
      text: async () => "",
    }) as unknown as Response);

    const r = await consultarTransacao(
      { clientId: "a", clientSecret: "b" },
      "trx_1",
    );
    expect(r.status).toBe("APPROVED");
  });

  it("status desconhecido vira PENDING, e não erro", async () => {
    // Quem chama está perguntando "já pagou?". A resposta honesta para o
    // desconhecido é "ainda não sei", e a tela continua esperando o webhook.
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: "trx_1", status: "COISA_NOVA" }),
      text: async () => "",
    }) as unknown as Response);

    const r = await consultarTransacao(
      { clientId: "a", clientSecret: "b" },
      "trx_1",
    );
    expect(r.status).toBe("PENDING");
  });
});
