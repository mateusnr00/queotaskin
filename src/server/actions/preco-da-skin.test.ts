// O que a action do preço faz, e o que ela recusa fazer.
//
// Banco e sessão entram como dublês: o que está sob teste é a decisão (de
// onde vem o nome consultado, o que fica gravado, o que acontece quando a
// Steam não ajuda), e não a escrita no Postgres.

import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirstSkin = vi.fn();
const updateManySkin = vi.fn();
const findFirstPrize = vi.fn();

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
    skinTemplate: {
      findFirst: (a: unknown) => findFirstSkin(a),
      updateMany: (a: unknown) => updateManySkin(a),
    },
    prize: { findFirst: (a: unknown) => findFirstPrize(a) },
  },
}));

const { precoDaSkinAction, precoDaSkinDoSorteioAction } = await import(
  "./preco-da-skin"
);

const SKIN = "cjld2cyuq0000t3rmniod1foy";
const SORTEIO = "cjld2cyuq0000t3rmniod1fo1";

function steamResponde(corpo: unknown, status = 200) {
  const chamadas: unknown[][] = [];
  vi.stubGlobal("fetch", async (url: unknown, opcoes?: unknown) => {
    chamadas.push([url, opcoes]);
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
  });
  return chamadas;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  findFirstSkin.mockResolvedValue({
    name: "AK-47 | Redline",
    skinStatTrak: false,
    skinSouvenir: false,
    skinWear: null,
  });
  updateManySkin.mockResolvedValue({ count: 1 });
});

describe("precoDaSkinAction", () => {
  it("devolve o preço da Steam com a mediana e o volume", async () => {
    steamResponde({
      success: true,
      lowest_price: "R$ 128,45",
      median_price: "R$ 126,70",
      volume: "523",
    });

    const r = await precoDaSkinAction({
      skinTemplateId: SKIN,
      wear: "FIELD_TESTED",
    });
    expect(r).toMatchObject({
      ok: true,
      brl: 128.45,
      medianaBrl: 126.7,
      volume: 523,
      marketHashName: "AK-47 | Redline (Field-Tested)",
    });
  });

  it("o nome consultado sai do BANCO, não do que a tela mandar", async () => {
    // Aceitar o market_hash_name pronto deixaria consultar um item e gravar o
    // valor de outro. O que atravessa é o id do item do catálogo.
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 10,00" });
    await precoDaSkinAction({
      skinTemplateId: SKIN,
      wear: "FIELD_TESTED",
      // Lixo de propósito: a action ignora, porque nem lê este campo.
      marketHashName: "AWP | Dragon Lore (Factory New)",
      brl: 999999,
    });

    const url = decodeURIComponent(String(chamadas[0]?.[0]));
    expect(url).toContain("AK-47 | Redline (Field-Tested)");
    expect(url).not.toContain("Dragon Lore");
  });

  it("o tenant entra na busca da skin, para não sondar catálogo alheio", async () => {
    steamResponde({ success: true, lowest_price: "R$ 10,00" });
    await precoDaSkinAction({ skinTemplateId: SKIN, wear: null });
    expect(findFirstSkin).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: SKIN, tenantId: "t1" }),
      }),
    );
  });

  it("skin de outro painel simplesmente não é encontrada", async () => {
    findFirstSkin.mockResolvedValue(null);
    steamResponde({ success: true, lowest_price: "R$ 10,00" });
    const r = await precoDaSkinAction({ skinTemplateId: SKIN, wear: null });
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erro).toMatch(/não encontrada/i);
  });

  it("grava no CATÁLOGO, que é a fonte única do valor", async () => {
    steamResponde({
      success: true,
      lowest_price: "R$ 1.249,90",
      median_price: "R$ 1.200,00",
    });

    await precoDaSkinAction({ skinTemplateId: SKIN, wear: "FIELD_TESTED" });

    const chamada = updateManySkin.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    // Só dentro do painel de quem chamou.
    expect(chamada.where).toMatchObject({ id: SKIN, tenantId: "t1" });
    expect(chamada.data).toMatchObject({
      skinValueBrl: 1249.9,
      externalMedianPriceBrl: 1200,
      marketHashName: "AK-47 | Redline (Field-Tested)",
      priceProvider: "Steam Community Market",
    });
    expect(chamada.data.externalPriceUpdatedAt).toBeInstanceOf(Date);
  });

  it("Steam sem anúncio não grava e explica o que fazer", async () => {
    steamResponde({ success: false });
    const r = await precoDaSkinAction({ skinTemplateId: SKIN, wear: null });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.motivo).toBe("PRICE_NOT_FOUND");
      expect(r.erro).toMatch(/preço à mão/i);
    }
    // O importante: valor velho não é sobrescrito por consulta que falhou.
    expect(updateManySkin).not.toHaveBeenCalled();
  });

  it("clique antes de escolher a skin diz o que fazer", async () => {
    const r = await precoDaSkinAction({});
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.erro).toMatch(/escolha a skin/i);
  });
});

describe("precoDaSkinDoSorteioAction", () => {
  it("acha a skin pelo prêmio salvo e grava o retrato", async () => {
    findFirstPrize.mockResolvedValue({
      skinName: "★ Karambit | Doppler Phase 2",
      skinWear: "FACTORY_NEW",
      skinStatTrak: false,
      skinSouvenir: false,
    });
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 5.000,00" });

    findFirstSkin.mockResolvedValue({ id: SKIN });
    const r = await precoDaSkinDoSorteioAction({ raffleId: SORTEIO });
    expect(r).toMatchObject({ ok: true, brl: 5000 });

    // A fase saiu do nome: a Steam não tem "Doppler Phase 2".
    const url = decodeURIComponent(String(chamadas[0]?.[0]));
    expect(url).toContain("★ Karambit | Doppler (Factory New)");
    // E o que foi gravado foi o CATÁLOGO, nunca o prêmio congelado.
    expect(updateManySkin).toHaveBeenCalled();
  });

  it("sorteio sem skin no prêmio não consulta nada", async () => {
    findFirstPrize.mockResolvedValue(null);
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 10,00" });
    const r = await precoDaSkinDoSorteioAction({ raffleId: SORTEIO });
    expect(r).toMatchObject({ ok: false });
    expect(chamadas).toHaveLength(0);
  });

  it("o tenant entra na busca do prêmio", async () => {
    findFirstPrize.mockResolvedValue(null);
    await precoDaSkinDoSorteioAction({ raffleId: SORTEIO });
    expect(findFirstPrize).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ raffle: { tenantId: "t1" } }),
      }),
    );
  });
});
