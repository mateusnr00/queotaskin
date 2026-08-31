import { describe, expect, it } from "vitest";

import {
  calcularRecompensa,
  codigoSugerido,
  codigoValido,
  emCentavos,
  faltaParaProximaEntrada,
  linkDeIndicacao,
  normalizarCodigo,
  LIMIAR_DA_ENTRADA_EM_CENTAVOS,
} from "@/lib/afiliados";

describe("calcularRecompensa", () => {
  it("R$ 9,99 não gera entrada, e o centavo fica guardado", () => {
    expect(
      calcularRecompensa({ progressoAnterior: 0, valorEmCentavos: 999 }),
    ).toEqual({ entradas: 0, progressoRestante: 999 });
  });

  it("R$ 10,00 gera exatamente uma entrada e zera o progresso", () => {
    expect(
      calcularRecompensa({ progressoAnterior: 0, valorEmCentavos: 1000 }),
    ).toEqual({ entradas: 1, progressoRestante: 0 });
  });

  it("R$ 27,50 gera duas e deixa R$ 7,50", () => {
    expect(
      calcularRecompensa({ progressoAnterior: 0, valorEmCentavos: 2750 }),
    ).toEqual({ entradas: 2, progressoRestante: 750 });
  });

  it("progresso anterior soma: R$ 7,50 + R$ 4,00 libera a terceira", () => {
    expect(
      calcularRecompensa({ progressoAnterior: 750, valorEmCentavos: 400 }),
    ).toEqual({ entradas: 1, progressoRestante: 150 });
  });

  it("o critério de aceitação, compra a compra", () => {
    // R$ 27,50 e depois R$ 2,50: três entradas no total, progresso zerado.
    const primeira = calcularRecompensa({
      progressoAnterior: 0,
      valorEmCentavos: 2750,
    });
    const segunda = calcularRecompensa({
      progressoAnterior: primeira.progressoRestante,
      valorEmCentavos: 250,
    });
    expect(primeira.entradas + segunda.entradas).toBe(3);
    expect(segunda.progressoRestante).toBe(0);
  });

  it("não perde centavo em cem compras de R$ 0,01", () => {
    // O teste que só falha com float: 100 somas de um centavo têm que fechar
    // exatamente um real de progresso, sem sobra nem falta.
    let progresso = 0;
    let entradas = 0;
    for (let i = 0; i < 100; i++) {
      const r = calcularRecompensa({
        progressoAnterior: progresso,
        valorEmCentavos: 1,
      });
      progresso = r.progressoRestante;
      entradas += r.entradas;
    }
    expect(entradas).toBe(0);
    expect(progresso).toBe(100);
  });

  it("valor negativo desfaz o progresso, sem passar de zero", () => {
    expect(
      calcularRecompensa({ progressoAnterior: 750, valorEmCentavos: -2750 }),
    ).toEqual({ entradas: 0, progressoRestante: 0 });
  });

  it("uma compra grande libera várias entradas de uma vez", () => {
    expect(
      calcularRecompensa({ progressoAnterior: 0, valorEmCentavos: 100_000 }),
    ).toEqual({ entradas: 100, progressoRestante: 0 });
  });

  it("recusa limiar zero em vez de dividir por ele", () => {
    expect(() =>
      calcularRecompensa({
        progressoAnterior: 0,
        valorEmCentavos: 1000,
        limiar: 0,
      }),
    ).toThrow();
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
    expect(codigoSugerido("Mateus Nascimento Rodrigues", "7k")).toBe(
      "MATEUS7K",
    );
    expect(codigoSugerido("Lucas Silva", "a1b2")).toBe("LUCASA1B2");
  });

  it("nome que não sobra nada ainda devolve algo utilizável", () => {
    expect(codigoSugerido("!!!", "9z")).toBe("AFILIADO9Z");
  });
});

describe("faltaParaProximaEntrada", () => {
  it("R$ 7,40 de progresso: faltam R$ 2,60", () => {
    expect(faltaParaProximaEntrada(740)).toBe(260);
  });

  it("progresso zerado: falta o limiar inteiro", () => {
    expect(faltaParaProximaEntrada(0)).toBe(LIMIAR_DA_ENTRADA_EM_CENTAVOS);
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
