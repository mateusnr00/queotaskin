import { describe, expect, it } from "vitest";

import {
  DISTANCIA_DE_ALERTA,
  distanciaDoMercado,
  lerCotacao,
  taxaDesatualizada,
} from "@/lib/cotacao";

// A forma documentada da resposta da AwesomeAPI: valores como TEXTO, chave sem
// hífen, timestamp em segundos.
const RESPOSTA = {
  CNYBRL: {
    code: "CNY",
    codein: "BRL",
    name: "Yuan Chinês/Real Brasileiro",
    high: "0.7612",
    low: "0.7589",
    varBid: "0.0003",
    pctChange: "0.04",
    bid: "0.7601",
    ask: "0.7605",
    timestamp: "1756500000",
    create_date: "2026-08-29 17:40:00",
  },
  USDBRL: {
    code: "USD",
    codein: "BRL",
    name: "Dólar Americano/Real Brasileiro",
    high: "5.4321",
    low: "5.3987",
    varBid: "-0.0102",
    pctChange: "-0.19",
    bid: "5.4102",
    ask: "5.4112",
    timestamp: "1756503600",
    create_date: "2026-08-29 18:40:00",
  },
};

describe("lerCotacao", () => {
  it("lê os dois pares da resposta documentada", () => {
    const c = lerCotacao(RESPOSTA);
    expect(c.cnyToBrl).toBe(0.7601);
    expect(c.usdToBrl).toBe(5.4102);
  });

  it("usa o bid, e não o ask", () => {
    // São dois números próximos, e trocar um pelo outro passaria despercebido
    // para sempre. O teste existe para essa troca não passar.
    expect(lerCotacao(RESPOSTA).cnyToBrl).not.toBe(0.7605);
  });

  it("a data é a do par mais recente, não a do mais velho", () => {
    // Mostrar a mais velha faria a cotação parecer mais defasada do que está.
    expect(lerCotacao(RESPOSTA).atualizadaEm?.toISOString()).toBe(
      new Date(1756503600 * 1000).toISOString(),
    );
  });

  it("resposta vazia, nula ou de outro formato não derruba nada", () => {
    for (const lixo of [null, undefined, "", 42, [], {}, { CNYBRL: "x" }]) {
      const c = lerCotacao(lixo);
      expect(c.cnyToBrl).toBeNull();
      expect(c.usdToBrl).toBeNull();
      expect(c.atualizadaEm).toBeNull();
    }
  });

  it("um par ausente não leva o outro junto", () => {
    const c = lerCotacao({ CNYBRL: RESPOSTA.CNYBRL });
    expect(c.cnyToBrl).toBe(0.7601);
    expect(c.usdToBrl).toBeNull();
  });

  it("bid vazio, zero, negativo ou absurdo é recusado", () => {
    // Campo vazio é o pior deles: Number("") é 0, e taxa zero é divisão por
    // zero na conversão do custo.
    for (const bid of ["", "  ", "0", "-1", "abc", "12345", null]) {
      expect(
        lerCotacao({ CNYBRL: { bid, timestamp: "1756500000" } }).cnyToBrl,
      ).toBeNull();
    }
  });

  it("aceita bid que venha como número, e não como texto", () => {
    expect(lerCotacao({ CNYBRL: { bid: 0.76 } }).cnyToBrl).toBe(0.76);
  });

  it("timestamp ruim devolve valor sem data, e não uma data inválida", () => {
    const c = lerCotacao({ CNYBRL: { bid: "0.76", timestamp: "zero" } });
    expect(c.cnyToBrl).toBe(0.76);
    expect(c.atualizadaEm).toBeNull();
  });
});

describe("distanciaDoMercado", () => {
  it("positivo é taxa salva acima do mercado", () => {
    expect(distanciaDoMercado(0.8, 0.76)).toBeCloseTo(5.263, 2);
  });

  it("negativo é taxa salva abaixo do mercado", () => {
    expect(distanciaDoMercado(0.72, 0.76)).toBeCloseTo(-5.263, 2);
  });

  it("sem um dos lados devolve nulo, e não zero", () => {
    // Zero diria "está em dia" para quem nunca cadastrou taxa nenhuma.
    expect(distanciaDoMercado(null, 0.76)).toBeNull();
    expect(distanciaDoMercado(0.76, null)).toBeNull();
    expect(distanciaDoMercado(0.76, 0)).toBeNull();
  });
});

describe("taxaDesatualizada", () => {
  it("oscilação pequena não vira alerta", () => {
    expect(taxaDesatualizada(0.7615, 0.76)).toBe(false);
  });

  it("a partir do limite vira alerta, nos dois sentidos", () => {
    const acima = 0.76 * (1 + DISTANCIA_DE_ALERTA / 100);
    const abaixo = 0.76 * (1 - DISTANCIA_DE_ALERTA / 100);
    expect(taxaDesatualizada(acima, 0.76)).toBe(true);
    expect(taxaDesatualizada(abaixo, 0.76)).toBe(true);
  });

  it("sem taxa salva não é alerta de desatualizada", () => {
    expect(taxaDesatualizada(null, 0.76)).toBe(false);
  });
});
