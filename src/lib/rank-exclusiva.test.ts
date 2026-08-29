import { describe, expect, it } from "vitest";

import {
  ESCADA_DE_RANK,
  MAX_MIN_LEVEL,
  NIVEL_DE_PRESTIGIO,
  degrauDoRank,
  meetsMinLevel,
  xpMinimoParaRank,
} from "./rank";

const XP_NIVEL_10 = 47_000;
const XP_NIVEL_21 = 300_000;
const XP_MVP = 350_000;
const XP_GOAT = 500_000;

describe("escada de exigência", () => {
  it("vai do nível 1 ao GOAT", () => {
    // O degrau se chama pelo nome da patente, e não pelo número: é assim que
    // ele aparece no seletor do painel e no aviso da campanha exclusiva.
    expect(ESCADA_DE_RANK[0]).toMatchObject({ valor: 1, label: "Prata I" });
    expect(ESCADA_DE_RANK.at(-1)).toMatchObject({
      valor: MAX_MIN_LEVEL,
      label: "GOAT",
    });
    // 21 níveis numéricos mais três patentes.
    expect(ESCADA_DE_RANK).toHaveLength(24);
  });

  it("não inclui o nível 0, que é o mesmo que campanha aberta", () => {
    expect(ESCADA_DE_RANK.some((d) => d.valor === 0)).toBe(false);
  });

  it("sobe sempre, sem degrau repetido nem fora de ordem", () => {
    for (let i = 1; i < ESCADA_DE_RANK.length; i++) {
      expect(ESCADA_DE_RANK[i].valor).toBe(ESCADA_DE_RANK[i - 1].valor + 1);
      expect(ESCADA_DE_RANK[i].xp).toBeGreaterThan(ESCADA_DE_RANK[i - 1].xp);
    }
  });

  it("dá o degrau pelo valor gravado", () => {
    expect(degrauDoRank(10)?.label).toBe("AK I");
    expect(degrauDoRank(NIVEL_DE_PRESTIGIO.GOAT)?.label).toBe("GOAT");
    expect(degrauDoRank(null)).toBeNull();
    expect(degrauDoRank(0)).toBeNull();
    expect(degrauDoRank(99)).toBeNull();
  });

  it("traduz o degrau em XP exigido", () => {
    expect(xpMinimoParaRank(10)).toBe(XP_NIVEL_10);
    expect(xpMinimoParaRank(NIVEL_DE_PRESTIGIO.MVP)).toBe(XP_MVP);
    expect(xpMinimoParaRank(null)).toBe(0);
  });
});

describe("meetsMinLevel", () => {
  it("campanha aberta deixa qualquer um entrar", () => {
    expect(meetsMinLevel(0, null)).toBe(true);
    expect(meetsMinLevel(0, 0)).toBe(true);
  });

  it("nível numérico compara pelo XP acumulado", () => {
    expect(meetsMinLevel(XP_NIVEL_10 - 1, 10)).toBe(false);
    expect(meetsMinLevel(XP_NIVEL_10, 10)).toBe(true);
  });

  // O caso que não existia antes: prestígio era curinga e passava em tudo,
  // então não havia como reservar uma campanha para MVP ou GOAT.
  it("campanha de prestígio barra quem está no topo dos níveis numéricos", () => {
    expect(meetsMinLevel(XP_NIVEL_21, NIVEL_DE_PRESTIGIO.MVP)).toBe(false);
    expect(meetsMinLevel(XP_NIVEL_21, NIVEL_DE_PRESTIGIO.GOAT)).toBe(false);
  });

  it("prestígio entra na sua patente e nas de baixo", () => {
    expect(meetsMinLevel(XP_MVP, NIVEL_DE_PRESTIGIO.MVP)).toBe(true);
    expect(meetsMinLevel(XP_MVP, 21)).toBe(true);
    expect(meetsMinLevel(XP_MVP, 1)).toBe(true);
  });

  it("MVP ainda não é GOAT", () => {
    expect(meetsMinLevel(XP_MVP, NIVEL_DE_PRESTIGIO.GOAT)).toBe(false);
    expect(meetsMinLevel(XP_GOAT, NIVEL_DE_PRESTIGIO.GOAT)).toBe(true);
  });

  it("XP negativo ou quebrado não fura a exigência", () => {
    expect(meetsMinLevel(-500, 1)).toBe(false);
    expect(meetsMinLevel(999.9, 1)).toBe(false);
    expect(meetsMinLevel(1000.9, 1)).toBe(true);
  });
});
