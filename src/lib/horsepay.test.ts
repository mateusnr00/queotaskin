import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assinaturaConfere,
  consultarDeposito,
  criarCobrancaPix,
  lerWebhook,
  limparTokens,
  obterToken,
  traduzirStatus,
} from "./horsepay";

const creds = {
  clientKey: "chave_de_teste",
  clientSecret: "segredo_de_teste",
};

const cobranca = {
  amount: 19.9,
  payerName: "Fulano de Tal",
  clientReferenceId: "reserva_42",
  callbackUrl: "https://queotaskin.com/api/webhooks/horsepay/tok",
  phone: "11999999999",
};

/** Encadeia respostas: uma por chamada, na ordem. */
function respondeEm(sequencia: { status: number; corpo: unknown }[]) {
  const pedidos: { url: string; init: RequestInit }[] = [];
  let i = 0;
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    pedidos.push({ url, init });
    const r = sequencia[Math.min(i++, sequencia.length - 1)];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.corpo,
      text: async () => JSON.stringify(r.corpo),
    } as unknown as Response;
  });
  return pedidos;
}

const TOKEN = { status: 200, corpo: { access_token: "tok_abc" } };
const CRIADA = {
  status: 200,
  corpo: {
    copy_past: "00020126580014BR.GOV.BCB.PIX0136...",
    external_id: 8123456,
    payer_name: "Fulano de Tal",
    payment: "data:image/png;base64,iVBORw0KG...",
    status: 0,
  },
};

function autorizacao(init: RequestInit): string | undefined {
  return (init.headers as Record<string, string>).Authorization;
}

beforeEach(() => limparTokens());
afterEach(() => vi.unstubAllGlobals());

describe("obterToken", () => {
  it("troca as credenciais por um token", async () => {
    const pedidos = respondeEm([TOKEN]);
    expect(await obterToken(creds)).toBe("tok_abc");

    expect(pedidos[0].url).toBe("https://api.horsepay.io/auth/token");
    const corpo = JSON.parse(pedidos[0].init.body as string);
    expect(corpo).toEqual({
      client_key: "chave_de_teste",
      client_secret: "segredo_de_teste",
    });
  });

  it("guarda o token e não troca de novo dentro da validade", async () => {
    const pedidos = respondeEm([TOKEN]);
    await obterToken(creds);
    await obterToken(creds);
    await obterToken(creds);
    // Quatro horas de validade: pedir um token por cobrança seria uma
    // requisição extra em cada compra do site.
    expect(pedidos).toHaveLength(1);
  });

  it("respeita expires_in quando ele vem, descontando a margem", async () => {
    // Dez minutos de validade menos cinco de margem: o token guardado vence
    // antes do relógio deles, e não depois.
    respondeEm([
      { status: 200, corpo: { access_token: "curto", expires_in: 600 } },
    ]);
    await obterToken(creds);

    const agora = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(agora + 6 * 60_000);
    const pedidos = respondeEm([{ status: 200, corpo: { access_token: "novo" } }]);
    expect(await obterToken(creds)).toBe("novo");
    expect(pedidos).toHaveLength(1);
    vi.restoreAllMocks();
  });

  it("diz que a credencial está errada no 401", async () => {
    respondeEm([{ status: 401, corpo: { message: "Unauthorized" } }]);
    await expect(obterToken(creds)).rejects.toThrow(/recusou as credenciais/);
  });

  it("recusa resposta sem access_token", async () => {
    respondeEm([{ status: 200, corpo: { ok: true } }]);
    await expect(obterToken(creds)).rejects.toThrow(/sem access_token/);
  });
});

describe("criarCobrancaPix", () => {
  it("manda o token no header e o valor em reais", async () => {
    const pedidos = respondeEm([TOKEN, CRIADA]);
    const r = await criarCobrancaPix(creds, cobranca);

    // O external_id deles é número e vira texto: é por ele que o callback
    // encontra a cobrança, e os dois lados precisam guardar a mesma forma.
    expect(r).toEqual({
      transactionId: "8123456",
      pixCode: "00020126580014BR.GOV.BCB.PIX0136...",
    });

    const { url, init } = pedidos[1];
    expect(url).toBe("https://api.horsepay.io/transaction/neworder");
    expect(autorizacao(init)).toBe("Bearer tok_abc");

    const corpo = JSON.parse(init.body as string);
    expect(corpo.amount).toBe(19.9);
    expect(corpo.payer_name).toBe("Fulano de Tal");
    expect(corpo.client_reference_id).toBe("reserva_42");
    expect(corpo.callback_url).toBe(cobranca.callbackUrl);
  });

  it("troca o token e repete uma vez quando o gateway responde 401", async () => {
    // Credencial rotacionada no painel deles invalida o token guardado antes
    // da validade que ele mesmo anunciou. O primeiro 401 é isso, não erro.
    const pedidos = respondeEm([
      TOKEN,
      { status: 401, corpo: { message: "Token expirado" } },
      { status: 200, corpo: { access_token: "tok_novo" } },
      CRIADA,
    ]);
    const r = await criarCobrancaPix(creds, cobranca);

    expect(r.transactionId).toBe("8123456");
    expect(pedidos).toHaveLength(4);
    expect(pedidos[2].url).toBe("https://api.horsepay.io/auth/token");
    expect(autorizacao(pedidos[3].init)).toBe("Bearer tok_novo");
  });

  it("desiste no segundo 401, que aí é credencial errada mesmo", async () => {
    respondeEm([TOKEN, { status: 401, corpo: { message: "Unauthorized" } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /recusou as credenciais \(401\)/,
    );
  });

  it("tenta de novo no 429 e vence na segunda", async () => {
    const pedidos = respondeEm([
      TOKEN,
      { status: 429, corpo: { message: "Muitas requisicoes" } },
      CRIADA,
    ]);
    const r = await criarCobrancaPix(creds, cobranca);
    expect(r.transactionId).toBe("8123456");
    expect(pedidos).toHaveLength(3);
  });

  it("não repete no 400", async () => {
    const pedidos = respondeEm([
      TOKEN,
      { status: 400, corpo: { message: "amount invalido" } },
    ]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(/400/);
    expect(pedidos).toHaveLength(2);
  });

  it("desiste depois das tentativas e diz quantas foram", async () => {
    respondeEm([TOKEN, { status: 500, corpo: { message: "Erro interno" } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /depois de 3 tentativas/,
    );
  });

  it("recusa resposta sem o código do Pix", async () => {
    respondeEm([TOKEN, { status: 200, corpo: { external_id: 1 } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /sem o código do Pix/,
    );
  });
});

describe("consultarDeposito", () => {
  it("consulta pelo id deles e traduz o status", async () => {
    const pedidos = respondeEm([TOKEN, { status: 200, corpo: { status: "paid" } }]);
    expect((await consultarDeposito(creds, "8123456")).status).toBe("APPROVED");
    expect(pedidos[1].url).toBe(
      "https://api.horsepay.io/api/orders/deposit/8123456",
    );
  });

  it("status desconhecido vira PENDING, e não erro", async () => {
    respondeEm([TOKEN, { status: 200, corpo: { status: "coisa_nova" } }]);
    expect((await consultarDeposito(creds, "1")).status).toBe("PENDING");
  });

  // GATE 10F: STRONG. A consulta autoritativa expõe `value` e `id`.
  it("extrai value->amountBrl (BRUTO) e id->identity da consulta oficial", async () => {
    respondeEm([TOKEN, { status: 200, corpo: { id: 12345, value: 1.01, tax: 0.02, status: "paid", end_to_end: "E1" } }]);
    const c = await consultarDeposito(creds, "12345");
    expect(c.status).toBe("APPROVED");
    expect(c.amountBrl).toBe(1.01); // value, NUNCA tax
    expect(c.identity.id).toBe("12345"); // id numérico vira string canônica
    expect(c.endToEnd).toBe("E1");
  });

  it("parsing fail-closed: value não-numérico e id malformado viram null", async () => {
    for (const corpo of [
      { id: 12345, value: "1.01", status: "paid" }, // value string -> null
      { id: 12345, value: "1e309", status: "paid" }, // string overflow -> null
      { id: 12345, status: "paid" }, // value ausente -> null
    ]) {
      respondeEm([TOKEN, { status: 200, corpo }]);
      expect((await consultarDeposito(creds, "12345")).amountBrl).toBeNull();
    }
    for (const corpo of [
      { id: 12.5, value: 1.01, status: "paid" }, // id float -> null
      { id: {}, value: 1.01, status: "paid" }, // id objeto -> null
      { value: 1.01, status: "paid" }, // id ausente -> null
    ]) {
      respondeEm([TOKEN, { status: 200, corpo }]);
      expect((await consultarDeposito(creds, "x")).identity.id).toBeNull();
    }
  });
});

describe("traduzirStatus", () => {
  it("mapeia o vocabulário deles para o nosso", () => {
    expect(traduzirStatus("pending")).toBe("PENDING");
    expect(traduzirStatus("paid")).toBe("APPROVED");
    expect(traduzirStatus("refunded")).toBe("REJECTED");
    expect(traduzirStatus("inventado")).toBeNull();
  });
});

describe("assinaturaConfere", () => {
  const segredo = "whsec_de_teste";
  const corpo = '{"external_id":8123456,"status":true}';

  function assinar(texto: string, comSegredo = segredo) {
    return createHmac("sha256", comSegredo).update(texto).digest("hex");
  }

  it("aceita a assinatura correta com o prefixo sha256=", () => {
    expect(assinaturaConfere(`sha256=${assinar(corpo)}`, corpo, segredo)).toBe(
      true,
    );
  });

  it("aceita também sem o prefixo", () => {
    expect(assinaturaConfere(assinar(corpo), corpo, segredo)).toBe(true);
  });

  it("recusa assinatura de outro segredo", () => {
    const outra = assinar(corpo, "segredo_do_atacante");
    expect(assinaturaConfere(`sha256=${outra}`, corpo, segredo)).toBe(false);
  });

  it("recusa quando o corpo foi alterado depois de assinado", () => {
    // O caso que a assinatura existe para pegar: alguém repete a notificação
    // trocando o valor.
    const assinatura = `sha256=${assinar(corpo)}`;
    const adulterado = corpo.replace("8123456", "9999999");
    expect(assinaturaConfere(assinatura, adulterado, segredo)).toBe(false);
  });

  it("recusa header ausente, vazio ou sem segredo cadastrado", () => {
    expect(assinaturaConfere(null, corpo, segredo)).toBe(false);
    expect(assinaturaConfere("sha256=", corpo, segredo)).toBe(false);
    expect(assinaturaConfere(`sha256=${assinar(corpo)}`, corpo, "")).toBe(false);
  });

  it("recusa assinatura de tamanho diferente sem quebrar", () => {
    expect(assinaturaConfere("sha256=abc", corpo, segredo)).toBe(false);
  });
});

describe("lerWebhook", () => {
  it("lê o callback de depósito pago", () => {
    const aviso = lerWebhook({
      amount: 19.9,
      document: "12345678901",
      end_to_end: "E123",
      external_id: 8123456,
      name: "Fulano de Tal",
      status: true,
      client_reference_id: "reserva_42",
    });
    expect(aviso).toEqual({
      externalId: "8123456",
      nossaReferencia: "reserva_42",
      status: "APPROVED",
      infracao: null,
      saque: false,
    });
  });

  it("status false é falha", () => {
    expect(lerWebhook({ external_id: 1, status: false })?.status).toBe(
      "REJECTED",
    );
  });

  it("marca a infração, que não é resposta de cobrança", () => {
    // Uma infração aberta sobre um depósito pago não desfaz o pagamento. Ler
    // o `status` dela como resposta de cobrança marcaria como recusado um Pix
    // que caiu.
    const aviso = lerWebhook({
      external_id: 8123456,
      status: false,
      infraction_status: "pending_defense",
      blocked_at: "2026-09-02T10:00:00Z",
    });
    expect(aviso?.infracao).toBe("pending_defense");
  });

  it("reconhece o callback de saque pelo endtoendid", () => {
    const aviso = lerWebhook({ external_id: 7, status: true, endtoendid: "E9" });
    expect(aviso?.saque).toBe(true);
  });

  it("devolve nulo para corpo sem external_id", () => {
    expect(lerWebhook({ status: true })).toBeNull();
    expect(lerWebhook(null)).toBeNull();
    expect(lerWebhook("texto")).toBeNull();
  });
});
