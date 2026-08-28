import { describe, expect, it } from "vitest";

import { ORDEM_DA_VITRINE, separarPrincipal } from "./vitrine";

const c = (id: string, principal = false) => ({ id, principal });

describe("ORDEM_DA_VITRINE", () => {
  // A ordem importa: trocar os dois primeiros faria a principal só ganhar
  // desempate, em vez de mandar.
  it("põe principal antes da ordem manual, e a data por último", () => {
    expect(ORDEM_DA_VITRINE).toEqual([
      { principal: "desc" },
      { ordem: "asc" },
      { createdAt: "desc" },
    ]);
  });
});

describe("separarPrincipal", () => {
  it("tira a marcada da lista", () => {
    const lista = [c("a"), c("b", true), c("c")];
    const { principal, demais } = separarPrincipal(lista);
    expect(principal?.id).toBe("b");
    expect(demais.map((x) => x.id)).toEqual(["a", "c"]);
  });

  // Sem esta queda a vitrine ficaria sem card grande e com um buraco no topo
  // só porque ninguém marcou nada no painel.
  it("sem marcada, a primeira assume", () => {
    const { principal, demais } = separarPrincipal([c("a"), c("b")]);
    expect(principal?.id).toBe("a");
    expect(demais.map((x) => x.id)).toEqual(["b"]);
  });

  it("lista vazia não inventa principal", () => {
    expect(separarPrincipal([])).toEqual({ principal: null, demais: [] });
  });

  it("uma só campanha vira a principal e não sobra nada", () => {
    const { principal, demais } = separarPrincipal([c("a")]);
    expect(principal?.id).toBe("a");
    expect(demais).toEqual([]);
  });
});
