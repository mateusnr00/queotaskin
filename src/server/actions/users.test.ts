// O que as actions de usuário registram.
//
// Banco e sessão entram como dublês: o que está sob teste é a decisão de
// registrar (qual ação, com que antes e depois), não a escrita no Postgres.

import { beforeEach, describe, expect, it, vi } from "vitest";

const registrarLog = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();

vi.mock("@/server/services/activity-log", () => ({
  registrarLog: (e: unknown) => registrarLog(e),
}));
vi.mock("@/lib/auth-helpers", () => ({
  getAdminOrThrow: async () => ({
    user: { id: "admin1", name: "Dono", role: "ADMIN", tenantId: "t1" },
  }),
}));
vi.mock("@/lib/tenant", () => ({
  getActiveTenantIdForAdmin: async () => "t1",
}));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: {
      findUnique: (a: unknown) => findUnique(a),
      update: (a: unknown) => update(a),
      create: (a: unknown) => create(a),
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { updateUserAction, criarUsuarioAction } = await import("./users");

const ALVO = "cjld2cyuq0000t3rmniod1foy";

function alvoNoBanco(over: Record<string, unknown> = {}) {
  return {
    id: ALVO,
    name: "Maria Silva",
    email: null,
    cpf: null,
    phone: null,
    role: "PARTICIPANT",
    showModBadge: false,
    tenantId: "t1",
    reservations: [],
    ...over,
  };
}

const FORM_BASE = {
  id: ALVO,
  name: "Maria Silva",
  email: "",
  cpf: "",
  phone: "",
  showModBadge: false,
};

describe("updateUserAction", () => {
  beforeEach(() => {
    registrarLog.mockReset();
    findUnique.mockReset().mockResolvedValue(alvoNoBanco());
    update.mockReset().mockResolvedValue({ id: ALVO });
  });

  it("promover registra papel_alterado com o antes e o depois", async () => {
    const r = await updateUserAction({ ...FORM_BASE, role: "ADMIN" });
    expect(r.ok).toBe(true);

    const entrada = registrarLog.mock.calls[0]![0];
    expect(entrada.acao).toBe("usuario.papel_alterado");
    expect(entrada.detalhes.antes.papel).toBe("PARTICIPANT");
    expect(entrada.detalhes.depois.papel).toBe("ADMIN");
    expect(entrada.alvo).toEqual({
      tipo: "User",
      id: ALVO,
      rotulo: "Maria Silva",
    });
  });

  it("mudar só o nome registra editado, não papel_alterado", async () => {
    await updateUserAction({
      ...FORM_BASE,
      name: "Maria Souza",
      role: "PARTICIPANT",
    });

    expect(registrarLog.mock.calls[0]![0].acao).toBe("usuario.editado");
  });

  it("salvar sem mexer em nada não vira linha no histórico", async () => {
    // O formulário manda "" onde o banco tem null. Sem a normalização do
    // lado "depois", todo salvamento geraria um registro de mudança
    // fantasma, e o histórico viraria ruído em uma semana.
    await updateUserAction({ ...FORM_BASE, role: "PARTICIPANT" });

    expect(registrarLog).not.toHaveBeenCalled();
  });
});

describe("criarUsuarioAction", () => {
  beforeEach(() => {
    registrarLog.mockReset();
    create.mockReset().mockResolvedValue({ id: ALVO });
  });

  it("registra a criação sem deixar a senha temporária vazar", async () => {
    const r = await criarUsuarioAction({
      name: "Novo Admin",
      email: "novo@x.com",
      cpf: "",
      phone: "",
      role: "ADMIN",
    });

    expect(r.ok).toBe(true);
    const entrada = registrarLog.mock.calls[0]![0];
    expect(entrada.acao).toBe("usuario.criado");
    expect(entrada.detalhes.comAcessoAoPainel).toBe(true);
    // A asserção que interessa vive dentro do `if`, e esta linha existe para
    // que o ramo não deixe de ser tomado em silêncio: sem ela, uma mudança
    // que parasse de gerar senha apagaria a única guarda automatizada de que
    // a senha não vaza para o log, e o teste continuaria passando.
    expect(r.ok && r.data.senhaTemporaria).toBeTruthy();
    if (r.ok && r.data.senhaTemporaria) {
      expect(JSON.stringify(entrada)).not.toContain(r.data.senhaTemporaria);
    }
  });
});
