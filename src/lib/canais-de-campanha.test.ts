import { describe, expect, it } from "vitest";

import { CANAIS, canalConhecido, linkDoCanal } from "./canais-de-campanha";

describe("canais de campanha", () => {
  it("monta o link com a origem e o canal", () => {
    expect(linkDoCanal("https://queotaskin.com", "ak-47-redline", "ads")).toBe(
      "https://queotaskin.com/ak-47-redline?utm_source=campaign&utm_content=ads",
    );
  });

  it("barra no fim do endereço não vira barra dupla", () => {
    expect(linkDoCanal("https://queotaskin.com/", "x", "ads")).toContain(
      "queotaskin.com/x?",
    );
  });

  it("reconhece só canal da lista", () => {
    expect(canalConhecido("ads")).toBe(true);
    expect(canalConhecido("inventado")).toBe(false);
  });

  it("os ids são únicos e cabem numa URL sem escapar", () => {
    const ids = CANAIS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });
});
