import { describe, expect, it } from "vitest";

import { lerArquivoDeSkin } from "@/lib/arquivo-de-skin";
import { procurar, type EntradaDoCatalogo } from "@/lib/cs2-catalogo";

describe("lerArquivoDeSkin", () => {
  it("lê o formato da Steam, com o desgaste entre parênteses", () => {
    expect(lerArquivoDeSkin("AK-47 | Redline (Field-Tested).png")).toEqual({
      nome: "AK-47 | Redline",
      wear: "FIELD_TESTED",
      statTrak: false,
      souvenir: false,
    });
  });

  it("lê os cinco desgastes escritos por extenso", () => {
    const casos = [
      ["AWP | Asiimov (Factory New).png", "FACTORY_NEW"],
      ["AWP | Asiimov (Minimal Wear).png", "MINIMAL_WEAR"],
      ["AWP | Asiimov (Field-Tested).png", "FIELD_TESTED"],
      ["AWP | Asiimov (Well-Worn).png", "WELL_WORN"],
      ["AWP | Asiimov (Battle-Scarred).png", "BATTLE_SCARRED"],
    ] as const;
    for (const [arquivo, wear] of casos) {
      const lido = lerArquivoDeSkin(arquivo);
      expect(lido.wear).toBe(wear);
      expect(lido.nome).toBe("AWP | Asiimov");
    }
  });

  it("lê a sigla no fim, que é como se digita de cabeça", () => {
    expect(lerArquivoDeSkin("awp asiimov ft.jpg")).toEqual({
      nome: "awp asiimov",
      wear: "FIELD_TESTED",
      statTrak: false,
      souvenir: false,
    });
    expect(lerArquivoDeSkin("desert eagle blaze fn.webp").wear).toBe(
      "FACTORY_NEW",
    );
  });

  it("sigla só no fim: não confunde palavra do meio do nome", () => {
    // "Mann Co." não vira Minimal Wear, e "BS" no meio não vira Battle-Scarred.
    expect(lerArquivoDeSkin("AK-47 | Wasteland Rebel.png").wear).toBeNull();
    expect(lerArquivoDeSkin("Five-SeveN | Fowl Play.png").wear).toBeNull();
  });

  it("tira o sufixo de download repetido", () => {
    expect(lerArquivoDeSkin("AK-47 | Redline (Field-Tested) (1).png")).toEqual({
      nome: "AK-47 | Redline",
      wear: "FIELD_TESTED",
      statTrak: false,
      souvenir: false,
    });
    expect(lerArquivoDeSkin("AWP | Asiimov (Factory New) - Copia.png").nome).toBe(
      "AWP | Asiimov",
    );
  });

  it("tira a numeração de ordenação da frente", () => {
    expect(lerArquivoDeSkin("01 - AWP | Dragon Lore (FN).png").nome).toBe(
      "AWP | Dragon Lore",
    );
    expect(lerArquivoDeSkin("003_M4A4 Howl (MW).jpg").nome).toBe("M4A4 Howl");
  });

  it("reconhece StatTrak e Souvenir sem tirá-los do nome", () => {
    const st = lerArquivoDeSkin("StatTrak™ M4A1-S | Printstream (MW).png");
    expect(st.statTrak).toBe(true);
    expect(st.wear).toBe("MINIMAL_WEAR");
    expect(st.nome).toContain("Printstream");

    const sv = lerArquivoDeSkin("Souvenir AWP | Dragon Lore (FN).png");
    expect(sv.souvenir).toBe(true);
  });

  it("mantém a estrela da faca, que o casamento já sabe ignorar", () => {
    const lido = lerArquivoDeSkin("★ Karambit | Doppler (Factory New).webp");
    expect(lido.wear).toBe("FACTORY_NEW");
    expect(lido.nome).toBe("★ Karambit | Doppler");
  });

  it("arquivo sem desgaste é caso legítimo, e não erro", () => {
    expect(lerArquivoDeSkin("Sir Bloody Miami Darryl.png")).toEqual({
      nome: "Sir Bloody Miami Darryl",
      wear: null,
      statTrak: false,
      souvenir: false,
    });
  });

  it("aceita separador de underline e ponto no lugar do espaço", () => {
    expect(lerArquivoDeSkin("ak47_redline_field_tested.png").wear).toBe(
      "FIELD_TESTED",
    );
    expect(lerArquivoDeSkin("glock_18_fade_fn.png").wear).toBe("FACTORY_NEW");
  });

  it("aceita o caminho inteiro que o seletor de pasta entrega", () => {
    expect(
      lerArquivoDeSkin("artes/facas/★ Butterfly Knife | Fade (FN).png").nome,
    ).toBe("★ Butterfly Knife | Fade");
  });

  it("não deixa o nome vazio virar espaço em branco", () => {
    expect(lerArquivoDeSkin("(Field-Tested).png").nome).toBe("");
  });
});

// A leitura do arquivo só serve se o nome que sai dela achar a skin no
// catálogo. Estes três são os que quebrariam um casador ingênuo: a estrela
// das facas, a ausência dela, e o selo de StatTrak.
describe("do nome do arquivo até a linha do catálogo", () => {
  const nomes = [
    "AK-47 | Redline",
    "AWP | Asiimov",
    "M4A4 | Howl",
    "★ Karambit | Doppler",
    "Desert Eagle | Blaze",
    "Glock-18 | Fade",
    "USP-S | Kill Confirmed",
  ];
  const indice: EntradaDoCatalogo[] = nomes.map((nome) => ({
    nome,
    imagem: null,
    raridade: null,
    desgaste: null,
    desgastesDisponiveis: [],
    colecao: null,
    categoria: "",
  }));
  const casar = (arquivo: string) =>
    procurar(lerArquivoDeSkin(arquivo).nome, indice).exata?.nome ?? null;

  it("acha a faca com a estrela no arquivo", () => {
    expect(casar("★ Karambit | Doppler (Factory New) (1).png")).toBe(
      "★ Karambit | Doppler",
    );
  });

  it("acha a mesma faca sem a estrela no arquivo", () => {
    expect(casar("karambit doppler fn.png")).toBe("★ Karambit | Doppler");
  });

  it("StatTrak no arquivo acha a linha sem StatTrak", () => {
    expect(casar("StatTrak™ AK-47 | Redline (FT).png")).toBe("AK-47 | Redline");
  });

  it("o que não existe no catálogo não casa com nada parecido", () => {
    expect(casar("AK-47 | Vulcan (Minimal Wear).png")).toBeNull();
  });
});
