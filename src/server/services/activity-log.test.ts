import { beforeEach, describe, expect, it, vi } from "vitest";

const criar = vi.fn();
const sessao = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { activityLog: { create: (args: unknown) => criar(args) } },
}));
vi.mock("@/auth", () => ({ auth: () => sessao() }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.9" }),
}));

const { registrarLog } = await import("./activity-log");

describe("registrarLog", () => {
  beforeEach(() => {
    criar.mockReset().mockResolvedValue({ id: "log1" });
    sessao.mockReset().mockResolvedValue({
      user: {
        id: "u1",
        name: "João",
        email: "joao@x.com",
        role: "ADMIN",
      },
    });
  });

  it("congela o ator da sessão no registro", async () => {
    await registrarLog({ acao: "usuario.criado", tenantId: "t1" });

    const dados = criar.mock.calls[0]![0].data;
    expect(dados.actorId).toBe("u1");
    expect(dados.actorName).toBe("João");
    expect(dados.actorRole).toBe("ADMIN");
    expect(dados.tenantId).toBe("t1");
    expect(dados.origem).toBe("PAINEL");
    expect(dados.ip).toBe("203.0.113.9");
  });

  it("com ator informado não consulta a sessão", async () => {
    // É o caso do webhook e do cron: não existe sessão nenhuma para ler, e
    // tentar ler daria erro dentro do caminho de confirmação de pagamento.
    await registrarLog({
      acao: "pagamento.aprovado",
      origem: "SISTEMA",
      ator: { nome: "Gateway SyncPay" },
    });

    expect(sessao).not.toHaveBeenCalled();
    const dados = criar.mock.calls[0]![0].data;
    expect(dados.actorName).toBe("Gateway SyncPay");
    expect(dados.actorId).toBeNull();
    expect(dados.origem).toBe("SISTEMA");
  });

  it("sanitiza antes de gravar, sem depender de quem chamou", async () => {
    await registrarLog({
      acao: "config.pagamento_alterada",
      detalhes: { depois: { clientSecret: "sk_live_1" } },
    });

    const dados = criar.mock.calls[0]![0].data;
    expect(JSON.stringify(dados.detalhes)).not.toContain("sk_live_1");
  });

  it("não lança quando a escrita falha, e reporta", async () => {
    // Um registro que falha não pode derrubar a venda que ele registrava.
    criar.mockRejectedValue(new Error("banco fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      registrarLog({ acao: "reserva.criada" })
    ).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();

    erro.mockRestore();
  });

  it("sem sessão grava ator desconhecido em vez de sumir com o registro", async () => {
    sessao.mockResolvedValue(null);
    await registrarLog({ acao: "reserva.criada" });

    expect(criar.mock.calls[0]![0].data.actorName).toBe("Desconhecido");
  });
});
