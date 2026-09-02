// Teste de integração do preço sugerido, contra um Postgres real.
//
// O que importa aqui é a ORDEM DAS FONTES e o que fica gravado depois, e as
// duas coisas moram no banco: o cache de doze horas, o valor que o catálogo
// aprende quando a Steam responde, e a reserva que salva o painel quando ela
// não responde. Com banco falso, nenhuma das três seria provada.
//
// A Steam entra por fetch de mentira: o teste não pode depender de um serviço
// de fora estar no ar, e é justamente o caso dele fora do ar que precisa ser
// testado.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { precoSugeridoDaSkin, precoSugeridoPeloNome } from "./preco-de-skin";

function isLocalDatabase(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url) return false;
  if (process.env.XP_INTEGRATION_ALLOW_REMOTE === "1") return true;
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
    );
  } catch {
    return false;
  }
}

const suite = isLocalDatabase() ? describe : describe.skip;

/** A Steam respondendo com um preço. */
function steamResponde(medianPrice: string) {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      median_price: medianPrice,
      lowest_price: medianPrice,
      volume: "12",
    }),
  }));
}

/** A Steam sem anúncio do item. */
function steamSemAnuncio() {
  vi.stubGlobal("fetch", async () => ({
    ok: true,
    status: 200,
    json: async () => ({ success: false }),
  }));
}

/** A Steam limitando por IP, que é o modo de falha mais comum dela. */
function steamLimitou() {
  vi.stubGlobal("fetch", async () => ({ ok: false, status: 429 }));
}

const skinsCriadas: string[] = [];

suite("preço sugerido da skin (integração)", () => {
  let tenantId: string;

  async function novaSkin(valorNoCatalogo: number | null): Promise<string> {
    const skin = await prisma.skinTemplate.create({
      data: {
        tenantId,
        name: `★ Faca de teste ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        skinValueBrl: valorNoCatalogo,
      },
      select: { id: true },
    });
    skinsCriadas.push(skin.id);
    return skin.id;
  }

  beforeEach(async () => {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error("Banco sem Tenant: rode o seed antes.");
    tenantId = tenant.id;
  });

  afterEach(() => vi.unstubAllGlobals());

  afterAll(async () => {
    await prisma.skinPreco.deleteMany({
      where: { skinTemplateId: { in: skinsCriadas } },
    });
    await prisma.skinTemplate.deleteMany({ where: { id: { in: skinsCriadas } } });
  });

  it("a Steam responde: grava o preço e o catálogo aprende o valor", async () => {
    const id = await novaSkin(null);
    steamResponde("R$ 1.234,56");

    const r = await precoSugeridoDaSkin({
      skinTemplateId: id,
      tenantId,
      wear: "FIELD_TESTED",
    });

    expect(r).toMatchObject({ ok: true, brl: 1234.56, origem: "steam" });

    // O catálogo aprendeu: da próxima vez, mesmo com a Steam fora, o painel
    // ainda sugere preço para esta skin.
    const skin = await prisma.skinTemplate.findUniqueOrThrow({
      where: { id },
      select: { skinValueBrl: true },
    });
    expect(Number(skin.skinValueBrl)).toBe(1234.56);

    const guardado = await prisma.skinPreco.findFirst({
      where: { skinTemplateId: id, wear: "FIELD_TESTED" },
      select: { brl: true, volume: true },
    });
    expect(Number(guardado?.brl)).toBe(1234.56);
    expect(guardado?.volume).toBe(12);
  });

  it("a segunda consulta vem do cache, sem bater na Steam", async () => {
    const id = await novaSkin(null);
    steamResponde("R$ 100,00");
    await precoSugeridoDaSkin({ skinTemplateId: id, tenantId, wear: null });

    // Se ela batesse na Steam de novo, este preço novo apareceria.
    steamResponde("R$ 999,00");
    const r = await precoSugeridoDaSkin({ skinTemplateId: id, tenantId, wear: null });
    expect(r).toMatchObject({ ok: true, brl: 100, origem: "cache" });
  });

  it("forçar ignora o cache", async () => {
    const id = await novaSkin(null);
    steamResponde("R$ 100,00");
    await precoSugeridoDaSkin({ skinTemplateId: id, tenantId, wear: null });

    steamResponde("R$ 150,00");
    const r = await precoSugeridoDaSkin({
      skinTemplateId: id,
      tenantId,
      wear: null,
      forcar: true,
    });
    expect(r).toMatchObject({ ok: true, brl: 150, origem: "steam" });
  });

  it("a Steam sem anúncio cai no valor do catálogo", async () => {
    // É o caso que deixou uma campanha nascer com o preço no padrão: a busca
    // rodou, voltou vazia, e não havia reserva nenhuma.
    const id = await novaSkin(880);
    steamSemAnuncio();

    const r = await precoSugeridoDaSkin({
      skinTemplateId: id,
      tenantId,
      wear: "FIELD_TESTED",
    });
    expect(r).toMatchObject({ ok: true, brl: 880, origem: "catalogo" });
  });

  it("a Steam limitando também cai no catálogo", async () => {
    const id = await novaSkin(450);
    steamLimitou();

    const r = await precoSugeridoDaSkin({
      skinTemplateId: id,
      tenantId,
      wear: null,
    });
    expect(r).toMatchObject({ ok: true, brl: 450, origem: "catalogo" });
  });

  it("sem Steam e sem catálogo, diz o que fazer em vez de ficar em silêncio", async () => {
    const id = await novaSkin(null);
    steamSemAnuncio();

    const r = await precoSugeridoDaSkin({
      skinTemplateId: id,
      tenantId,
      wear: "FIELD_TESTED",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.semPreco).toBe(true);
      expect(r.erro).toMatch(/preencha o preço à mão/i);
    }
  });

  it("a busca pelo nome acha a skin do catálogo, e recusa nome de fora", async () => {
    const id = await novaSkin(200);
    const skin = await prisma.skinTemplate.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    steamSemAnuncio();

    const achou = await precoSugeridoPeloNome({
      nome: skin.name,
      tenantId,
      wear: null,
    });
    expect(achou).toMatchObject({ ok: true, brl: 200, origem: "catalogo" });

    const naoAchou = await precoSugeridoPeloNome({
      nome: "Skin que não existe no catálogo",
      tenantId,
      wear: null,
    });
    expect(naoAchou.ok).toBe(false);
  });
});
