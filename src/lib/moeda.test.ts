import { describe, expect, it } from "vitest";

import {
  deYuan,
  formatarMoeda,
  paraYuan,
  proximaMoeda,
} from "@/lib/moeda";

// 1 CNY = 0,76 BRL e 1 USD = 5,40 BRL. Números redondos de propósito: o teste
// checa a CONTA, não uma cotação de um dia específico.
const TAXAS = { cnyToBrl: 0.76, usdToBrl: 5.4 };

describe("conversão do custo", () => {
  it("yuan para yuan é o próprio valor", () => {
    expect(deYuan(250, "CNY", TAXAS)).toBe(250);
  });

  it("yuan para real usa a taxa", () => {
    expect(deYuan(100, "BRL", TAXAS)).toBeCloseTo(76, 6);
  });

  it("yuan para dólar passa pelo real", () => {
    // 100 CNY = 76 BRL = 76 / 5,40 USD.
    expect(deYuan(100, "USD", TAXAS)).toBeCloseTo(76 / 5.4, 6);
  });

  it("sem taxa devolve NULO, e não zero", () => {
    // Zero diria que a skin custou nada. O que se quer dizer é que ainda não
    // dá para converter.
    const sem = { cnyToBrl: null, usdToBrl: null };
    expect(deYuan(100, "BRL", sem)).toBeNull();
    expect(deYuan(100, "USD", sem)).toBeNull();
    // Yuan não depende de taxa nenhuma e continua respondendo.
    expect(deYuan(100, "CNY", sem)).toBe(100);
  });

  it("taxa zero ou negativa não é taxa", () => {
    // Sem esta guarda, taxa zero viraria divisão por zero e Infinity na tela.
    expect(deYuan(100, "BRL", { cnyToBrl: 0, usdToBrl: 5.4 })).toBeNull();
    expect(deYuan(100, "USD", { cnyToBrl: 0.76, usdToBrl: 0 })).toBeNull();
    expect(paraYuan(100, "BRL", { cnyToBrl: -1, usdToBrl: 5.4 })).toBeNull();
  });

  it("ida e volta devolve o mesmo valor", () => {
    // É a garantia que importa: digitar em real e ler em real não pode mudar
    // o número por causa do arredondamento do caminho.
    for (const v of [1, 99.9, 250, 1234.56]) {
      for (const m of ["CNY", "BRL", "USD"] as const) {
        const emYuan = paraYuan(v, m, TAXAS)!;
        expect(deYuan(emYuan, m, TAXAS)!).toBeCloseTo(v, 6);
      }
    }
  });

  it("o ciclo do clique passa pelas três e volta", () => {
    expect(proximaMoeda("CNY")).toBe("BRL");
    expect(proximaMoeda("BRL")).toBe("USD");
    expect(proximaMoeda("USD")).toBe("CNY");
  });

  it("formata com o símbolo certo", () => {
    expect(formatarMoeda(1234.5, "CNY")).toBe("¥ 1.234,50");
    expect(formatarMoeda(1234.5, "BRL")).toBe("R$ 1.234,50");
    expect(formatarMoeda(1234.5, "USD")).toBe("$ 1.234,50");
  });
});
