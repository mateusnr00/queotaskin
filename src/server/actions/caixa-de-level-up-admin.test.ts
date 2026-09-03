// O que o painel aceita e o que ele recusa salvar.
//
// O SERVIDOR É A AUTORIDADE.
//
// A tela desliga o botão quando a soma não fecha, mas isso é conveniência. O
// que decide é esta camada: uma requisição montada à mão, com 97% ou com uma
// cor inventada, tem de voltar recusada.

import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteManyDrop = vi.fn();
const createManyDrop = vi.fn();
const updateTenant = vi.fn();
const findTenant = vi.fn();
const registrarLog = vi.fn();
let quemEsta: { id: string; role: string } | null = { id: "admin1", role: "ADMIN" };

vi.mock("@/lib/auth-helpers", () => ({
  getAdminOrThrow: async () => {
    if (!quemEsta) throw new Error("Sem permissão");
    return { user: quemEsta };
  },
}));
vi.mock("@/lib/tenant", () => ({
  getActiveTenantIdForAdmin: async () => "t1",
}));
vi.mock("@/server/services/activity-log", () => ({
  registrarLog: (e: unknown) => registrarLog(e),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/db", () => ({
  prisma: {
    tenant: {
      findUniqueOrThrow: (a: unknown) => findTenant(a),
      update: (a: unknown) => updateTenant(a),
    },
    levelUpBoxDrop: {
      deleteMany: (a: unknown) => deleteManyDrop(a),
      createMany: (a: unknown) => createManyDrop(a),
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        tenant: { update: (a: unknown) => updateTenant(a) },
        levelUpBoxDrop: {
          deleteMany: (a: unknown) => deleteManyDrop(a),
          createMany: (a: unknown) => createManyDrop(a),
        },
      }),
  },
}));

const { salvarConfigDaCaixaAction } = await import("./caixa-de-level-up-admin");

function drop(over: Record<string, unknown> = {}) {
  return {
    multiplier: 1.5,
    rarity: "COMUM",
    probabilityBps: 10_000,
    color: "#A1A1AA",
    ativo: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  quemEsta = { id: "admin1", role: "ADMIN" };
  findTenant.mockResolvedValue({
    levelUpBoxesEnabled: false,
    levelUpBoxesEnabledAt: null,
  });
});

describe("salvar a configuração", () => {
  it("salva quando a soma dá exatamente 100%", async () => {
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop({ probabilityBps: 7000 }), drop({ multiplier: 3.5, probabilityBps: 3000 })],
    });
    expect(r.ok).toBe(true);
    expect(createManyDrop).toHaveBeenCalled();
  });

  it("recusa abaixo de 100% e diz quanto deu", async () => {
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop({ probabilityBps: 9700 })],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/somam 97%/);
    expect(createManyDrop).not.toHaveBeenCalled();
  });

  it("recusa acima de 100%, somando drops individualmente válidos", async () => {
    // O caso real: ninguém digita 103% numa linha só. Digita 60 e 43.
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [
        drop({ probabilityBps: 6000 }),
        drop({ multiplier: 3.5, probabilityBps: 4300 }),
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/somam 103%/);
    expect(createManyDrop).not.toHaveBeenCalled();
  });

  it("uma linha sozinha acima de 100% também é recusada", async () => {
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop({ probabilityBps: 10_300 })],
    });
    expect(r.ok).toBe(false);
    expect(createManyDrop).not.toHaveBeenCalled();
  });

  it("aceita chance com casa decimal", async () => {
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [
        drop({ probabilityBps: 9875 }),
        drop({ multiplier: 3.5, probabilityBps: 125 }),
      ],
    });
    expect(r.ok).toBe(true);
    const dados = createManyDrop.mock.calls[0]?.[0] as { data: { probabilityBps: number }[] };
    expect(dados.data.map((d) => d.probabilityBps)).toEqual([9875, 125]);
  });

  it("a cor é persistida como veio, e não derivada da raridade", async () => {
    await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop({ color: "#3B82F6" })],
    });
    const dados = createManyDrop.mock.calls[0]?.[0] as { data: { color: string }[] };
    expect(dados.data[0]!.color).toBe("#3B82F6");
  });

  it("recusa cor que não é hexadecimal", async () => {
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop({ color: "azul" })],
    });
    expect(r.ok).toBe(false);
    expect(createManyDrop).not.toHaveBeenCalled();
  });

  it("drop desativado sai da soma, mas continua salvo", async () => {
    // Ele fica na tabela para poder ser religado sem redigitar.
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop(), drop({ multiplier: 3.5, probabilityBps: 5000, ativo: false })],
    });
    expect(r.ok).toBe(true);
    const dados = createManyDrop.mock.calls[0]?.[0] as { data: { ativo: boolean }[] };
    expect(dados.data).toHaveLength(2);
    expect(dados.data[1]!.ativo).toBe(false);
  });

  it("ligar pela primeira vez marca a data de ativação", async () => {
    await salvarConfigDaCaixaAction({ ligado: true, minutos: 15, drops: [drop()] });
    const dados = updateTenant.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(dados.data.levelUpBoxesEnabledAt).toBeInstanceOf(Date);
  });

  it("religar NÃO reescreve a data original", async () => {
    // Mover o marco para a frente faria a trava de "nada retroativo" andar.
    findTenant.mockResolvedValue({
      levelUpBoxesEnabled: false,
      levelUpBoxesEnabledAt: new Date("2026-01-01"),
    });
    await salvarConfigDaCaixaAction({ ligado: true, minutos: 15, drops: [drop()] });
    const dados = updateTenant.mock.calls[0]?.[0] as { data: Record<string, unknown> };
    expect(dados.data.levelUpBoxesEnabledAt).toBeUndefined();
  });

  it("quem não é do painel não altera configuração nenhuma", async () => {
    quemEsta = null;
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 15,
      drops: [drop()],
    });
    expect(r.ok).toBe(false);
    expect(createManyDrop).not.toHaveBeenCalled();
    expect(updateTenant).not.toHaveBeenCalled();
  });

  it("duração fora do razoável é recusada", async () => {
    const r = await salvarConfigDaCaixaAction({
      ligado: true,
      minutos: 0,
      drops: [drop()],
    });
    expect(r.ok).toBe(false);
  });
});
