import { describe, expect, it } from "vitest";

import { apenasComGanhador } from "./ganhadores";

describe("apenasComGanhador", () => {
  const comDono = {
    chave: "premiado-1",
    drawDate: new Date("2026-09-01"),
    winnerName: "Maria",
  };
  const semDono = {
    chave: "premiado-2",
    drawDate: new Date("2026-09-02"),
    winnerName: null,
  };

  it("número premiado sem dono não entra na lista", () => {
    // Este era o defeito: a home resolvia o nome com `?? "Ganhador"` e
    // anunciava prêmio que ninguém levou.
    const r = apenasComGanhador([comDono, semDono], 10);
    expect(r).toHaveLength(1);
    expect(r[0]?.chave).toBe("premiado-1");
  });

  it("lista vazia quando ninguém ganhou nada ainda", () => {
    // O estado de um site que acabou de abrir, ou que teve as vendas
    // zeradas: a seção some inteira em vez de mostrar cartão fantasma.
    expect(apenasComGanhador([semDono], 10)).toEqual([]);
  });

  it("ordena do mais recente para o mais antigo", () => {
    const antigo = { ...comDono, chave: "a", drawDate: new Date("2026-01-01") };
    const novo = { ...comDono, chave: "b", drawDate: new Date("2026-08-01") };
    expect(apenasComGanhador([antigo, novo], 10).map((g) => g.chave)).toEqual([
      "b",
      "a",
    ]);
  });

  it("quem não tem data vai para o fim, e não para o topo", () => {
    // null comparado com número dá NaN, e um NaN no comparador embaralha a
    // lista inteira em vez de mover só o elemento sem data.
    const semData = { ...comDono, chave: "sem-data", drawDate: null };
    const comData = { ...comDono, chave: "com-data" };
    expect(
      apenasComGanhador([semData, comData], 10).map((g) => g.chave),
    ).toEqual(["com-data", "sem-data"]);
  });

  it("corta no máximo pedido", () => {
    const muitos = Array.from({ length: 9 }, (_, i) => ({
      ...comDono,
      chave: `g${i}`,
      drawDate: new Date(2026, 0, i + 1),
    }));
    expect(apenasComGanhador(muitos, 4)).toHaveLength(4);
  });
});
