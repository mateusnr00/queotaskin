import { describe, expect, it } from "vitest";

import {
  MAX_LEVEL,
  PRESTIGE_RANKS,
  levelFromXp,
  meetsMinLevel,
  prestigeFromXp,
  rankFromXp,
  rankProgress,
  TIERS,
  tierForLevel,
  xpForLevel,
  xpForPurchase,
} from "@/lib/rank";
import {
  CONTORNOS,
  DESIGN_POR_NIVEL,
  ARCO_IRIS_NIVEL_21,
  LADOS_DO_OCTOGONO,
  type FormaDoSelo,
} from "@/lib/rank-badges";

describe("xpForPurchase", () => {
  it("credita 10 XP por real", () => {
    expect(xpForPurchase(1)).toBe(10);
    expect(xpForPurchase(150)).toBe(1500);
  });

  it("trunca centavos para o real cheio", () => {
    expect(xpForPurchase(19.9)).toBe(190);
    expect(xpForPurchase(19.99)).toBe(190);
    expect(xpForPurchase(0.99)).toBe(0);
  });

  it("respeita um xpPerBrl customizado do tenant", () => {
    expect(xpForPurchase(10, 25)).toBe(250);
  });

  it("não credita nada por valor inválido ou negativo", () => {
    expect(xpForPurchase(0)).toBe(0);
    expect(xpForPurchase(-50)).toBe(0);
    expect(xpForPurchase(Number.NaN)).toBe(0);
  });

  it("cai no padrão quando o tenant configura xpPerBrl zerado", () => {
    expect(xpForPurchase(10, 0)).toBe(100);
  });
});

describe("xpForLevel / levelFromXp", () => {
  it("nível 0 não custa nada — todo mundo começa ranqueado", () => {
    expect(xpForLevel(0)).toBe(0);
    expect(levelFromXp(0)).toBe(0);
  });

  it("segue a curva quadrática documentada", () => {
    expect(xpForLevel(1)).toBe(100); // R$ 10
    expect(xpForLevel(5)).toBe(1500); // R$ 150
    expect(xpForLevel(10)).toBe(5500); // R$ 550
    expect(xpForLevel(21)).toBe(23100); // R$ 2.310
  });

  it("é o inverso exato de xpForLevel em todos os níveis", () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      expect(levelFromXp(xpForLevel(level))).toBe(level);
    }
  });

  it("não sobe de nível um XP antes do limiar", () => {
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(levelFromXp(xpForLevel(level) - 1)).toBe(level - 1);
    }
  });

  it("trava no nível 21 por mais XP que entre", () => {
    expect(levelFromXp(1_000_000)).toBe(MAX_LEVEL);
  });

  it("ignora XP negativo", () => {
    expect(levelFromXp(-500)).toBe(0);
  });
});

describe("prestigeFromXp", () => {
  it("só entra em prestígio a partir do limiar da patente", () => {
    expect(prestigeFromXp(39_999)).toBeNull();
    expect(prestigeFromXp(40_000)?.key).toBe("PRO_PLAYER");
  });

  it("sobe pela escada de patentes na ordem certa", () => {
    expect(prestigeFromXp(80_000)?.key).toBe("MVP");
    expect(prestigeFromXp(150_000)?.key).toBe("MVP");
    expect(prestigeFromXp(300_000)?.key).toBe("GOAT");
    expect(prestigeFromXp(9_000_000)?.key).toBe("GOAT");
  });

  it("as patentes estão em ordem crescente de XP", () => {
    for (let i = 1; i < PRESTIGE_RANKS.length; i++) {
      expect(PRESTIGE_RANKS[i].xp).toBeGreaterThan(PRESTIGE_RANKS[i - 1].xp);
    }
  });
});

describe("rankFromXp", () => {
  it("rotula níveis numéricos", () => {
    const rank = rankFromXp(5500);
    expect(rank.level).toBe(10);
    expect(rank.label).toBe("Nível 10");
    expect(rank.prestige).toBeNull();
  });

  it("no prestígio, o rótulo vira a patente e o nível fica em 21", () => {
    const rank = rankFromXp(300_000);
    expect(rank.label).toBe("GOAT");
    expect(rank.level).toBe(MAX_LEVEL);
    expect(rank.prestige?.key).toBe("GOAT");
  });

  it("mostra o nível nos selos comuns e o nome nas patentes", () => {
    // Dois dígitos mantêm a coluna de selos alinhada na lista de ranking.
    expect(rankFromXp(5500).numeral).toBe("10");
    expect(rankFromXp(0).numeral).toBe("00");
    // Patente não usa mais numeral romano: o selo traz o nome desenhado.
    expect(rankFromXp(300_000).numeral).toBe("GOAT");
    expect(rankFromXp(80_000).numeral).toBe("MVP");
  });

  it("nomeia a faixa com o vocabulário das patentes do CS", () => {
    expect(rankFromXp(0).tierName).toBe("Prata");
    expect(rankFromXp(xpForLevel(5)).tierName).toBe("Nova de Ouro");
    expect(rankFromXp(xpForLevel(14)).tierName).toBe("Águia Lendária");
    expect(rankFromXp(xpForLevel(21)).tierName).toBe("Global Elite");
    // No prestígio, a faixa é a própria patente.
    expect(rankFromXp(300_000).tierName).toBe("GOAT");
  });
});

describe("rankProgress", () => {
  it("aponta o próximo nível e quanto falta em reais", () => {
    // Nível 1 alcançado com 100 XP; nível 2 exige 300.
    const p = rankProgress(200);
    expect(p.rank.level).toBe(1);
    expect(p.nextLabel).toBe("Nível 2");
    expect(p.xpToNext).toBe(100);
    expect(p.brlToNext).toBe(10);
    expect(p.percent).toBe(50);
  });

  it("no nível 21 o próximo degrau é a primeira patente", () => {
    const p = rankProgress(xpForLevel(MAX_LEVEL));
    expect(p.nextLabel).toBe("Pro Player");
    expect(p.atMax).toBe(false);
  });

  it("dentro do prestígio aponta a patente seguinte", () => {
    const p = rankProgress(40_000);
    expect(p.rank.label).toBe("Pro Player");
    expect(p.nextLabel).toBe("MVP");
    expect(p.xpToNext).toBe(40_000);
  });

  it("GOAT é o teto: sem próximo degrau e 100%", () => {
    const p = rankProgress(300_000);
    expect(p.atMax).toBe(true);
    expect(p.nextLabel).toBeNull();
    expect(p.percent).toBe(100);
    expect(p.xpToNext).toBe(0);
  });

  it("arredonda os reais que faltam pra cima — R$ 0,50 não sobe nível", () => {
    // Faltando 5 XP, meio real não basta: precisa gastar R$ 1.
    const p = rankProgress(xpForLevel(1) - 5);
    expect(p.brlToNext).toBe(1);
  });

  it("converte o que falta usando o xpPerBrl do tenant", () => {
    const p = rankProgress(0, 50);
    expect(p.xpToNext).toBe(100);
    expect(p.brlToNext).toBe(2);
  });
});

describe("meetsMinLevel", () => {
  it("campanha sem exigência é aberta a todos", () => {
    expect(meetsMinLevel(0, null)).toBe(true);
    expect(meetsMinLevel(0, 0)).toBe(true);
  });

  it("barra quem está abaixo e libera a partir do nível exigido", () => {
    expect(meetsMinLevel(xpForLevel(9), 10)).toBe(false);
    expect(meetsMinLevel(xpForLevel(10), 10)).toBe(true);
    expect(meetsMinLevel(xpForLevel(15), 10)).toBe(true);
  });

  it("prestígio passa em qualquer exigência de nível", () => {
    expect(meetsMinLevel(300_000, 21)).toBe(true);
  });
});

describe("tierForLevel", () => {
  it("cobre todos os níveis sem buraco entre faixas", () => {
    for (let level = 0; level <= MAX_LEVEL; level++) {
      expect(tierForLevel(level).name).toBeTruthy();
    }
  });

  it("troca de faixa exatamente no nível de corte", () => {
    expect(tierForLevel(3).name).toBe("Prata Elite");
    expect(tierForLevel(4).name).toBe("Nova de Ouro");
    expect(tierForLevel(19).name).toBe("Supremo");
    expect(tierForLevel(20).name).toBe("Global Elite");
  });
});

describe("desenho dos selos", () => {
  it("todo nível de 1 a 21 tem desenho", () => {
    for (let n = 1; n <= MAX_LEVEL; n++) {
      expect(DESIGN_POR_NIVEL[n], `nível ${n}`).toBeDefined();
    }
  });

  it("a silhueta sobe em quatro degraus, sem voltar atrás", () => {
    const ordem: FormaDoSelo[] = [
      "hexagono",
      "losango",
      "heptagono",
      "octogono",
    ];
    let anterior = 0;
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const atual = ordem.indexOf(DESIGN_POR_NIVEL[n]!.forma);
      expect(atual, `nível ${n}`).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
    // Começa no hexágono e termina no octógono.
    expect(DESIGN_POR_NIVEL[1]!.forma).toBe("hexagono");
    expect(DESIGN_POR_NIVEL[MAX_LEVEL]!.forma).toBe("octogono");
  });

  it("só o nível 21 usa arco-íris", () => {
    for (let n = 1; n < MAX_LEVEL; n++) {
      expect(DESIGN_POR_NIVEL[n]!.arcoIris, `nível ${n}`).toBeUndefined();
    }
    expect(DESIGN_POR_NIVEL[MAX_LEVEL]!.arcoIris).toBe(true);
  });

  it("cada cor é um hexadecimal válido", () => {
    const hex = /^#[0-9A-Fa-f]{6}$/;
    for (let n = 1; n <= MAX_LEVEL; n++) {
      const d = DESIGN_POR_NIVEL[n]!;
      for (const cor of [...d.borda, ...d.miolo]) {
        expect(cor, `nível ${n}`).toMatch(hex);
      }
    }
  });

  it("o arco-íris fecha a volta: a última cor emenda na primeira", () => {
    expect(LADOS_DO_OCTOGONO).toHaveLength(8);
    expect(ARCO_IRIS_NIVEL_21).toHaveLength(LADOS_DO_OCTOGONO.length);
    const primeira = ARCO_IRIS_NIVEL_21[0]![0];
    const ultima = ARCO_IRIS_NIVEL_21.at(-1)!.at(-1);
    expect(ultima).toBe(primeira);
  });

  it("toda forma com polígono tem contorno externo e interno", () => {
    for (const forma of ["hexagono", "heptagono", "octogono"] as const) {
      expect(CONTORNOS[forma].externo.length).toBeGreaterThan(0);
      expect(CONTORNOS[forma].interno.length).toBeGreaterThan(0);
    }
  });
});
