import { describe, expect, it } from "vitest";

import { MAX_XP_MULTIPLIER, XP_MULTIPLIER_TIERS } from "./config";
import {
  aplicarParticipacao,
  calculateDecayedBoostPoints,
  calculatePurchaseXp,
  cicloDe,
  diaOficial,
  diasEntre,
  faixaDaCompra,
  faixaDoBoost,
  getActivityMultiplier,
  getLuckXpBonus,
  limitarBoost,
  podeGanharBoostDeSorte,
  proximaFaixa,
  type EstadoDaSequencia,
} from "./regras";
import { XP_POR_NIVEL, prestigeFromXp, rankFromXp } from "@/lib/rank";

describe("níveis", () => {
  it("zero XP fica no nível 0", () => {
    expect(rankFromXp(0).level).toBe(0);
    expect(rankFromXp(999).level).toBe(0);
  });

  it("mil XP chega ao nível 1", () => {
    expect(rankFromXp(1_000).level).toBe(1);
  });

  // O degrau exato de cada nível: um off-by-one aqui promove ou segura todo
  // mundo, e ninguém percebe até alguém reclamar.
  it("respeita o limite exato de todos os níveis", () => {
    XP_POR_NIVEL.forEach((xp, nivel) => {
      if (nivel === 0) return;
      expect(rankFromXp(xp).level).toBe(nivel);
      expect(rankFromXp(xp - 1).level).toBe(nivel - 1);
    });
  });
});

describe("GOAT exige XP e gasto", () => {
  it("500 mil XP sem gasto suficiente não vira GOAT", () => {
    expect(prestigeFromXp(500_000, 49_999)?.key).not.toBe("GOAT");
    expect(rankFromXp(500_000, 0).label).not.toBe("GOAT");
  });

  it("500 mil XP com 50 mil gastos vira GOAT", () => {
    expect(prestigeFromXp(500_000, 50_000)?.key).toBe("GOAT");
    expect(rankFromXp(500_000, 50_000).label).toBe("GOAT");
  });

  // Sem o gasto ele para na patente anterior, e não no nível numérico: quem
  // tem 500 mil XP continua sendo Pro Player.
  it("sem gasto, para na patente anterior", () => {
    expect(prestigeFromXp(500_000, 0)?.key).toBe("PRO_PLAYER");
  });

  it("as outras patentes não exigem gasto", () => {
    expect(prestigeFromXp(350_000, 0)?.key).toBe("MVP");
    expect(prestigeFromXp(425_000, 0)?.key).toBe("PRO_PLAYER");
  });
});

describe("multiplicador", () => {
  it("cada faixa devolve o seu multiplicador", () => {
    expect(getActivityMultiplier(0)).toBe(1.0);
    expect(getActivityMultiplier(19)).toBe(1.0);
    expect(getActivityMultiplier(20)).toBe(1.2);
    expect(getActivityMultiplier(40)).toBe(1.5);
    expect(getActivityMultiplier(70)).toBe(2.0);
    expect(getActivityMultiplier(100)).toBe(2.5);
  });

  it("nunca abaixo de 1,0 nem acima de 2,5", () => {
    expect(getActivityMultiplier(-50)).toBe(1.0);
    expect(getActivityMultiplier(9_999)).toBe(2.5);
  });

  it("os pontos ficam entre 0 e 100", () => {
    expect(limitarBoost(-10)).toBe(0);
    expect(limitarBoost(250)).toBe(100);
    expect(limitarBoost(43.9)).toBe(43);
  });

  it("aponta a próxima faixa, e null na maior", () => {
    expect(proximaFaixa(0)?.name).toBe("Aquecido");
    expect(proximaFaixa(45)?.name).toBe("Turbo");
    expect(proximaFaixa(100)).toBeNull();
  });

  it("as faixas sobem sem buraco", () => {
    for (let i = 1; i < XP_MULTIPLIER_TIERS.length; i++) {
      expect(XP_MULTIPLIER_TIERS[i].minBoostPoints).toBeGreaterThan(
        XP_MULTIPLIER_TIERS[i - 1].minBoostPoints,
      );
      expect(XP_MULTIPLIER_TIERS[i].multiplier).toBeGreaterThan(
        XP_MULTIPLIER_TIERS[i - 1].multiplier,
      );
    }
    expect(faixaDoBoost(100).multiplier).toBe(MAX_XP_MULTIPLIER);
  });
});

describe("bônus por faixa de compra", () => {
  it("classifica pelo valor", () => {
    expect(faixaDaCompra(10).faixa).toBe("STANDARD");
    expect(faixaDaCompra(50).faixa).toBe("RELEVANT");
    expect(faixaDaCompra(200).faixa).toBe("HIGH");
    expect(faixaDaCompra(500).faixa).toBe("EXCEPTIONAL");
  });

  it("os bônus são 0, 10%, 25% e 50%", () => {
    expect(faixaDaCompra(10).bonus).toBe(0);
    expect(faixaDaCompra(50).bonus).toBe(0.1);
    expect(faixaDaCompra(200).bonus).toBe(0.25);
    expect(faixaDaCompra(500).bonus).toBe(0.5);
  });
});

describe("boost de sorte", () => {
  it("aumenta com o tempo sem prêmio", () => {
    expect(getLuckXpBonus(0)).toBe(0);
    expect(getLuckXpBonus(13)).toBe(0);
    expect(getLuckXpBonus(14)).toBe(0.1);
    expect(getLuckXpBonus(21)).toBe(0.2);
    expect(getLuckXpBonus(30)).toBe(0.3);
    expect(getLuckXpBonus(400)).toBe(0.3);
  });

  // A regra que separa fidelidade de conta abandonada: sem participação
  // recente, ficar sem prêmio é só não estar jogando.
  it("conta parada não ganha", () => {
    expect(
      podeGanharBoostDeSorte({ diasSemPremio: 90, diasDesdeUltimaParticipacao: 80 }),
    ).toBe(false);
    expect(
      podeGanharBoostDeSorte({ diasSemPremio: 90, diasDesdeUltimaParticipacao: null }),
    ).toBe(false);
  });

  it("quem participou recentemente ganha", () => {
    expect(
      podeGanharBoostDeSorte({ diasSemPremio: 30, diasDesdeUltimaParticipacao: 2 }),
    ).toBe(true);
  });
});

describe("cálculo do XP da compra", () => {
  it("sem bônus, é dez por real", () => {
    const r = calculatePurchaseXp({
      purchaseAmount: 80,
      activityMultiplier: 1,
      purchaseBonus: 0,
      luckBonus: 0,
    });
    expect(r.baseXp).toBe(800);
    expect(r.earnedXp).toBe(800);
    expect(r.bonusXp).toBe(0);
  });

  it("aplica o boost de atividade", () => {
    const r = calculatePurchaseXp({
      purchaseAmount: 80,
      activityMultiplier: 1.2,
      purchaseBonus: 0,
      luckBonus: 0,
    });
    expect(r.earnedXp).toBe(960);
    expect(r.bonusXp).toBe(160);
  });

  it("soma atividade, compra e sorte", () => {
    const r = calculatePurchaseXp({
      purchaseAmount: 100,
      activityMultiplier: 1.2,
      purchaseBonus: 0.25,
      luckBonus: 0.2,
    });
    expect(r.finalMultiplier).toBeCloseTo(1.65, 5);
    expect(r.earnedXp).toBe(1_650);
  });

  // O teto vale para a soma, e não para cada parcela: sem isso três bônus
  // médios já passariam de 2,5x.
  it("corta no teto de 2,5x", () => {
    const r = calculatePurchaseXp({
      purchaseAmount: 100,
      activityMultiplier: 2.5,
      purchaseBonus: 0.5,
      luckBonus: 0.3,
      eventBonus: 1,
    });
    expect(r.finalMultiplier).toBe(2.5);
    expect(r.earnedXp).toBe(2_500);
  });

  it("trunca centavos e nunca devolve XP negativo", () => {
    expect(calculatePurchaseXp({ purchaseAmount: 19.9, activityMultiplier: 1, purchaseBonus: 0, luckBonus: 0 }).baseXp).toBe(190);
    expect(calculatePurchaseXp({ purchaseAmount: 0, activityMultiplier: 1, purchaseBonus: 0, luckBonus: 0 }).earnedXp).toBe(0);
    expect(calculatePurchaseXp({ purchaseAmount: -50, activityMultiplier: 1, purchaseBonus: 0, luckBonus: 0 }).earnedXp).toBe(0);
  });
});

describe("decaimento por inatividade", () => {
  it("dois dias parado não custa nada", () => {
    expect(calculateDecayedBoostPoints(50, 0)).toBe(50);
    expect(calculateDecayedBoostPoints(50, 2)).toBe(50);
  });

  it("o terceiro dia custa dez, e cada dia depois custa cinco", () => {
    expect(calculateDecayedBoostPoints(50, 3)).toBe(40);
    expect(calculateDecayedBoostPoints(50, 4)).toBe(35);
    expect(calculateDecayedBoostPoints(50, 5)).toBe(30);
  });

  it("nunca fica negativo", () => {
    expect(calculateDecayedBoostPoints(5, 30)).toBe(0);
    expect(calculateDecayedBoostPoints(0, 90)).toBe(0);
  });
});

describe("sequência", () => {
  const zerado: EstadoDaSequencia = {
    sequencia: 0,
    recorde: 0,
    ultimoDia: null,
    protecaoDisponivel: true,
    diasAtivosAposProtecao: 0,
  };

  it("a primeira participação abre a sequência", () => {
    expect(aplicarParticipacao(zerado, "2026-08-01").sequencia).toBe(1);
  });

  // A regra que a spec pede em primeiro lugar: sequência é dia diferente, e
  // não quantidade de compras.
  it("várias compras no mesmo dia não somam", () => {
    const um = aplicarParticipacao(zerado, "2026-08-01");
    const dois = aplicarParticipacao(um, "2026-08-01");
    const tres = aplicarParticipacao(dois, "2026-08-01");
    expect(tres.sequencia).toBe(1);
  });

  it("dias consecutivos aumentam", () => {
    let e = aplicarParticipacao(zerado, "2026-08-01");
    e = aplicarParticipacao(e, "2026-08-02");
    e = aplicarParticipacao(e, "2026-08-03");
    expect(e.sequencia).toBe(3);
    expect(e.recorde).toBe(3);
  });

  it("a proteção perdoa uma ausência e é gasta", () => {
    let e = aplicarParticipacao(zerado, "2026-08-01");
    e = aplicarParticipacao(e, "2026-08-03"); // faltou dia 2
    expect(e.sequencia).toBe(2);
    expect(e.protecaoDisponivel).toBe(false);
  });

  it("sem proteção, a ausência reinicia", () => {
    let e = aplicarParticipacao(zerado, "2026-08-01");
    e = aplicarParticipacao(e, "2026-08-03"); // gasta a proteção
    e = aplicarParticipacao(e, "2026-08-05"); // falta de novo
    expect(e.sequencia).toBe(1);
  });

  it("ausência longa reinicia mesmo com proteção", () => {
    let e = aplicarParticipacao(zerado, "2026-08-01");
    e = aplicarParticipacao(e, "2026-08-20");
    expect(e.sequencia).toBe(1);
  });

  it("a proteção volta depois de sete dias ativos", () => {
    let e = aplicarParticipacao(zerado, "2026-08-01");
    e = aplicarParticipacao(e, "2026-08-03"); // gasta
    expect(e.protecaoDisponivel).toBe(false);
    for (let d = 4; d <= 10; d++) {
      e = aplicarParticipacao(e, `2026-08-${String(d).padStart(2, "0")}`);
    }
    expect(e.protecaoDisponivel).toBe(true);
  });

  it("o recorde não cai quando a sequência reinicia", () => {
    let e = aplicarParticipacao(zerado, "2026-08-01");
    e = aplicarParticipacao(e, "2026-08-02");
    e = aplicarParticipacao(e, "2026-08-03");
    e = aplicarParticipacao(e, "2026-08-20");
    expect(e.sequencia).toBe(1);
    expect(e.recorde).toBe(3);
  });

  it("data anterior à última não mexe em nada", () => {
    const e = aplicarParticipacao(
      aplicarParticipacao(zerado, "2026-08-10"),
      "2026-08-05",
    );
    expect(e.sequencia).toBe(1);
    expect(e.ultimoDia).toBe("2026-08-10");
  });
});

describe("datas no fuso oficial", () => {
  // 22h de Brasília já é o dia seguinte em UTC. Usando a data do servidor a
  // sequência quebraria sozinha para quem compra à noite.
  it("22h de Brasília ainda é o mesmo dia", () => {
    expect(diaOficial(new Date("2026-08-28T01:30:00.000Z"))).toBe("2026-08-27");
  });

  it("conta a diferença em dias", () => {
    expect(diasEntre("2026-08-01", "2026-08-04")).toBe(3);
    expect(diasEntre("2026-08-04", "2026-08-04")).toBe(0);
  });

  it("o ciclo é o mês-calendário", () => {
    expect(cicloDe(new Date("2026-08-28T12:00:00.000Z"))).toBe("2026-08");
  });
});
