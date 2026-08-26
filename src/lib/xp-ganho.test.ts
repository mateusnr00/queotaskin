import { describe, expect, it } from "vitest";

import { XP_POR_NIVEL, rankProgress } from "./rank";

/**
 * A regra que o bloco de XP do comprovante usa para dizer "você subiu de
 * nível": comparar o rótulo do rank antes e depois da compra.
 *
 * Compara o rótulo porque ele é a string que a pessoa lê na tela, e porque
 * cobre os dois tipos de degrau na mesma checagem: "Nível 5" vira "Nível 6",
 * e "Nível 21" vira "MVP". Uma comparação só, sem precisar saber se o que
 * mudou foi nível ou patente.
 */
function subiuDeDegrau(total: number, ganho: number, xpPerBrl = 10): boolean {
  const antes = rankProgress(Math.max(0, total - ganho), xpPerBrl);
  const depois = rankProgress(total, xpPerBrl);
  return antes.rank.label !== depois.rank.label;
}

describe("subir de degrau com a compra", () => {
  it("compra que não cruza degrau não anuncia subida", () => {
    // Nível 1 começa em 1.000; ir de 100 para 200 não sai do nível 0.
    expect(subiuDeDegrau(200, 100)).toBe(false);
  });

  it("compra que cruza o limiar anuncia", () => {
    const limiar = XP_POR_NIVEL[1]!;
    expect(subiuDeDegrau(limiar, 100)).toBe(true);
    // Parar um XP antes não conta.
    expect(subiuDeDegrau(limiar - 1, 100)).toBe(false);
  });

  it("pular vários níveis de uma vez conta como subida", () => {
    const alvo = XP_POR_NIVEL[5]!;
    expect(subiuDeDegrau(alvo, alvo)).toBe(true);
  });

  it("detecta subida de patente, e não só de nível", () => {
    // Acima do nível máximo o degrau vira patente: o rótulo deixa de ser
    // "Nível N" e passa a ser o nome dela. É o caso que mais vale anunciar.
    const antesDaPatente = rankProgress(340_000, 10);
    const naPatente = rankProgress(360_000, 10);
    expect(antesDaPatente.rank.label).toBe("Nível 21");
    expect(naPatente.rank.label).toBe("MVP");
    expect(subiuDeDegrau(360_000, 20_000)).toBe(true);
  });

  it("entre duas patentes também conta", () => {
    // MVP para Pro Player: nenhum dos dois é "Nível N", e a subida existe.
    expect(subiuDeDegrau(430_000, 80_000)).toBe(true);
  });

  it("primeira compra da conta, saindo do zero, conta como subida", () => {
    expect(subiuDeDegrau(XP_POR_NIVEL[1]!, XP_POR_NIVEL[1]!)).toBe(true);
  });

  it("ganho maior que o total não quebra a conta", () => {
    // Defensivo: se um ajuste manual zerar o progresso, total - ganho fica
    // negativo, e rankProgress precisa receber zero e não um número abaixo.
    expect(() => subiuDeDegrau(50, 5_000)).not.toThrow();
    expect(subiuDeDegrau(50, 5_000)).toBe(false);
  });
});

describe("progresso mostrado depois da compra", () => {
  it("no topo, avisa patente máxima em vez de faltar XP", () => {
    const p = rankProgress(10_000_000, 10);
    expect(p.atMax).toBe(true);
    expect(p.nextLabel).toBeNull();
    expect(p.percent).toBe(100);
  });

  it("fora do topo, o que falta é positivo e a barra não estoura", () => {
    const p = rankProgress(XP_POR_NIVEL[3]! + 10, 10);
    expect(p.xpToNext).toBeGreaterThan(0);
    expect(p.percent).toBeGreaterThanOrEqual(0);
    expect(p.percent).toBeLessThanOrEqual(100);
  });
});
