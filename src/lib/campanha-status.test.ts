import { describe, it, expect } from "vitest";

import {
  CONFIGURACAO_PADRAO,
  STATUS_PADRAO,
  statusDaCampanha,
} from "@/lib/campanha-status";

describe("statusDaCampanha", () => {
  it("abaixo da metade mostra o texto que o admin digitou", () => {
    expect(statusDaCampanha(10, 100, "Sorteio histórico")).toBe(
      "Sorteio histórico"
    );
    expect(statusDaCampanha(49, 100, "Exclusiva VIP")).toBe("Exclusiva VIP");
  });

  it("sem texto do admin, cai no padrão", () => {
    expect(statusDaCampanha(0, 100, null)).toBe(STATUS_PADRAO.manual);
    expect(statusDaCampanha(0, 100, "   ")).toBe(STATUS_PADRAO.manual);
  });

  it("na metade a urgência vence o texto do admin", () => {
    expect(statusDaCampanha(50, 100, "Exclusiva VIP")).toBe(
      STATUS_PADRAO.halfway
    );
  });

  it("perto do fim vence a metade", () => {
    expect(statusDaCampanha(80, 100, "Exclusiva VIP")).toBe(
      STATUS_PADRAO.almostGone
    );
    expect(statusDaCampanha(99, 100, null)).toBe(STATUS_PADRAO.almostGone);
  });

  it("esgotado vence tudo", () => {
    expect(statusDaCampanha(100, 100, "Exclusiva VIP")).toBe(
      STATUS_PADRAO.soldOut
    );
  });

  it("só anuncia esgotado quando não sobra número nenhum", () => {
    // 9.999 de 10.000 dá 99,99%, que arredondado viraria 100 e anunciaria
    // esgotado com número ainda à venda.
    expect(statusDaCampanha(9_999, 10_000, null)).toBe(STATUS_PADRAO.almostGone);
    expect(statusDaCampanha(10_000, 10_000, null)).toBe(STATUS_PADRAO.soldOut);
  });

  it("respeita os percentuais configurados pelo tenant", () => {
    const config = {
      ...CONFIGURACAO_PADRAO,
      halfwayPercent: 30,
      almostGonePercent: 60,
      halfwayText: "Passou de 30",
      almostGoneText: "Passou de 60",
    };
    expect(statusDaCampanha(29, 100, "Manual", config)).toBe("Manual");
    expect(statusDaCampanha(30, 100, "Manual", config)).toBe("Passou de 30");
    expect(statusDaCampanha(60, 100, "Manual", config)).toBe("Passou de 60");
  });

  it("campanha sem números configurados não vira esgotada", () => {
    // Dividir por zero daria Infinity e prenderia o selo em "esgotado".
    expect(statusDaCampanha(0, 0, "Em breve")).toBe("Em breve");
  });
});
