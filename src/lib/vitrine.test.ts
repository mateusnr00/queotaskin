import { describe, expect, it } from "vitest";

import {
  ORDEM_DA_VITRINE,
  ORDEM_DO_PAINEL,
  separarPrincipal,
} from "./vitrine";

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

describe("ORDEM_DO_PAINEL", () => {
  it("agrupa por situação ANTES de qualquer outra coisa", () => {
    // O defeito que isto conserta: um sorteio em 100%, acabado, sentado acima
    // de uma campanha em 0% que precisa de atenção hoje. A situação tem que
    // ser a primeira chave, senão a ordem de exibição embaralha os grupos.
    expect(ORDEM_DO_PAINEL[0]).toEqual({ status: "asc" });
  });

  it("dentro das encerradas, a que ainda não foi sorteada vem primeiro", () => {
    // Ela é a que pede ação: fechou a venda e o sorteio não saiu. Nulos
    // primeiro é exatamente isso.
    expect(ORDEM_DO_PAINEL[1]).toEqual({
      winnerDrawnAt: { sort: "desc", nulls: "first" },
    });
  });

  it("a ordem manual das setinhas continua valendo dentro do grupo", () => {
    // Agrupar por situação não pode atropelar a ordenação à mão, que é do
    // dono da operação.
    expect(ORDEM_DO_PAINEL.slice(2)).toEqual([
      { principal: "desc" },
      { ordem: "asc" },
      { createdAt: "desc" },
    ]);
  });

  it("a vitrine pública NÃO herda o agrupamento do painel", () => {
    // Lá só entra campanha viva, então agrupar por situação não teria o que
    // separar, e mudaria a ordem que o público já conhece.
    expect(ORDEM_DA_VITRINE).not.toContainEqual({ status: "asc" });
    expect(ORDEM_DA_VITRINE[0]).toEqual({ principal: "desc" });
  });
});
