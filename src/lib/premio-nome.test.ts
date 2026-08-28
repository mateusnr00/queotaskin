import { describe, expect, it } from "vitest";

import type { SkinRarity } from "@prisma/client";

import { chaveDoNome, raridadeDoPremio, separarDesgaste } from "./premio-nome";

describe("separarDesgaste", () => {
  it("separa o desgaste em inglês, como a Steam escreve", () => {
    expect(separarDesgaste("AK-47 | Vulcan (Field-Tested)")).toEqual({
      nome: "AK-47 | Vulcan",
      desgaste: "Field-Tested",
    });
    expect(separarDesgaste("★ Flip Knife | Autotronic (Factory New)")).toEqual({
      nome: "★ Flip Knife | Autotronic",
      desgaste: "Factory New",
    });
  });

  it("separa o desgaste traduzido, que é como a página pública escreve", () => {
    expect(separarDesgaste("AWP | Dragon Lore (Testada em Campo)")).toEqual({
      nome: "AWP | Dragon Lore",
      desgaste: "Testada em Campo",
    });
  });

  // O motivo de existir a lista de desgastes conhecidos em vez de simplesmente
  // cortar o último parêntese. Prêmio é texto livre digitado no painel, e
  // "(2 unidades)" faz parte do nome.
  it("não corta parêntese que não é desgaste", () => {
    expect(separarDesgaste("Faca borboleta (2 unidades)")).toEqual({
      nome: "Faca borboleta (2 unidades)",
      desgaste: null,
    });
    expect(separarDesgaste("R$ 500 no Pix")).toEqual({
      nome: "R$ 500 no Pix",
      desgaste: null,
    });
  });

  it("aceita caixa diferente e espaço sobrando", () => {
    expect(separarDesgaste("Desert Eagle | Blaze  (field-tested)  ")).toEqual({
      nome: "Desert Eagle | Blaze",
      desgaste: "field-tested",
    });
  });

  it("com dois parênteses, o desgaste é o do fim", () => {
    expect(separarDesgaste("Skin (rara) (Minimal Wear)")).toEqual({
      nome: "Skin (rara)",
      desgaste: "Minimal Wear",
    });
  });
});

describe("raridadeDoPremio", () => {
  const catalogo = new Map<string, SkinRarity | null>([
    [chaveDoNome("AK-47 | Vulcan"), "COVERT"],
    [chaveDoNome("Glock-18 | Moonrise"), "MIL_SPEC"],
    [chaveDoNome("Agente sem raridade"), null],
  ]);

  it("acha a raridade ignorando o desgaste", () => {
    expect(raridadeDoPremio("AK-47 | Vulcan (Field-Tested)", catalogo)).toBe(
      "COVERT",
    );
    expect(raridadeDoPremio("AK-47 | Vulcan", catalogo)).toBe("COVERT");
  });

  it("ignora caixa e espaço sobrando", () => {
    expect(raridadeDoPremio("  glock-18 |  moonrise  ", catalogo)).toBe(
      "MIL_SPEC",
    );
  });

  // O caso normal: título premiado que não é skin.
  it("devolve null para prêmio fora do catálogo", () => {
    expect(raridadeDoPremio("R$ 500 no Pix", catalogo)).toBeNull();
  });

  // Nome digitado à mão que não bate com o catálogo sai sem cor, e é por isso
  // que o painel mostra a raridade ao lado do campo: sem esse aviso, o erro
  // some.
  it("não adivinha nome parecido", () => {
    expect(raridadeDoPremio("AK47 Vulcan", catalogo)).toBeNull();
  });

  it("skin cadastrada sem raridade não inventa cor", () => {
    expect(raridadeDoPremio("Agente sem raridade", catalogo)).toBeNull();
  });
});
