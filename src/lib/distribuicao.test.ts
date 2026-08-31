import { describe, expect, it } from "vitest";

import {
  distribuirPremios,
  posicoesPremiadas,
  sortearPorChance,
} from "@/lib/distribuicao";

/** Um "acaso" determinístico, para o teste conseguir fixar o resultado. */
function dado(valores: number[]) {
  let i = 0;
  return (teto: number) => valores[i++ % valores.length]! % Math.max(1, teto);
}

/** Sempre o menor sorteio possível: leva na primeira posição que puder. */
const sempreLeva = () => 0;
/** Nunca leva, a não ser quando a garantia obriga. */
const soNoFim = (teto: number) => teto - 1;

describe("posicoesPremiadas", () => {
  it("cenário A: 20 unidades e 2 prêmios dão exatamente 2 premiadas", () => {
    const p = posicoesPremiadas(20, 2, dado([3, 11, 7, 2, 5]));
    expect(p).toHaveLength(2);
    expect(new Set(p).size).toBe(2);
    for (const i of p) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(20);
    }
  });

  it("cenário C: sem prêmio elegível, nenhuma unidade é premiada", () => {
    expect(posicoesPremiadas(20, 0, sempreLeva)).toEqual([]);
  });

  it("cenário D: 20 unidades e 5 prêmios dão 5 premiadas, sem repetir posição", () => {
    const p = posicoesPremiadas(20, 5, dado([1, 4, 9, 2, 6, 3, 8]));
    expect(p).toHaveLength(5);
    expect(new Set(p).size).toBe(5);
  });

  it("cenário E: 2 unidades e 2 prêmios premiam as duas, obrigatoriamente", () => {
    // A garantia não depende da sorte: com tantos prêmios quantas unidades, o
    // acaso mais avesso possível ainda entrega os dois.
    expect(posicoesPremiadas(2, 2, soNoFim)).toEqual([0, 1]);
    expect(posicoesPremiadas(2, 2, sempreLeva)).toEqual([0, 1]);
  });

  it("o último prêmio sempre acha lugar, mesmo com o acaso contra", () => {
    // O acaso recusa até a garantia forçar: os dois prêmios caem no fim.
    expect(posicoesPremiadas(5, 2, soNoFim)).toEqual([3, 4]);
  });

  it("mais prêmios que unidades: entrega o que cabe, e nada além", () => {
    const p = posicoesPremiadas(3, 10, sempreLeva);
    expect(p).toEqual([0, 1, 2]);
  });

  it("não inventa posição em lista vazia", () => {
    expect(posicoesPremiadas(0, 3, sempreLeva)).toEqual([]);
  });

  it("distribui de forma parelha, e não sempre no começo", () => {
    // Cem execuções com sorteio de verdade: nenhuma posição pode concentrar.
    // Sem isto, um erro de índice passaria despercebido por sempre premiar as
    // primeiras, que é exatamente o defeito que motivou este arquivo.
    const contagem = new Array(10).fill(0);
    for (let i = 0; i < 2000; i++) {
      for (const pos of posicoesPremiadas(10, 2, (teto) =>
        Math.floor(Math.random() * teto),
      )) {
        contagem[pos]++;
      }
    }
    const esperado = (2000 * 2) / 10;
    for (const c of contagem) {
      expect(c).toBeGreaterThan(esperado * 0.6);
      expect(c).toBeLessThan(esperado * 1.4);
    }
  });
});

describe("distribuirPremios", () => {
  it("respeita a ordem da lista: o primeiro prêmio cai na primeira posição", () => {
    // Quem chama põe primeiro o de ponto de saída mais baixo, e é assim que
    // "um atrás do outro" continua valendo depois do espalhamento.
    const destino = distribuirPremios(4, ["a", "b"], soNoFim);
    expect(destino).toEqual([null, null, "a", "b"]);
  });

  it("cada prêmio aparece uma única vez", () => {
    const destino = distribuirPremios(20, ["a", "b", "c"], dado([2, 5, 1, 8]));
    const usados = destino.filter(Boolean);
    expect(usados).toHaveLength(3);
    expect(new Set(usados).size).toBe(3);
  });

  it("sem prêmio, todas as unidades ficam sem", () => {
    expect(distribuirPremios(3, [], sempreLeva)).toEqual([null, null, null]);
  });
});

describe("sortearPorChance", () => {
  const embaralhar = <T,>(l: readonly T[]) => [...l];

  it("não mexe em unidade que já tem prêmio garantido", () => {
    const saida = sortearPorChance(
      ["ja-tem", null],
      [{ id: "chance", chance: 100 }],
      () => 0,
      embaralhar,
    );
    expect(saida[0]).toBe("ja-tem");
    expect(saida[1]).toBe("chance");
  });

  it("prêmio de chance sai no máximo uma vez", () => {
    const saida = sortearPorChance(
      [null, null, null],
      [{ id: "unico", chance: 100 }],
      () => 0,
      embaralhar,
    );
    expect(saida.filter((x) => x === "unico")).toHaveLength(1);
  });

  it("chance que não bate deixa a unidade vazia", () => {
    const saida = sortearPorChance(
      [null, null],
      [{ id: "raro", chance: 1 }],
      () => 50,
      embaralhar,
    );
    expect(saida).toEqual([null, null]);
  });
});
