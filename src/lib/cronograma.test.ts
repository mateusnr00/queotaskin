import { describe, expect, it } from "vitest";

import {
  liberadoEm,
  moverNaLista,
  posicoesRenumeradas,
  proximoDaFila,
  validarParaFila,
  type CampanhaParaFila,
  type ItemDaFila,
} from "./cronograma";

function item(
  id: string,
  posicao: number,
  status: ItemDaFila["status"] = "AGUARDANDO",
): ItemDaFila {
  return { id, raffleId: `r_${id}`, status, posicao };
}

describe("proximoDaFila", () => {
  it("escolhe o de menor posição entre os que aguardam", () => {
    const fila = [item("b", 2), item("a", 1), item("c", 3)];
    expect(proximoDaFila(fila)?.id).toBe("a");
  });

  it("ignora pulado, removido, ativo e concluído", () => {
    // Pular existe justamente para a fila passar por cima sem apagar nada.
    const fila = [
      item("pulado", 0, "PULADO"),
      item("removido", 1, "REMOVIDO"),
      item("ativo", 2, "ATIVO"),
      item("concluido", 3, "CONCLUIDO"),
      item("vez", 4),
    ];
    expect(proximoDaFila(fila)?.id).toBe("vez");
  });

  it("desempata por id, e o desempate é estável", () => {
    // Dois workers precisam escolher o MESMO item quando a posição empata,
    // senão duas campanhas diferentes disputam a mesma vaga.
    const fila = [item("z", 5), item("a", 5)];
    expect(proximoDaFila(fila)?.id).toBe("a");
    expect(proximoDaFila([...fila].reverse())?.id).toBe("a");
  });

  it("devolve nulo com a fila vazia", () => {
    expect(proximoDaFila([])).toBeNull();
    expect(proximoDaFila([item("x", 0, "CONCLUIDO")])).toBeNull();
  });
});

describe("posicoesRenumeradas", () => {
  it("renumera de zero, sem buracos", () => {
    const mapa = posicoesRenumeradas(["c", "a", "b"]);
    expect([...mapa]).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });
});

describe("moverNaLista", () => {
  it("troca com o vizinho de cima", () => {
    expect(moverNaLista(["a", "b", "c"], "c", "cima")).toEqual(["a", "c", "b"]);
  });

  it("troca com o vizinho de baixo", () => {
    expect(moverNaLista(["a", "b", "c"], "a", "baixo")).toEqual(["b", "a", "c"]);
  });

  it("na ponta, devolve igual e não é erro", () => {
    expect(moverNaLista(["a", "b"], "a", "cima")).toEqual(["a", "b"]);
    expect(moverNaLista(["a", "b"], "b", "baixo")).toEqual(["a", "b"]);
    expect(moverNaLista(["a", "b"], "sumiu", "cima")).toEqual(["a", "b"]);
  });
});

describe("validarParaFila", () => {
  const pronta: CampanhaParaFila = {
    status: "DRAFT",
    title: "AK-47 | Vulcan",
    totalNumbers: 1000,
    pricePerNumber: 1.5,
    isFree: false,
    premios: 1,
    temCapa: true,
    privacy: "PUBLIC",
  };

  it("aceita a campanha pronta", () => {
    expect(validarParaFila(pronta)).toEqual({ erros: [], avisos: [] });
  });

  it("recusa campanha já no ar", () => {
    const r = validarParaFila({ ...pronta, status: "ACTIVE" });
    expect(r.erros[0]).toMatch(/já está no ar/i);
  });

  it("recusa campanha encerrada, que não volta para a fila", () => {
    // Reativar uma campanha sorteada reabriria a venda de um prêmio que já
    // tem dono.
    expect(validarParaFila({ ...pronta, status: "FINISHED" }).erros).toHaveLength(1);
    expect(validarParaFila({ ...pronta, status: "CANCELLED" }).erros).toHaveLength(1);
  });

  it("recusa preço zerado, salvo campanha gratuita", () => {
    expect(validarParaFila({ ...pronta, pricePerNumber: 0 }).erros).toHaveLength(1);
    expect(
      validarParaFila({ ...pronta, pricePerNumber: 0, isFree: true }).erros,
    ).toHaveLength(0);
  });

  it("recusa quantidade inválida e campanha sem prêmio", () => {
    expect(validarParaFila({ ...pronta, totalNumbers: 0 }).erros).toHaveLength(1);
    expect(validarParaFila({ ...pronta, premios: 0 }).erros).toHaveLength(1);
  });

  it("capa ausente é aviso, não impedimento", () => {
    // A página abre sem capa: desenha o painel com a cor da raridade.
    const r = validarParaFila({ ...pronta, temCapa: false });
    expect(r.erros).toHaveLength(0);
    expect(r.avisos).toHaveLength(1);
  });

  it("campanha privada entra, com aviso de que não vai para a vitrine", () => {
    const r = validarParaFila({ ...pronta, privacy: "PRIVATE" });
    expect(r.erros).toHaveLength(0);
    expect(r.avisos[0]).toMatch(/privada/i);
  });
});

describe("liberadoEm", () => {
  it("soma o atraso ao fim do sorteio anterior", () => {
    const fim = new Date("2026-09-02T20:00:00.000Z");
    expect(liberadoEm(fim, 300)?.toISOString()).toBe("2026-09-02T20:05:00.000Z");
  });

  it("sem fim registrado, não libera nada", () => {
    // A fila não começa sozinha: ela é sempre consequência de um ciclo que
    // terminou.
    expect(liberadoEm(null, 0)).toBeNull();
  });

  it("atraso zero libera no mesmo instante", () => {
    const fim = new Date("2026-09-02T20:00:00.000Z");
    expect(liberadoEm(fim, 0)?.getTime()).toBe(fim.getTime());
  });
});
