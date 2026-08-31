import { describe, expect, it } from "vitest";

import {
  CONFIGURACAO_PADRAO,
  STATUS_PADRAO,
  statusDaCampanha,
  type ConfiguracaoDeStatus,
} from "./campanha-status";

const config = (parcial: Partial<ConfiguracaoDeStatus> = {}) => ({
  ...CONFIGURACAO_PADRAO,
  ...parcial,
});

describe("statusDaCampanha", () => {
  it("no começo da venda chama para comprar", () => {
    expect(statusDaCampanha(0, 100)).toBe(STATUS_PADRAO.early);
    expect(statusDaCampanha(10, 100)).toBe(STATUS_PADRAO.early);
    expect(statusDaCampanha(49, 100)).toBe(STATUS_PADRAO.early);
  });

  it("nunca anuncia urgência com pouca venda", () => {
    // Foi o defeito real: uma campanha com zero vendido exibindo "corre que
    // está acabando", porque o texto da faixa inicial era digitado à mão.
    // Agora as quatro faixas são automáticas, e nenhuma entrada externa
    // consegue pôr urgência aqui.
    for (const vendidos of [0, 1, 25, 49]) {
      const texto = statusDaCampanha(vendidos, 100);
      expect(texto).toBe(STATUS_PADRAO.early);
      expect(texto).not.toBe(STATUS_PADRAO.almostGone);
      expect(texto).not.toBe(STATUS_PADRAO.soldOut);
    }
  });

  it("na metade muda de tom", () => {
    expect(statusDaCampanha(50, 100)).toBe(STATUS_PADRAO.halfway);
    expect(statusDaCampanha(79, 100)).toBe(STATUS_PADRAO.halfway);
  });

  it("perto do fim aperta", () => {
    expect(statusDaCampanha(80, 100)).toBe(STATUS_PADRAO.almostGone);
    expect(statusDaCampanha(99, 100)).toBe(STATUS_PADRAO.almostGone);
  });

  it("esgotado é por número, não por percentual arredondado", () => {
    // Com 10 mil números, 9.999 dão 99,99%, que arredondado vira 100 e
    // anunciaria esgotado com número ainda à venda.
    expect(statusDaCampanha(9_999, 10_000)).toBe(STATUS_PADRAO.almostGone);
    expect(statusDaCampanha(10_000, 10_000)).toBe(STATUS_PADRAO.soldOut);
  });

  it("vendas acima do total continuam esgotado, não estouram para outra faixa", () => {
    expect(statusDaCampanha(120, 100)).toBe(STATUS_PADRAO.soldOut);
  });

  it("campanha sem números não vira esgotado por divisão por zero", () => {
    expect(statusDaCampanha(0, 0)).toBe(STATUS_PADRAO.early);
  });

  it("os quatro textos são personalizáveis", () => {
    const meus = config({
      earlyText: "Comece por aqui",
      halfwayText: "Passou da metade",
      almostGoneText: "Corre!",
      soldOutText: "Acabou",
    });
    expect(statusDaCampanha(0, 100, meus)).toBe("Comece por aqui");
    expect(statusDaCampanha(50, 100, meus)).toBe("Passou da metade");
    expect(statusDaCampanha(80, 100, meus)).toBe("Corre!");
    expect(statusDaCampanha(100, 100, meus)).toBe("Acabou");
  });

  it("texto só de espaços cai no padrão, e não deixa o selo vazio", () => {
    expect(statusDaCampanha(0, 100, config({ earlyText: "   " }))).toBe(
      STATUS_PADRAO.early
    );
  });

  it("os percentuais de virada são configuráveis", () => {
    // Campanha de 100 números tem outro ritmo que uma de 10 mil.
    const cedo = config({ halfwayPercent: 20, almostGonePercent: 40 });
    expect(statusDaCampanha(19, 100, cedo)).toBe(STATUS_PADRAO.early);
    expect(statusDaCampanha(20, 100, cedo)).toBe(STATUS_PADRAO.halfway);
    expect(statusDaCampanha(40, 100, cedo)).toBe(STATUS_PADRAO.almostGone);
  });
});

describe("campanha gratuita", () => {
  it('troca o "Adquira já!" padrão por "Participe já!"', () => {
    expect(statusDaCampanha(0, 100, CONFIGURACAO_PADRAO, true)).toBe(
      "Participe já!",
    );
  });

  it("respeita o texto do painel, mesmo sendo gratuita", () => {
    // Quem escreveu sabe o que quis dizer; trocar por baixo seria decidir
    // pelo admin numa campanha só.
    expect(
      statusDaCampanha(
        0,
        100,
        { ...CONFIGURACAO_PADRAO, earlyText: "Corre que é de graça" },
        true,
      ),
    ).toBe("Corre que é de graça");
  });

  it("não mexe nas outras faixas", () => {
    expect(statusDaCampanha(90, 100, CONFIGURACAO_PADRAO, true)).toBe(
      "Últimos números!",
    );
  });
});
