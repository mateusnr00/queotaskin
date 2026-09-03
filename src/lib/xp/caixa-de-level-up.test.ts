import { describe, expect, it } from "vitest";

import {
  aplicarBoost,
  conferirDrops,
  DROPS_PADRAO,
  niveisConquistados,
  somaDasChances,
  sortearDrop,
  type DropDaCaixa,
} from "./caixa-de-level-up";

describe("a tabela padrão", () => {
  it("soma exatamente 100%", () => {
    // Se não somasse, uma faixa do sorteio ficaria sem dono.
    expect(somaDasChances(DROPS_PADRAO)).toBe(100);
  });

  it("passa na própria validação", () => {
    expect(conferirDrops(DROPS_PADRAO)).toEqual({ ok: true });
  });

  it("tem as nove faixas pedidas, com as raridades certas", () => {
    expect(DROPS_PADRAO).toHaveLength(9);
    const porMultiplicador = new Map(
      DROPS_PADRAO.map((d) => [d.multiplier, d.rarity]),
    );
    expect(porMultiplicador.get(1.5)).toBe("COMUM");
    expect(porMultiplicador.get(2.0)).toBe("RARO");
    expect(porMultiplicador.get(2.5)).toBe("EPICO");
    expect(porMultiplicador.get(3.0)).toBe("LENDARIO");
    expect(porMultiplicador.get(3.5)).toBe("ULTRA_RARO");
  });
});

describe("conferirDrops", () => {
  it("recusa tabela que não soma 100 e diz quanto deu", () => {
    const r = conferirDrops([{ multiplier: 2, rarity: "RARO", chance: 98 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/somam 98%/);
  });

  it("recusa multiplicador menor ou igual a 1", () => {
    // Abaixo de 1 a caixa TIRARIA XP de quem ganhou.
    const r = conferirDrops([{ multiplier: 0.5, rarity: "COMUM", chance: 100 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/maior que 1/i);
  });

  it("recusa o mesmo multiplicador duas vezes", () => {
    const r = conferirDrops([
      { multiplier: 2, rarity: "RARO", chance: 50 },
      { multiplier: 2, rarity: "RARO", chance: 50 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/duas vezes/);
  });

  it("recusa tabela sem nenhum ativo", () => {
    const r = conferirDrops([{ multiplier: 2, rarity: "RARO", chance: 0 }]);
    expect(r.ok).toBe(false);
  });

  it("drop desligado não conta para os 100%", () => {
    // Ele fica na tabela para poder ser religado sem redigitar.
    const r = conferirDrops([
      { multiplier: 1.5, rarity: "COMUM", chance: 100 },
      { multiplier: 3.5, rarity: "ULTRA_RARO", chance: 0 },
    ]);
    expect(r).toEqual({ ok: true });
  });
});

describe("sortearDrop", () => {
  const drops: DropDaCaixa[] = [
    { multiplier: 1.5, rarity: "COMUM", chance: 30 },
    { multiplier: 2.0, rarity: "RARO", chance: 60 },
    { multiplier: 3.5, rarity: "ULTRA_RARO", chance: 10 },
  ];

  it("respeita as faixas nas bordas", () => {
    expect(sortearDrop(drops, 0)?.multiplier).toBe(1.5);
    expect(sortearDrop(drops, 0.2999)?.multiplier).toBe(1.5);
    expect(sortearDrop(drops, 0.3)?.multiplier).toBe(2.0);
    expect(sortearDrop(drops, 0.8999)?.multiplier).toBe(2.0);
    expect(sortearDrop(drops, 0.9)?.multiplier).toBe(3.5);
    expect(sortearDrop(drops, 0.99999)?.multiplier).toBe(3.5);
  });

  it("número fora da faixa vira borda, e não erro", () => {
    // O chamador é o gerador do servidor; um valor esquisito não pode deixar
    // alguém sem prêmio.
    expect(sortearDrop(drops, -1)?.multiplier).toBe(1.5);
    expect(sortearDrop(drops, 5)?.multiplier).toBe(3.5);
  });

  it("ignora drop desligado", () => {
    const comDesligado: DropDaCaixa[] = [
      { multiplier: 1.5, rarity: "COMUM", chance: 100 },
      { multiplier: 3.5, rarity: "ULTRA_RARO", chance: 0 },
    ];
    for (const s of [0, 0.5, 0.999]) {
      expect(sortearDrop(comDesligado, s)?.multiplier).toBe(1.5);
    }
  });

  it("tabela vazia devolve nulo em vez de inventar prêmio", () => {
    expect(sortearDrop([], 0.5)).toBeNull();
    expect(sortearDrop([{ multiplier: 2, rarity: "RARO", chance: 0 }], 0.5)).toBeNull();
  });

  it("na tabela padrão, a distribuição bate com as chances", () => {
    // Varre o intervalo inteiro e mede quanto dele cada drop ocupa. Não é
    // teste de aleatoriedade: é conferência de que a régua foi dividida no
    // tamanho que a configuração pediu.
    const contagem = new Map<number, number>();
    const passos = 100_000;
    for (let i = 0; i < passos; i++) {
      const d = sortearDrop(DROPS_PADRAO, i / passos)!;
      contagem.set(d.multiplier, (contagem.get(d.multiplier) ?? 0) + 1);
    }
    for (const drop of DROPS_PADRAO) {
      const fatia = ((contagem.get(drop.multiplier) ?? 0) / passos) * 100;
      expect(fatia).toBeCloseTo(drop.chance, 1);
    }
  });
});

describe("niveisConquistados", () => {
  it("uma subida gera um nível", () => {
    expect(niveisConquistados(4, 5)).toEqual([5]);
  });

  it("três subidas geram três níveis, um por degrau", () => {
    // Devolver só o nível final daria uma caixa onde houve três conquistas.
    expect(niveisConquistados(10, 13)).toEqual([11, 12, 13]);
  });

  it("ficar no mesmo nível não gera nada", () => {
    expect(niveisConquistados(7, 7)).toEqual([]);
  });

  it("perder nível não gera nada", () => {
    // Acontece em estorno: o XP volta e o nível cai.
    expect(niveisConquistados(9, 6)).toEqual([]);
  });
});

describe("aplicarBoost", () => {
  it("o exemplo do pedido: 300 XP com 2,5x vira 750", () => {
    expect(aplicarBoost(300, 2.5)).toEqual({ finalXp: 750, bonusXp: 450 });
  });

  it("o outro exemplo: 400 XP com 2,5x vira 1000", () => {
    expect(aplicarBoost(400, 2.5)).toEqual({ finalXp: 1000, bonusXp: 600 });
  });

  it("arredonda para baixo, porque XP é inteiro", () => {
    // Para cima daria um ponto de graça em toda compra.
    expect(aplicarBoost(333, 1.5)).toEqual({ finalXp: 499, bonusXp: 166 });
  });

  it("sem boost, o XP atravessa intacto", () => {
    expect(aplicarBoost(300, 1)).toEqual({ finalXp: 300, bonusXp: 0 });
    expect(aplicarBoost(300, 0)).toEqual({ finalXp: 300, bonusXp: 0 });
  });

  it("XP zero continua zero", () => {
    expect(aplicarBoost(0, 3.5)).toEqual({ finalXp: 0, bonusXp: 0 });
  });

  it("o teto de 2,5 do cálculo de compra NÃO limita o boost", () => {
    // O boost é estágio separado justamente para isto: dentro da soma
    // existente, um 3,5x seria cortado em 2,5 sem ninguém perceber.
    expect(aplicarBoost(1000, 3.5).finalXp).toBe(3500);
  });
});
