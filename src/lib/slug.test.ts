import { describe, expect, it } from "vitest";

import { toSlug, toSlugWithSuffix } from "@/lib/slug";

describe("toSlug", () => {
  it("converte para lowercase kebab-case", () => {
    expect(toSlug("Minha Rifa Top")).toBe("minha-rifa-top");
  });

  it("remove acentos", () => {
    expect(toSlug("Rifa do iPhone 16 Pró")).toBe("rifa-do-iphone-16-pro");
  });

  it("remove caracteres especiais", () => {
    expect(toSlug("Rifa #1! @Brasil")).toBe("rifa-1-brasil");
  });
});

describe("toSlugWithSuffix", () => {
  it("tira a barra do nome da skin em vez de traduzir para 'ou'", () => {
    // O slugify traduz simbolo para palavra, e no locale pt o "|" vira "ou".
    // Como toda skin de CS2 tem a barra, sem tratamento a campanha nasceria
    // em /s/awp-ou-dragon-lore.
    expect(toSlug("AWP | Dragon Lore")).toBe("awp-dragon-lore");
  });

  it("descarta a estrela de item raro e o simbolo de marca", () => {
    expect(toSlug("★ Karambit | Doppler")).toBe("karambit-doppler");
    expect(toSlug("StatTrak™ M4A1-S | Printstream")).toBe(
      "stattrak-m4a1-s-printstream"
    );
  });

  it("nao deixa hifen sobrando nas pontas", () => {
    expect(toSlug("  ★ AWP | Dragon Lore  ")).toBe("awp-dragon-lore");
  });

  it("adiciona sufixo", () => {
    expect(toSlugWithSuffix("Minha Rifa", "AbC123")).toBe(
      "minha-rifa-abc123"
    );
  });
});
