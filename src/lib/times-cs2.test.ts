import { describe, expect, it } from "vitest";

import {
  COR_VALIDA,
  TAG_VALIDA,
  contraste,
  textoSobreACor,
} from "@/lib/times-cs2";

// A lista de times deixou de morar aqui: ela é a tabela Team, e quem a valida
// de ponta a ponta é o teste de integração do cadastro. O que sobrou neste
// arquivo é desenho puro, e é isso que estes testes cobrem.

describe("textoSobreACor", () => {
  it("escolhe preto em fundo claro e branco em fundo escuro", () => {
    expect(textoSobreACor("#facc15")).toBe("#111827"); // amarelo da NAVI
    expect(textoSobreACor("#ffffff")).toBe("#111827");
    expect(textoSobreACor("#111827")).toBe("#ffffff"); // preto da FURIA
    expect(textoSobreACor("#000000")).toBe("#ffffff");
  });

  it("acerta no meio da escala, onde um corte fixo erra", () => {
    // O ciano do Fluxo. Um corte de luminância em 0,45 mandava branco aqui e
    // entregava 3,68:1, quando preto no mesmo fundo passa de 4,5:1.
    expect(textoSobreACor("#0891b2")).toBe("#111827");
  });

  it("sempre escolhe o lado de MAIOR contraste", () => {
    // A garantia que substitui o antigo teste que percorria a lista fixa:
    // agora qualquer cor cadastrada no painel passa por aqui, e a função tem
    // que escolher o melhor dos dois em todas elas.
    for (let r = 0; r < 256; r += 37) {
      for (let g = 0; g < 256; g += 41) {
        for (let b = 0; b < 256; b += 43) {
          const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
          const escolhido = contraste(hex, textoSobreACor(hex));
          const outro = contraste(
            hex,
            textoSobreACor(hex) === "#ffffff" ? "#111827" : "#ffffff",
          );
          expect(escolhido, hex).toBeGreaterThanOrEqual(outro);
        }
      }
    }
  });

  it("a razão de contraste bate com valores conhecidos", () => {
    expect(contraste("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contraste("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("validação do cadastro", () => {
  it("cor: só hex de seis dígitos em minúsculas", () => {
    // O valor entra num style inline. Quebrado não dá erro: o navegador ignora
    // e o emblema fica transparente, sem aviso nenhum.
    expect(COR_VALIDA.test("#0f766e")).toBe(true);
    expect(COR_VALIDA.test("#0F766E")).toBe(false);
    expect(COR_VALIDA.test("#fff")).toBe(false);
    expect(COR_VALIDA.test("vermelho")).toBe(false);
    expect(COR_VALIDA.test("")).toBe(false);
  });

  it("tag: de duas a quatro letras", () => {
    // O emblema corta em quatro, e uma letra só não identifica time nenhum.
    expect(TAG_VALIDA.test("FUR")).toBe(true);
    expect(TAG_VALIDA.test("MIBR")).toBe(true);
    expect(TAG_VALIDA.test("G2")).toBe(true);
    expect(TAG_VALIDA.test("X")).toBe(false);
    expect(TAG_VALIDA.test("FURIA")).toBe(false);
  });
});
