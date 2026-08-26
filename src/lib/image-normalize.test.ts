import { describe, expect, it } from "vitest";

import { encaixarNoQuadro } from "./image-normalize";
import { PROPORCAO_DA_SKIN, QUADRO_DA_SKIN } from "./cs2";

const QUADRO = { largura: QUADRO_DA_SKIN.largura, altura: QUADRO_DA_SKIN.altura };

/** Sobra dos dois lados do eixo, para checar centralização. */
function sobras(
  r: { x: number; y: number; largura: number; altura: number },
  quadro: { largura: number; altura: number }
) {
  return {
    esquerda: r.x,
    direita: quadro.largura - (r.x + r.largura),
    topo: r.y,
    base: quadro.altura - (r.y + r.altura),
  };
}

describe("encaixarNoQuadro", () => {
  it("imagem já na proporção preenche o quadro inteiro", () => {
    const r = encaixarNoQuadro({ ...QUADRO }, QUADRO);
    expect(r).toEqual({ x: 0, y: 0, ...QUADRO });
  });

  it("mesma proporção em outro tamanho também preenche", () => {
    const metade = {
      largura: QUADRO.largura / 2,
      altura: QUADRO.altura / 2,
    };
    const r = encaixarNoQuadro(metade, QUADRO);
    expect({ largura: r.largura, altura: r.altura }).toEqual({ ...QUADRO });
  });

  it("nunca estoura o quadro, que seria corte", () => {
    const casos = [
      { largura: 800, altura: 800 },
      { largura: 600, altura: 1600 },
      { largura: 3000, altura: 900 },
      { largura: 64, altura: 64 },
      { largura: 4000, altura: 4000 },
      { largura: 1, altura: 9999 },
    ];
    for (const origem of casos) {
      const r = encaixarNoQuadro(origem, QUADRO);
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.largura).toBeLessThanOrEqual(QUADRO.largura);
      expect(r.y + r.altura).toBeLessThanOrEqual(QUADRO.altura);
    }
  });

  it("mantém a proporção da origem, não a distorce para encher", () => {
    const r = encaixarNoQuadro({ largura: 600, altura: 1600 }, QUADRO);
    expect(r.largura / r.altura).toBeCloseTo(600 / 1600, 2);
  });

  it("centraliza: a sobra fica igual dos dois lados", () => {
    // Imagem alta: sobra na horizontal, encosta em cima e embaixo.
    const alta = sobras(encaixarNoQuadro({ largura: 600, altura: 1600 }, QUADRO), QUADRO);
    expect(Math.abs(alta.esquerda - alta.direita)).toBeLessThanOrEqual(1);
    expect(alta.topo).toBe(0);

    // Imagem larga: o oposto.
    const larga = sobras(encaixarNoQuadro({ largura: 3000, altura: 900 }, QUADRO), QUADRO);
    expect(Math.abs(larga.topo - larga.base)).toBeLessThanOrEqual(1);
    expect(larga.esquerda).toBe(0);
  });

  it("amplia a imagem pequena em vez de deixar um selo no meio do quadro", () => {
    const r = encaixarNoQuadro({ largura: 64, altura: 64 }, QUADRO);
    expect(r.altura).toBe(QUADRO.altura);
  });

  it("dimensão zero não vira divisão por zero nem NaN", () => {
    for (const origem of [
      { largura: 0, altura: 100 },
      { largura: 100, altura: 0 },
      { largura: 0, altura: 0 },
    ]) {
      const r = encaixarNoQuadro(origem, QUADRO);
      for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("QUADRO_DA_SKIN", () => {
  it("é o tamanho real da arte, 1800x1350", () => {
    // Ancorado de propósito. O resto do arquivo deriva do quadro para
    // acompanhar mudanças, e sem esta linha nada perceberia o número sendo
    // trocado por engano: os testes continuariam verdes com o quadro errado,
    // e o defeito só apareceria como faixa vazia na capa em produção.
    expect(QUADRO_DA_SKIN).toEqual({ largura: 1800, altura: 1350 });
  });

  it("é 4:3, que é a proporção que a arte é feita", () => {
    expect(QUADRO_DA_SKIN.largura / QUADRO_DA_SKIN.altura).toBeCloseTo(4 / 3, 6);
  });
});

describe("PROPORCAO_DA_SKIN", () => {
  it("é a proporção do quadro, senão a moldura da tela mente sobre o arquivo", () => {
    const [l, a] = PROPORCAO_DA_SKIN.split("/").map((n) => Number(n.trim()));
    expect(l / a).toBeCloseTo(QUADRO_DA_SKIN.largura / QUADRO_DA_SKIN.altura, 6);
  });
});
