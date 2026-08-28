import { describe, expect, it } from "vitest";

import {
  EVENTOS_DE_TRANSACAO,
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
