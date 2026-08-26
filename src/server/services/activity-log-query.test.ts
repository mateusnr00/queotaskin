import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.fn();
const findFirst = vi.fn();
const deleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    activityLog: {
      findMany: (a: unknown) => findMany(a),
      findFirst: (a: unknown) => findFirst(a),
      deleteMany: (a: unknown) => deleteMany(a),
    },
  },
}));

const { montarWhere, listarLogs, limparLogsAntigos, RETENCAO_DIAS } =
  await import("./activity-log-query");

describe("montarWhere", () => {
  it("prende ao tenant quando ele vem preenchido", () => {
    expect(montarWhere({ tenantId: "t1" })).toEqual({ tenantId: "t1" });
  });

  it("tenant nulo não filtra, que é o SUPER_ADMIN vendo todos", () => {
    expect(montarWhere({ tenantId: null })).toEqual({});
  });

  it("cursor compara data e desempata por id, senão pula registro do mesmo instante", () => {
    const quando = new Date("2026-08-26T12:00:00Z");
    const where = montarWhere({
      tenantId: "t1",
      cursor: { criadoEm: quando, id: "log9" },
    });

    expect(where.OR).toEqual([
      { criadoEm: { lt: quando } },
      { criadoEm: quando, id: { lt: "log9" } },
    ]);
  });

  it("filtra por alvo, que é o atalho 'ver histórico'", () => {
    const where = montarWhere({
      tenantId: "t1",
      alvo: { tipo: "Raffle", id: "r1" },
    });
    expect(where.alvoTipo).toBe("Raffle");
    expect(where.alvoId).toBe("r1");
  });
});

describe("listarLogs", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  it("devolve cursor quando há mais página", async () => {
    const linhas = Array.from({ length: 3 }, (_, i) => ({
      id: `log${i}`,
      criadoEm: new Date(2026, 7, 26, 12, 0, i),
    }));
    findMany.mockResolvedValue(linhas);

    const r = await listarLogs({ tenantId: "t1", limite: 2 });

    expect(r.registros).toHaveLength(2);
    expect(r.proximo).toEqual({
      criadoEm: linhas[1]!.criadoEm,
      id: "log1",
    });
  });

  it("última página não devolve cursor", async () => {
    findMany.mockResolvedValue([{ id: "log0", criadoEm: new Date() }]);
    const r = await listarLogs({ tenantId: "t1", limite: 2 });
    expect(r.proximo).toBeNull();
  });
});

describe("limparLogsAntigos", () => {
  beforeEach(() => {
    findFirst.mockReset();
    findMany.mockReset();
    deleteMany.mockReset();
  });

  it("não apaga nada quando o mais antigo ainda está dentro da retenção", async () => {
    findFirst.mockResolvedValue({ criadoEm: new Date("2026-08-01") });

    const r = await limparLogsAntigos(new Date("2026-08-26"));

    expect(r.apagados).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("tabela vazia não tenta apagar", async () => {
    findFirst.mockResolvedValue(null);
    const r = await limparLogsAntigos(new Date("2026-08-26"));
    expect(r.apagados).toBe(0);
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("apaga em lotes o que passou da retenção", async () => {
    findFirst.mockResolvedValue({ criadoEm: new Date("2020-01-01") });
    findMany
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }])
      .mockResolvedValueOnce([]);
    deleteMany.mockResolvedValue({ count: 2 });

    const r = await limparLogsAntigos(new Date("2026-08-26"));

    expect(r.apagados).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] } },
    });
  });

  it("a retenção é de um ano", () => {
    expect(RETENCAO_DIAS).toBe(365);
  });
});
