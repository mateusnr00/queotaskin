// A regra que nenhuma falha pode quebrar: consulta que dá errado não apaga
// o que já estava guardado.
//
// Contra Postgres de verdade, e não contra dublê de banco, porque o que está
// sob teste é o ESTADO DA LINHA depois da falha. Com prisma falso, "não
// chamou o update" seria a única coisa provável, e ela não é a mesma
// afirmação que "a linha continua intacta".
//
// A ORDEM É A GARANTIA
//
// buscar, validar, e SÓ ENTÃO gravar. Nunca limpar antes de buscar. Um
// catálogo que zera o preço para depois tentar preencher fica sem preço toda
// vez que a fonte falha, e a fonte deste projeto já falhou.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-helpers", () => ({
  getAdminOrThrow: async () => ({
    user: { id: "admin1", name: "Dono", role: "ADMIN" },
  }),
}));

const { prisma } = await import("@/lib/db");
const TENANT = await prisma.tenant.findFirst({ select: { id: true } });

vi.mock("@/lib/tenant", () => ({
  getActiveTenantIdForAdmin: async () => process.env.__TENANT_DO_TESTE,
}));

const { precoDaSkinAction } = await import("./preco-da-skin");

function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (process.env.XP_INTEGRATION_ALLOW_REMOTE === "1") return true;
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

const suite = isLocalDatabase() && TENANT ? describe : describe.skip;

/** O que estava guardado antes de qualquer consulta falhar. */
const VALOR_ANTERIOR = 128.45;
const MEDIANA_ANTERIOR = 126.7;
const CONSULTADO_ANTES = new Date("2026-09-01T10:00:00.000Z");

const criadas: string[] = [];

suite("consulta que falha não apaga o catálogo (integração)", () => {
  let skinId: string;

  beforeEach(async () => {
    process.env.__TENANT_DO_TESTE = TENANT!.id;
    const skin = await prisma.skinTemplate.create({
      data: {
        tenantId: TENANT!.id,
        name: `AK-47 | Teste ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        skinValueBrl: VALOR_ANTERIOR,
        marketHashName: "AK-47 | Redline (Field-Tested)",
        priceProvider: "Steam Community Market",
        externalMedianPriceBrl: MEDIANA_ANTERIOR,
        externalPriceUpdatedAt: CONSULTADO_ANTES,
      },
      select: { id: true },
    });
    skinId = skin.id;
    criadas.push(skin.id);
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await prisma.skinTemplate.deleteMany({ where: { id: { in: criadas } } });
  });

  async function comoEstaAgora() {
    const linha = await prisma.skinTemplate.findUniqueOrThrow({
      where: { id: skinId },
      select: {
        skinValueBrl: true,
        externalMedianPriceBrl: true,
        externalPriceUpdatedAt: true,
        marketHashName: true,
      },
    });
    return {
      valor: linha.skinValueBrl == null ? null : Number(linha.skinValueBrl),
      mediana:
        linha.externalMedianPriceBrl == null
          ? null
          : Number(linha.externalMedianPriceBrl),
      consultadoEm: linha.externalPriceUpdatedAt?.toISOString() ?? null,
      nome: linha.marketHashName,
    };
  }

  /** Os cinco modos de falha, cada um do jeito que a fonte os produz. */
  const FALHAS = [
    {
      motivo: "PRICE_PROVIDER_TIMEOUT",
      como: () =>
        vi.stubGlobal("fetch", async () => {
          const e = new Error("timeout");
          e.name = "TimeoutError";
          throw e;
        }),
    },
    {
      motivo: "PRICE_PROVIDER_RATE_LIMIT",
      como: () =>
        vi.stubGlobal("fetch", async () => ({
          ok: false,
          status: 429,
          json: async () => ({}),
        })),
    },
    {
      motivo: "PRICE_PROVIDER_BLOCKED",
      como: () =>
        vi.stubGlobal("fetch", async () => ({
          ok: false,
          status: 403,
          json: async () => ({}),
        })),
    },
    {
      motivo: "PRICE_NOT_FOUND",
      como: () =>
        vi.stubGlobal("fetch", async () => ({
          ok: true,
          status: 200,
          json: async () => ({ success: false }),
        })),
    },
    {
      motivo: "INVALID_PROVIDER_RESPONSE",
      como: () =>
        vi.stubGlobal("fetch", async () => ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token '<'");
          },
        })),
    },
  ] as const;

  for (const falha of FALHAS) {
    it(`${falha.motivo}: distingue o erro e não toca no valor guardado`, async () => {
      falha.como();
      const antes = await comoEstaAgora();

      const r = await precoDaSkinAction({
        skinTemplateId: skinId,
        wear: "FIELD_TESTED",
      });

      // 1. O backend distingue o erro.
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.motivo).toBe(falha.motivo);
        // 3. E a mensagem é frase de gente, com o que fazer a seguir.
        expect(r.erro).toMatch(/preencha o preço à mão/i);
      }

      // 5. Nada foi apagado, nem o valor, nem a mediana, nem o nome.
      const depois = await comoEstaAgora();
      expect(depois.valor).toBe(VALOR_ANTERIOR);
      expect(depois.mediana).toBe(MEDIANA_ANTERIOR);
      expect(depois.nome).toBe("AK-47 | Redline (Field-Tested)");

      // E o relógio não mente: consulta que falhou não é consulta.
      expect(depois.consultadoEm).toBe(CONSULTADO_ANTES.toISOString());
      expect(depois.consultadoEm).toBe(antes.consultadoEm);
    });
  }

  it("consulta boa atualiza tudo, que é o contraste dos testes acima", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        lowest_price: "R$ 200,00",
        median_price: "R$ 210,00",
      }),
    }));

    const r = await precoDaSkinAction({
      skinTemplateId: skinId,
      wear: "FACTORY_NEW",
    });
    expect(r.ok).toBe(true);

    const depois = await comoEstaAgora();
    expect(depois.valor).toBe(200);
    expect(depois.mediana).toBe(210);
    // Agora sim o relógio anda.
    expect(depois.consultadoEm).not.toBe(CONSULTADO_ANTES.toISOString());
  });

  it("o valor manual do catálogo continua servindo quando a fonte cai", async () => {
    // 2 e 4: a falha não bloqueia nada. Quem digitou R$ 128,45 no catálogo
    // segue com esse número disponível para o formulário sugerir a cota.
    vi.stubGlobal("fetch", async () => ({
      ok: false,
      status: 429,
      json: async () => ({}),
    }));
    await precoDaSkinAction({ skinTemplateId: skinId, wear: "FIELD_TESTED" });

    const linha = await prisma.skinTemplate.findUniqueOrThrow({
      where: { id: skinId },
      select: { skinValueBrl: true },
    });
    expect(Number(linha.skinValueBrl)).toBe(VALOR_ANTERIOR);
  });
});
