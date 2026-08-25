import { describe, expect, it } from "vitest";

import {
  fullSkinName,
  hasSkinData,
  headlineSkin,
  isValidTradeUrl,
  rarityColor,
  steamIdFromTradeUrl,
  wearFromFloat,
} from "@/lib/cs2";

describe("wearFromFloat", () => {
  it("classifica os limites de cada faixa da Valve", () => {
    expect(wearFromFloat(0)).toBe("FACTORY_NEW");
    expect(wearFromFloat(0.0699)).toBe("FACTORY_NEW");
    expect(wearFromFloat(0.07)).toBe("MINIMAL_WEAR");
    expect(wearFromFloat(0.1499)).toBe("MINIMAL_WEAR");
    expect(wearFromFloat(0.15)).toBe("FIELD_TESTED");
    expect(wearFromFloat(0.3799)).toBe("FIELD_TESTED");
    expect(wearFromFloat(0.38)).toBe("WELL_WORN");
    expect(wearFromFloat(0.45)).toBe("BATTLE_SCARRED");
  });

  it("trata 1.0 como Battle-Scarred, e não como fora de faixa", () => {
    expect(wearFromFloat(1)).toBe("BATTLE_SCARRED");
  });

  it("rejeita valores fora de 0–1", () => {
    expect(wearFromFloat(-0.1)).toBeNull();
    expect(wearFromFloat(1.5)).toBeNull();
    expect(wearFromFloat(Number.NaN)).toBeNull();
  });
});

describe("isValidTradeUrl", () => {
  const valid =
    "https://steamcommunity.com/tradeoffer/new/?partner=123456789&token=aBc-dEf_1";

  it("aceita o formato exato gerado pela Steam", () => {
    expect(isValidTradeUrl(valid)).toBe(true);
    expect(isValidTradeUrl(`  ${valid}  `)).toBe(true);
  });

  it("rejeita link truncado, sem token ou de outro domínio", () => {
    expect(isValidTradeUrl("https://steamcommunity.com/tradeoffer/new/")).toBe(false);
    expect(
      isValidTradeUrl("https://steamcommunity.com/tradeoffer/new/?partner=123456789"),
    ).toBe(false);
    expect(
      isValidTradeUrl("http://steamcommunity.com/tradeoffer/new/?partner=1&token=x"),
    ).toBe(false);
    expect(
      isValidTradeUrl("https://steamcommunlty.com/tradeoffer/new/?partner=1&token=x"),
    ).toBe(false);
    expect(isValidTradeUrl("")).toBe(false);
  });
});

describe("steamIdFromTradeUrl", () => {
  it("converte o accountId do link para SteamID64", () => {
    expect(
      steamIdFromTradeUrl(
        "https://steamcommunity.com/tradeoffer/new/?partner=1&token=abc",
      ),
    ).toBe("76561197960265729");
  });

  it("devolve null quando não há partner no link", () => {
    expect(steamIdFromTradeUrl("https://steamcommunity.com/")).toBeNull();
  });
});

describe("fullSkinName", () => {
  it("monta nome com prefixo StatTrak e desgaste", () => {
    expect(
      fullSkinName({
        skinName: "M4A1-S | Printstream",
        skinStatTrak: true,
        skinWear: "FACTORY_NEW",
      }),
    ).toBe("StatTrak™ M4A1-S | Printstream (Nova de Fábrica)");
  });

  it("não duplica prefixo nem desgaste já presentes no nome", () => {
    expect(
      fullSkinName({
        skinName: "StatTrak™ AK-47 | Redline (Testada em Campo)",
        skinStatTrak: true,
        skinWear: "FIELD_TESTED",
      }),
    ).toBe("StatTrak™ AK-47 | Redline (Testada em Campo)");
  });

  it("cai na descrição quando não há nome de skin", () => {
    expect(fullSkinName({ description: "R$ 500 em saldo" })).toBe("R$ 500 em saldo");
  });
});

describe("headlineSkin", () => {
  it("escolhe o prêmio de maior raridade, não o primeiro da lista", () => {
    const prizes = [
      { skinName: "AK-47 | Redline", skinRarity: "CLASSIFIED" as const },
      { skinName: "★ Karambit | Doppler", skinRarity: "COVERT" as const },
      { skinName: "P250 | Sand Dune", skinRarity: "CONSUMER" as const },
    ];
    expect(headlineSkin(prizes)?.skinName).toBe("★ Karambit | Doppler");
  });

  it("sem raridade em nenhum prêmio, devolve o primeiro", () => {
    const prizes = [{ skinName: "Saldo" }, { skinName: "Mousepad" }];
    expect(headlineSkin(prizes)?.skinName).toBe("Saldo");
  });

  it("devolve null para lista vazia", () => {
    expect(headlineSkin([])).toBeNull();
  });
});

describe("hasSkinData", () => {
  it("reconhece prêmio com qualquer metadado de skin", () => {
    expect(hasSkinData({ skinRarity: "COVERT" })).toBe(true);
    expect(hasSkinData({ skinFloat: 0 })).toBe(true);
    expect(hasSkinData({ skinStatTrak: true })).toBe(true);
  });

  it("prêmio sem nenhum campo de skin não vira card colorido", () => {
    expect(hasSkinData({ skinName: null, skinRarity: null })).toBe(false);
    expect(hasSkinData({})).toBe(false);
  });
});

describe("rarityColor", () => {
  it("usa a cor oficial da Valve e aplica alfa quando pedido", () => {
    expect(rarityColor("COVERT")).toBe("#eb4b4b");
    expect(rarityColor("COVERT", 0.5)).toBe("rgba(235, 75, 75, 0.5)");
  });

  it("cai num cinza neutro quando a raridade não foi informada", () => {
    expect(rarityColor(null)).toBe("#64748b");
  });
});
