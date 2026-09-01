import { describe, expect, it } from "vitest";

import {
  avaliarQualificacao,
  codigoSugerido,
  codigoValido,
  descontoDoCupom,
  emCentavos,
  linkDeIndicacao,
  normalizarCodigo,
  LIMIAR_DA_ENTRADA_EM_CENTAVOS,
  VALOR_DO_CUPOM_EM_CENTAVOS,
} from "@/lib/afiliados";

describe("avaliarQualificacao", () => {
  it("R$ 9,99 não qualifica", () => {
    expect(
      avaliarQualificacao({ pagoEmCentavos: 999, jaQualificou: false }),
    ).toEqual({ qualificou: false, faltaEmCentavos: 1 });
  });

  it("R$ 10,00 qualifica", () => {
    expect(
      avaliarQualificacao({ pagoEmCentavos: 1000, jaQualificou: false }),
    ).toEqual({ qualificou: true, faltaEmCentavos: 0 });
  });

  it("NÃO É PROGRESSIVO: R$ 20, R$ 100 e R$ 1.000 dão o mesmo resultado", () => {
    // A conta antiga era floor(total / 1000) e devolvia 2, 10 e 100 cupons.
    for (const pago of [2000, 10_000, 100_000]) {
      expect(avaliarQualificacao({ pagoEmCentavos: pago, jaQualificou: false })).toEqual(
        { qualificou: true, faltaEmCentavos: 0 },
      );
    }
  });

  it("quem já qualificou nunca qualifica de novo, gaste o que gastar", () => {
    expect(
      avaliarQualificacao({ pagoEmCentavos: 100_000, jaQualificou: true }),
    ).toEqual({ qualificou: false, faltaEmCentavos: 0 });
  });

  it("acumula até o limiar, e diz quanto falta", () => {
    // R$ 6,00 na primeira compra da mesma pessoa.
    expect(
      avaliarQualificacao({ pagoEmCentavos: 600, jaQualificou: false }),
    ).toEqual({ qualificou: false, faltaEmCentavos: 400 });
    // Mais R$ 4,00 fecham os R$ 10.
    expect(
      avaliarQualificacao({ pagoEmCentavos: 1000, jaQualificou: false }),
    ).toEqual({ qualificou: true, faltaEmCentavos: 0 });
  });

  it("total negativo (estorno maior que o pago) não vira crédito", () => {
    expect(
      avaliarQualificacao({ pagoEmCentavos: -500, jaQualificou: false }),
    ).toEqual({ qualificou: false, faltaEmCentavos: LIMIAR_DA_ENTRADA_EM_CENTAVOS });
  });

  it("recusa limiar zero em vez de dividir por ele", () => {
    expect(() =>
      avaliarQualificacao({ pagoEmCentavos: 1000, jaQualificou: false, limiar: 0 }),
    ).toThrow();
  });
});

describe("descontoDoCupom", () => {
  it("cota de R$ 7 consome o cupom inteiro e os R$ 3 se perdem", () => {
    expect(descontoDoCupom({ precoDaCotaEmCentavos: 700 })).toEqual({
      aceita: true,
      descontoEmCentavos: 700,
    });
  });

  it("cota de R$ 10 é coberta exatamente", () => {
    expect(descontoDoCupom({ precoDaCotaEmCentavos: 1000 })).toEqual({
      aceita: true,
      descontoEmCentavos: 1000,
    });
  });

  it("cota de R$ 12 recusa o cupom, sem pagamento complementar", () => {
    // Não existe abater R$ 10 e cobrar R$ 2: cupom que cobre parte da cota é
    // outro produto.
    expect(descontoDoCupom({ precoDaCotaEmCentavos: 1200 })).toEqual({
      aceita: false,
      descontoEmCentavos: 0,
    });
  });

  it("o desconto nunca passa do preço da cota, então não sobra saldo", () => {
    const { descontoEmCentavos } = descontoDoCupom({
      precoDaCotaEmCentavos: 100,
    });
    expect(descontoEmCentavos).toBe(100);
    expect(descontoEmCentavos).toBeLessThan(VALOR_DO_CUPOM_EM_CENTAVOS);
  });

  it("campanha sem preço não aceita cupom", () => {
    expect(descontoDoCupom({ precoDaCotaEmCentavos: 0 }).aceita).toBe(false);
  });
});

describe("normalizarCodigo", () => {
  it("tira acento, espaço e caixa", () => {
    expect(normalizarCodigo(" mateus 7k ")).toBe("MATEUS7K");
    expect(normalizarCodigo("joão_10")).toBe("JOAO_10");
  });

  it("descarta pontuação que não dá para ditar", () => {
    expect(normalizarCodigo("fal!en@2024")).toBe("FALEN2024");
  });

  it("corta no tamanho máximo", () => {
    expect(normalizarCodigo("A".repeat(50))).toHaveLength(20);
  });

  it("código curto demais não vale", () => {
    expect(codigoValido("ab")).toBe(false);
    expect(codigoValido("!!!")).toBe(false);
    expect(codigoValido("gaules10")).toBe(true);
  });
});

describe("codigoSugerido", () => {
  it("usa o primeiro nome mais um sufixo, para dois xarás não colidirem", () => {
    expect(codigoSugerido("Mateus Nascimento Rodrigues", "7k")).toBe("MATEUS7K");
    expect(codigoSugerido("Lucas Silva", "a1b2")).toBe("LUCASA1B2");
  });

  it("nome que não sobra nada ainda devolve algo utilizável", () => {
    expect(codigoSugerido("!!!", "9z")).toBe("AFILIADO9Z");
  });
});

describe("emCentavos", () => {
  it("converte sem o erro do ponto flutuante", () => {
    expect(emCentavos(27.5)).toBe(2750);
    expect(emCentavos(0.1 + 0.2)).toBe(30);
    expect(emCentavos(19.99)).toBe(1999);
  });
});

describe("linkDeIndicacao", () => {
  it("monta o link sem barra dobrada", () => {
    expect(linkDeIndicacao("https://queotaskin.com/", "MATEUS7K")).toBe(
      "https://queotaskin.com/?ref=MATEUS7K",
    );
  });
});
