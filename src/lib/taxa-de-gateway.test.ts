import { describe, expect, it } from "vitest";

import {
  descreverFaixa,
  faixaParaValor,
  taxaDaCompra,
  taxaTotal,
  type FaixaDeTaxa,
} from "@/lib/taxa-de-gateway";

// O caso que veio do gateway de verdade: R$ 0,45 por pix, e acima de cem
// reais 2% mais R$ 0,65. Ele guia os testes porque é o que está cadastrado.
const FAIXAS: FaixaDeTaxa[] = [
  { apartirDe: 0, percentual: 0, fixo: 0.45 },
  { apartirDe: 100, percentual: 2, fixo: 0.65 },
];

const brl = (v: number) =>
  `R$ ${v.toFixed(2).replace(".", ",")}`;

describe("faixaParaValor", () => {
  it("pega a maior faixa que ainda cabe no valor", () => {
    expect(faixaParaValor(50, FAIXAS)?.apartirDe).toBe(0);
    expect(faixaParaValor(99.99, FAIXAS)?.apartirDe).toBe(0);
    expect(faixaParaValor(100, FAIXAS)?.apartirDe).toBe(100);
    expect(faixaParaValor(5000, FAIXAS)?.apartirDe).toBe(100);
  });

  it("não inventa faixa quando nenhuma cabe", () => {
    // Gateway sem faixa base cadastrada: quem chama precisa distinguir "a
    // taxa é zero" de "eu não sei a taxa".
    expect(faixaParaValor(10, [{ apartirDe: 100, percentual: 2, fixo: 0 }]))
      .toBeNull();
    expect(faixaParaValor(10, [])).toBeNull();
  });

  it("a ordem da lista não muda a resposta", () => {
    const embaralhada = [...FAIXAS].reverse();
    expect(faixaParaValor(250, embaralhada)?.apartirDe).toBe(100);
  });
});

describe("taxaDaCompra", () => {
  it("abaixo da virada, só o fixo", () => {
    expect(taxaDaCompra(10, FAIXAS)).toBe(0.45);
    expect(taxaDaCompra(99.99, FAIXAS)).toBe(0.45);
  });

  it("na virada e acima, percentual mais fixo", () => {
    // 100 x 2% = 2,00, mais 0,65.
    expect(taxaDaCompra(100, FAIXAS)).toBe(2.65);
    // 250 x 2% = 5,00, mais 0,65.
    expect(taxaDaCompra(250, FAIXAS)).toBe(5.65);
  });

  it("arredonda para centavo", () => {
    // 33,33 x 2% = 0,6666, que não existe em dinheiro.
    expect(taxaDaCompra(133.33, [{ apartirDe: 0, percentual: 2, fixo: 0 }])).toBe(
      2.67,
    );
  });

  it("nunca passa do valor da compra", () => {
    // Faixa cadastrada errada (fixo de R$ 50 numa compra de R$ 10) deixaria o
    // líquido negativo, e o relatório mostraria prejuízo onde houve venda.
    expect(taxaDaCompra(10, [{ apartirDe: 0, percentual: 0, fixo: 50 }])).toBe(
      10,
    );
  });

  it("valor zero ou negativo não gera taxa", () => {
    expect(taxaDaCompra(0, FAIXAS)).toBe(0);
    expect(taxaDaCompra(-5, FAIXAS)).toBe(0);
  });

  it("sem faixa nenhuma, taxa zero", () => {
    expect(taxaDaCompra(500, [])).toBe(0);
  });
});

describe("taxaTotal", () => {
  const porProvider = new Map([["SYNCPAY", FAIXAS]]);

  it("soma o que cada compra pagou", () => {
    const r = taxaTotal(
      [
        { valor: 10, provider: "SYNCPAY" }, // 0,45
        { valor: 250, provider: "SYNCPAY" }, // 5,65
      ],
      porProvider,
    );
    expect(r.total).toBe(6.1);
    expect(r.semTaxa).toBe(0);
  });

  it("compra sem gateway não paga taxa e não conta como pendência", () => {
    // Campanha gratuita e aprovação no painel não passaram por gateway: não
    // há taxa a cobrar nem faixa a cadastrar.
    const r = taxaTotal([{ valor: 500, provider: null }], porProvider);
    expect(r.total).toBe(0);
    expect(r.semTaxa).toBe(0);
  });

  it("gateway sem faixa cadastrada é contado, não chutado", () => {
    // Somar zero em silêncio faria o líquido parecer maior do que é. A tela
    // precisa poder dizer que o número está incompleto.
    const r = taxaTotal(
      [
        { valor: 100, provider: "SYNCPAY" },
        { valor: 100, provider: "HORSEPAY" },
      ],
      porProvider,
    );
    expect(r.total).toBe(2.65);
    expect(r.semTaxa).toBe(1);
  });

  it("soma de muitas compras fecha no centavo", () => {
    const compras = Array.from({ length: 3 }, () => ({
      valor: 133.33,
      provider: "SYNCPAY",
    }));
    // 133,33 x 2% = 2,6666 -> 2,67, mais 0,65 = 3,32 cada.
    expect(taxaTotal(compras, porProvider).total).toBe(9.96);
  });
});

describe("descreverFaixa", () => {
  it("escreve a regra numa linha", () => {
    expect(descreverFaixa(FAIXAS[0]!, brl)).toBe("R$ 0,45 por pagamento");
    expect(descreverFaixa(FAIXAS[1]!, brl)).toBe(
      "2% + R$ 0,65 acima de R$ 100,00",
    );
  });

  it("faixa só percentual não mostra um fixo de zero", () => {
    expect(descreverFaixa({ apartirDe: 0, percentual: 1.5, fixo: 0 }, brl)).toBe(
      "1,5% por pagamento",
    );
  });

  it("faixa zerada ainda diz alguma coisa", () => {
    expect(descreverFaixa({ apartirDe: 0, percentual: 0, fixo: 0 }, brl)).toBe(
      "R$ 0,00 por pagamento",
    );
  });
});
