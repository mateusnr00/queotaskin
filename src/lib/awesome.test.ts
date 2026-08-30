import { describe, expect, it } from "vitest";

import {
  dataParaAwesome,
  fechamentoAte,
  lerDiarioAwesome,
  lerUltimaAwesome,
} from "@/lib/awesome";

// A forma documentada de /json/daily: só o PRIMEIRO item traz code, codein e
// create_date; os demais vêm sem.
const RESPOSTA = [
  {
    varBid: "-0.0143",
    code: "CNY",
    codein: "BRL",
    name: "Yuan Chinês/Real Brasileiro",
    high: "0.7620",
    low: "0.7590",
    pctChange: "-0.37",
    bid: "0.7601",
    ask: "0.7605",
    timestamp: "1787949300", // 28/08/2026, 17h35 de Brasília
    create_date: "2026-08-28 17:35:43",
  },
  {
    high: "0.7560",
    low: "0.7530",
    bid: "0.7550",
    ask: "0.7555",
    varBid: "0.0006",
    timestamp: "1787862900",
  }, // 27/08
  {
    high: "0.7540",
    low: "0.7500",
    bid: "0.7530",
    ask: "0.7533",
    varBid: "0.0248",
    timestamp: "1787776500",
  }, // 26/08
];

describe("lerDiarioAwesome", () => {
  it("lê todos os dias, inclusive os que vêm sem code e create_date", () => {
    expect(lerDiarioAwesome(RESPOSTA)).toHaveLength(3);
  });

  it("usa ask, que é a VENDA na legenda da API", () => {
    // bid é compra e ask é venda. Despesa converte pela venda, e a escolha tem
    // que ser a mesma do PTAX: se as fontes divergissem, entregas vizinhas
    // teriam custos diferentes só por causa de quem respondeu.
    const dias = lerDiarioAwesome(RESPOSTA);
    expect(dias.at(-1)!.taxa).toBe(0.7605);
    expect(dias.at(-1)!.taxa).not.toBe(0.7601);
  });

  it("devolve em ordem, do mais antigo para o mais recente", () => {
    // A API entrega do mais novo para o mais velho. Depender dessa ordem seria
    // depender de algo que o contrato não promete.
    const dias = lerDiarioAwesome(RESPOSTA);
    expect(dias.map((d) => d.taxa)).toEqual([0.7533, 0.7555, 0.7605]);
  });

  it("aceita timestamp em milissegundos, que a própria API também usa", () => {
    // 1538136540000 lido como segundo seria o ano 50 mil.
    const d = lerDiarioAwesome([
      { bid: "4.0256", ask: "4.0276", timestamp: "1538136540000" },
    ]);
    expect(d[0].quando.getUTCFullYear()).toBe(2018);
  });

  it("resposta que não é lista não derruba nada", () => {
    for (const lixo of [null, undefined, "", 42, {}, { value: [] }]) {
      expect(lerDiarioAwesome(lixo)).toEqual([]);
    }
  });

  it("item corrompido é descartado sem levar os dias bons", () => {
    const d = lerDiarioAwesome([
      { bid: "x", ask: null, timestamp: "abc" },
      RESPOSTA[0],
    ]);
    expect(d).toHaveLength(1);
    expect(d[0].taxa).toBe(0.7605);
  });

  it("recusa taxa vazia, zero, negativa ou fora de escala", () => {
    for (const ask of ["", "0", "-1", "5000", null]) {
      expect(
        lerDiarioAwesome([{ bid: "0.76", ask, timestamp: "1787949300" }]),
      ).toEqual([]);
    }
  });
});

describe("fechamentoAte", () => {
  const dias = lerDiarioAwesome(RESPOSTA);

  it("pega o fechamento do próprio dia quando ele existe", () => {
    const c = fechamentoAte(dias, new Date("2026-08-27T12:00:00Z"));
    expect(c?.taxa).toBe(0.7555);
  });

  it("recua para o último dia útil quando não há fechamento no dia", () => {
    // Domingo, 30/08: o que vale é a sexta.
    const c = fechamentoAte(dias, new Date("2026-08-30T12:00:00Z"));
    expect(c?.taxa).toBe(0.7605);
  });

  it("nunca olha para a frente", () => {
    // Usar o fechamento de 28 numa compra de 26 seria gravar um câmbio que
    // ainda não existia quando o dinheiro saiu.
    const c = fechamentoAte(dias, new Date("2026-08-26T12:00:00Z"));
    expect(c?.taxa).toBe(0.7533);
  });

  it("conta o próprio dia mesmo de manhã: o fechamento sai à tarde", () => {
    // 12h UTC é 9h em São Paulo, antes do fechamento das 17h35. O dia é o
    // mesmo, então o fechamento dele vale.
    const c = fechamentoAte(dias, new Date("2026-08-28T12:00:00Z"));
    expect(c?.taxa).toBe(0.7605);
  });

  it("o dia é o de São Paulo: 2h UTC ainda é ontem no Brasil", () => {
    // 2026-08-28T02:00Z é 23h do dia 27 em Brasília, e o fechamento que vale
    // é o do dia 27.
    const c = fechamentoAte(dias, new Date("2026-08-28T02:00:00Z"));
    expect(c?.taxa).toBe(0.7555);
  });

  it("sem nada antes do limite devolve nulo, e não o dia mais próximo", () => {
    expect(fechamentoAte(dias, new Date("2020-01-01T12:00:00Z"))).toBeNull();
    expect(fechamentoAte([], new Date())).toBeNull();
  });
});

describe("dataParaAwesome", () => {
  it("usa AAAAMMDD, no fuso de São Paulo", () => {
    expect(dataParaAwesome(new Date("2026-08-28T15:00:00Z"))).toBe("20260828");
    // 22h de Brasília é 01h UTC do dia seguinte.
    expect(dataParaAwesome(new Date("2026-08-29T01:00:00Z"))).toBe("20260828");
  });
});

describe("lerUltimaAwesome", () => {
  // /json/last devolve um OBJETO com chave sem hífen, e não uma lista.
  const AGORA = {
    CNYBRL: {
      code: "CNY",
      codein: "BRL",
      name: "Yuan Chinês/Real Brasileiro",
      high: "0.7620",
      low: "0.7590",
      varBid: "0.0003",
      pctChange: "0.04",
      bid: "0.7601",
      ask: "0.7605",
      timestamp: "1787949300",
      create_date: "2026-08-28 17:35:00",
    },
  };

  it("acha o par pela chave sem hífen", () => {
    expect(lerUltimaAwesome(AGORA, "CNY-BRL")?.taxa).toBe(0.7605);
  });

  it("par ausente devolve nulo, e não o primeiro que achar", () => {
    expect(lerUltimaAwesome(AGORA, "USD-BRL")).toBeNull();
  });

  it("usa ask, a venda, igual ao resto", () => {
    expect(lerUltimaAwesome(AGORA, "CNY-BRL")?.compra).toBe(0.7601);
    expect(lerUltimaAwesome(AGORA, "CNY-BRL")?.taxa).not.toBe(0.7601);
  });

  it("resposta de outro formato não derruba nada", () => {
    for (const lixo of [null, undefined, "", 42, [], {}, { CNYBRL: "x" }]) {
      expect(lerUltimaAwesome(lixo, "CNY-BRL")).toBeNull();
    }
  });
});
