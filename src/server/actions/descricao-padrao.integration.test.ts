// A DESCRIÇÃO GRAVADA É A DESCRIÇÃO MOSTRADA.
//
// O texto padrão é montado no formulário e viaja no payload como qualquer
// outro campo. O que este arquivo prova é o final da viagem: o que a página
// pública lê do banco é byte a byte o que foi criado, sem regeneração
// nenhuma na hora de exibir.
//
// Isso importa porque a alternativa, montar o texto na página a partir da
// skin, mudaria sozinha a descrição de campanhas antigas quando o preço de
// referência mudasse. Quem escreve a descrição decide quando ela muda.
//
// Contra Postgres de verdade: acento, emoji, ★ e quebra de linha atravessam
// driver, coluna e leitura. Dublê de banco devolveria a string que recebeu e
// não afirmaria nada.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// O id do admin sai do banco: a campanha tem chave estrangeira para o autor,
// e um id inventado derruba o create antes de a descrição chegar à coluna.
vi.mock("@/lib/auth-helpers", () => ({
  getAdminOrThrow: async () => ({
    user: { id: process.env.__ADMIN_DA_DESCRICAO, name: "Dono", role: "ADMIN" },
  }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock("@/lib/tenant", () => ({
  getActiveTenantIdForAdmin: async () => process.env.__TENANT_DA_DESCRICAO,
}));

const { prisma } = await import("@/lib/db");
const { montarDescricaoPadrao } = await import("@/lib/descricao-padrao");
const { createRaffleAction } = await import("./raffles");

const local = /(?:localhost|127\.0\.0\.1):5433/.test(process.env.DATABASE_URL ?? "");
const conta = local ? describe : describe.skip;

conta("descrição padrão, da criação até a leitura pública", () => {
  let tenantId = "";
  const criados: string[] = [];

  beforeAll(async () => {
    const t = await prisma.tenant.findFirst({ select: { id: true } });
    if (!t) throw new Error("O banco de teste precisa de ao menos um Tenant.");
    tenantId = t.id;
    process.env.__TENANT_DA_DESCRICAO = tenantId;

    const admin = await prisma.user.findFirst({ select: { id: true } });
    if (!admin) throw new Error("O banco de teste precisa de ao menos um User.");
    process.env.__ADMIN_DA_DESCRICAO = admin.id;
  });

  afterEach(async () => {
    if (criados.length) {
      await prisma.raffle.deleteMany({ where: { id: { in: criados } } });
      criados.length = 0;
    }
  });

  afterAll(async () => {
    delete process.env.__TENANT_DA_DESCRICAO;
    delete process.env.__ADMIN_DA_DESCRICAO;
    await prisma.$disconnect();
  });

  function payload(description: string, slug: string) {
    return {
      title: "Sorteio de teste da descrição",
      slug,
      description,
      descriptionMode: "COLLAPSED" as const,
      privacy: "PUBLIC" as const,
      modality: "OWN_DRAW" as const,
      reservationModel: "RANDOM_NUMBERS" as const,
      requiredFields: { name: true, phone: true, cpf: true, email: false },
      totalNumbers: 100,
      pricePerNumber: 5,
    };
  }

  it("grava o texto padrão inteiro na criação e o devolve intacto", async () => {
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "★ Karambit | Doppler (Factory New)",
      precoBrl: 4812.9,
      nomeDoSite: "Qué Ota? Skin",
    });

    const slug = `descricao-padrao-${Date.now()}`;
    const r = await createRaffleAction(payload(texto, slug));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.data.id);

    // A MESMA leitura da página pública: por tenant e slug.
    const lido = await prisma.raffle.findUnique({
      where: { tenantId_slug: { tenantId, slug: r.data.slug } },
      select: { description: true },
    });

    expect(lido?.description).toBe(texto);
    // As quebras que o `whitespace-pre-wrap` vai renderizar continuam lá,
    // e o ★ não virou "?" no caminho.
    expect(lido?.description).toContain("\n\n");
    expect(lido?.description).toContain("★ Karambit | Doppler (Factory New)");
    expect(lido?.description).toContain("R$ 4.812,90");
  });

  it("a campanha sem preço não guarda linha de valor nenhuma", async () => {
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "Glock-18 | Fade (Minimal Wear)",
      precoBrl: null,
      nomeDoSite: "Qué Ota? Skin",
    });

    const slug = `descricao-sem-preco-${Date.now()}`;
    const r = await createRaffleAction(payload(texto, slug));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    criados.push(r.data.id);

    const lido = await prisma.raffle.findUnique({
      where: { tenantId_slug: { tenantId, slug: r.data.slug } },
      select: { description: true },
    });
    expect(lido?.description).toBe(texto);
    expect(lido?.description).not.toContain("VALOR STEAM");
    expect(lido?.description).not.toMatch(/null|NaN|R\$\s*0,00/);
  });
});
