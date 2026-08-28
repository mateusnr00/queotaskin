import { describe, expect, it } from "vitest";

import {
  EVENTOS_DE_TRANSACAO,
  lerWebhook,
  statusDoEvento,
  tokenConfere,
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

describe("tokenConfere", () => {
  it("aceita o token igual e recusa o diferente", () => {
    expect(tokenConfere("abc123", "abc123")).toBe(true);
    expect(tokenConfere("abc124", "abc123")).toBe(false);
  });

  it("recusa tamanho diferente e valor que não é texto", () => {
    expect(tokenConfere("abc12", "abc123")).toBe(false);
    expect(tokenConfere(undefined, "abc123")).toBe(false);
    expect(tokenConfere(123456, "abc123")).toBe(false);
  });

  it("aceita quando ainda não há token guardado", () => {
    // Primeira notificação da integração: é nela que o token aparece. Quem
    // chegou até aqui já provou saber o token secreto do caminho da URL.
    expect(tokenConfere("qualquer", null)).toBe(true);
    expect(tokenConfere("qualquer", "")).toBe(true);
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
