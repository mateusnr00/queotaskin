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
  it("adiciona sufixo", () => {
    expect(toSlugWithSuffix("Minha Rifa", "AbC123")).toBe(
      "minha-rifa-abc123"
    );
  });
});
