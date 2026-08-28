import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assinaturaConfere,
  consultarCobranca,
  criarCobrancaPix,
  lerWebhook,
  traduzirStatus,
  ValorAbaixoDoMinimoError,
} from "./nexuspag";

const creds = { apiKey: "nxp_live_teste" };
const cobranca = {
  amount: 19.9,
  externalId: "reserva_42",
  descricao: "AK-47 | Redline",
  webhookUrl: "https://queotaskin.com/api/webhooks/nexuspag/tok",
  expiresAt: new Date(Date.now() + 5 * 60_000),
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

const CRIADA = {
  status: 200,
  corpo: {
    success: true,
    transaction: {
      id: "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
      txid: "1919700995",
      pix_copia_cola: "00020126580014BR.GOV.BCB.PIX0136...",
    },
  },
};

describe("criarCobrancaPix", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("manda a chave no header e o valor em reais", async () => {
    const pedidos = respondeEm([CRIADA]);
    const r = await criarCobrancaPix(creds, cobranca);

    expect(r).toEqual({
      transactionId: "9c29870c-9f69-4bb6-90d3-2dce9453bb45",
      pixCode: "00020126580014BR.GOV.BCB.PIX0136...",
    });

    const { url, init } = pedidos[0];
    expect(url).toBe("https://nexuspag.com/api/pix/create");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      "nxp_live_teste",
    );

    const corpo = JSON.parse(init.body as string);
    expect(corpo.amount).toBe(19.9);
    // A referência da reserva vira a chave de idempotência do lado deles.
    expect(corpo.external_id).toBe("reserva_42");
    expect(corpo.webhook_url).toBe(cobranca.webhookUrl);
    // Expiração em SEGUNDOS, não em minutos nem em data.
    expect(corpo.expiration).toBeGreaterThan(200);
    expect(corpo.expiration).toBeLessThanOrEqual(300);
  });

  it("barra valor abaixo de R$ 1,00 antes de sair pela rede", async () => {
    // Rifa de cota barata vende número por R$ 0,50, e o gateway recusa com um
    // 400 genérico. Falhar aqui deixa a mensagem dizer o que realmente houve.
    const pedidos = respondeEm([CRIADA]);
    await expect(
      criarCobrancaPix(creds, { ...cobranca, amount: 0.5 }),
    ).rejects.toBeInstanceOf(ValorAbaixoDoMinimoError);
    expect(pedidos).toHaveLength(0);
  });

  it("nunca manda expiração no passado", async () => {
    const pedidos = respondeEm([CRIADA]);
    await criarCobrancaPix(creds, {
      ...cobranca,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(JSON.parse(pedidos[0].init.body as string).expiration).toBe(60);
  });

  it("tenta de novo no 429 e vence na segunda", async () => {
    // Repetir é seguro porque o external_id devolve a cobrança existente em
    // vez de criar outra. Sem essa garantia, retry seria cobrar duas vezes.
    const pedidos = respondeEm([
      { status: 429, corpo: { message: "Muitas requisicoes" } },
      CRIADA,
    ]);
    const r = await criarCobrancaPix(creds, cobranca);
    expect(pedidos).toHaveLength(2);
    expect(r.transactionId).toBe("9c29870c-9f69-4bb6-90d3-2dce9453bb45");
  });

  it("tenta de novo no 502 do gateway", async () => {
    const pedidos = respondeEm([
      { status: 502, corpo: { message: "Gateway indisponivel" } },
      { status: 500, corpo: { message: "Erro interno" } },
      CRIADA,
    ]);
    await criarCobrancaPix(creds, cobranca);
    expect(pedidos).toHaveLength(3);
  });

  it("não repete no 401, que é erro nosso", async () => {
    const pedidos = respondeEm([{ status: 401, corpo: { message: "API Key invalida" } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /recusou a chave de API \(401\)/,
    );
    expect(pedidos).toHaveLength(1);
  });

  it("não repete no 400", async () => {
    const pedidos = respondeEm([{ status: 400, corpo: { message: "amount invalido" } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(/400/);
    expect(pedidos).toHaveLength(1);
  });

  it("desiste depois das tentativas e diz quantas foram", async () => {
    const pedidos = respondeEm([{ status: 500, corpo: { message: "Erro interno" } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /depois de 3 tentativas/,
    );
    expect(pedidos).toHaveLength(3);
  });

  it("recusa resposta sem o código do Pix", async () => {
    respondeEm([{ status: 200, corpo: { success: true, transaction: { id: "x" } } }]);
    await expect(criarCobrancaPix(creds, cobranca)).rejects.toThrow(
      /sem id de transação ou sem o código/,
    );
  });
});

describe("consultarCobranca", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("traduz os status do gateway", async () => {
    respondeEm([{ status: 200, corpo: { status: "paid" } }]);
    expect((await consultarCobranca(creds, "abc")).status).toBe("APPROVED");
  });

  it("status desconhecido vira PENDING, e não erro", async () => {
    respondeEm([{ status: 200, corpo: { status: "coisa_nova" } }]);
    expect((await consultarCobranca(creds, "abc")).status).toBe("PENDING");
  });
});

describe("traduzirStatus", () => {
  it("mapeia o vocabulário deles para o nosso", () => {
    expect(traduzirStatus("pending")).toBe("PENDING");
    expect(traduzirStatus("paid")).toBe("APPROVED");
    expect(traduzirStatus("expired")).toBe("REJECTED");
    expect(traduzirStatus("cancelled")).toBe("REJECTED");
    expect(traduzirStatus("inventado")).toBeNull();
  });
});

describe("assinaturaConfere", () => {
  const segredo = "whsec_de_teste";
  const corpo = '{"event":"payment.confirmed","transaction_id":"abc"}';

  function assinar(unix: string, texto: string, comSegredo = segredo) {
    const hmac = createHmac("sha256", comSegredo)
      .update(`${unix}.${texto}`)
      .digest("hex");
    return `t=${unix},v1=${hmac}`;
  }

  it("aceita a assinatura correta", () => {
    expect(assinaturaConfere(assinar("1700000000", corpo), corpo, segredo)).toBe(
      true,
    );
  });

  it("recusa quando o corpo foi alterado", () => {
    const header = assinar("1700000000", corpo);
    const adulterado = corpo.replace("abc", "xyz");
    expect(assinaturaConfere(header, adulterado, segredo)).toBe(false);
  });

  it("recusa quando o segredo é outro", () => {
    const header = assinar("1700000000", corpo, "outro_segredo");
    expect(assinaturaConfere(header, corpo, segredo)).toBe(false);
  });

  it("recusa header ausente, incompleto ou fora do formato", () => {
    expect(assinaturaConfere(null, corpo, segredo)).toBe(false);
    expect(assinaturaConfere("t=1700000000", corpo, segredo)).toBe(false);
    expect(assinaturaConfere("v1=abc", corpo, segredo)).toBe(false);
    expect(assinaturaConfere("lixo", corpo, segredo)).toBe(false);
  });

  it("recusa quando não há segredo configurado", () => {
    expect(assinaturaConfere(assinar("1700000000", corpo), corpo, "")).toBe(
      false,
    );
  });

  it("aceita assinatura antiga, porque a reentrega deles vai até 72h", () => {
    // Recusar pela idade mataria reentrega legítima de pagamento. A repetição
    // em si é inofensiva: confirmar de novo o que já está confirmado não faz
    // nada no nosso lado.
    const velho = String(Math.floor(Date.now() / 1000) - 3 * 24 * 3600);
    expect(assinaturaConfere(assinar(velho, corpo), corpo, segredo)).toBe(true);
  });
});

describe("lerWebhook", () => {
  const aviso = {
    event: "payment.confirmed",
    transaction_id: "9c29870c",
    txid: "1919700995",
    external_id: "reserva_42",
    status: "paid",
    amount: 50,
  };

  it("acha o id da transação e a nossa referência", () => {
    const r = lerWebhook(aviso);
    expect(r).toEqual({
      evento: "payment.confirmed",
      transactionId: "9c29870c",
      nossaReferencia: "reserva_42",
      status: "APPROVED",
    });
  });

  it("confia no nome do evento quando o status não vem legível", () => {
    const r = lerWebhook({ ...aviso, status: undefined });
    expect(r!.status).toBe("APPROVED");
  });

  it("ignora evento que não é de pagamento e payload sem forma", () => {
    expect(lerWebhook({ ...aviso, event: "kyc.verified" })).toBeNull();
    expect(lerWebhook(null)).toBeNull();
    expect(lerWebhook("texto")).toBeNull();
    expect(lerWebhook({})).toBeNull();
  });
});
