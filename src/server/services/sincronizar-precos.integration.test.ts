// Teste de integração do enchimento de preços, contra um Postgres real.
//
// O que importa aqui é o CASAMENTO DE NOMES, e ele só se prova com o catálogo
// no banco: o despejo escreve "★ Karambit | Doppler (Factory New)" e o catálogo
// daqui escreve "★ Karambit | Doppler Phase 1". São 182 das 865 skins
// cadastradas que dependem dessa costura, e ela não aparece em teste de função
// pura porque metade dela é a consulta ao catálogo.
//
// A rede entra por fetch de mentira, e de propósito: a primeira versão deste
// recurso caiu porque a fonte respondeu uma página HTML, e é justamente esse
// caso que precisa estar coberto.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/db";
import { sincronizarPrecosDoCatalogo } from "./sincronizar-precos";

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

/** O dólar de mentira, para a conta de conversão ser conferível. */
const DOLAR = 5.5;

interface Resposta {
  ok: boolean;
  status: number;
  corpo: string;
}

/**
 * O fetch de mentira, que responde por endereço.
 *
 * A cotação e o despejo saem da mesma função, então o roteamento é por pedaço
 * da URL: sem isso, a cotação receberia o despejo e a conta sairia errada.
 */
function rede(respostas: { csgotrader?: Resposta; csgobackpack?: Resposta }) {
  vi.stubGlobal("fetch", async (url: unknown) => {
    const endereco = String(url);

    if (endereco.includes("awesomeapi")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          USDBRL: {
            bid: String(DOLAR - 0.1),
            ask: String(DOLAR),
            timestamp: String(Math.floor(Date.now() / 1000)),
          },
        }),
        text: async () => "",
      };
    }

    for (const [chave, resposta] of Object.entries(respostas)) {
      if (!endereco.includes(chave) || !resposta) continue;
      return {
        ok: resposta.ok,
        status: resposta.status,
        text: async () => resposta.corpo,
        json: async () => JSON.parse(resposta.corpo),
      };
    }

    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  });
}

function json(corpo: unknown): Resposta {
  return { ok: true, status: 200, corpo: JSON.stringify(corpo) };
}

const skinsCriadas: string[] = [];

suite("sincronizar preços do catálogo (integração)", () => {
  let tenantId: string;
  /** Um sufixo por rodada, para os nomes não baterem com os do seed. */
  let marca: string;

  async function novaSkin(
    nome: string,
    extra?: { statTrak?: boolean; souvenir?: boolean },
  ): Promise<string> {
    const skin = await prisma.skinTemplate.create({
      data: {
        tenantId,
        name: nome,
        skinStatTrak: extra?.statTrak ?? false,
        skinSouvenir: extra?.souvenir ?? false,
      },
      select: { id: true },
    });
    skinsCriadas.push(skin.id);
    return skin.id;
  }

  async function precoDe(id: string, wear: string | null): Promise<number | null> {
    const linha = await prisma.skinPreco.findFirst({
      where: { skinTemplateId: id, wear: wear as never },
      select: { brl: true },
    });
    return linha ? Number(linha.brl) : null;
  }

  beforeEach(async () => {
    const tenant = await prisma.tenant.findFirst({ select: { id: true } });
    if (!tenant) throw new Error("Banco sem Tenant: rode o seed antes.");
    tenantId = tenant.id;
    marca = Math.random().toString(36).slice(2, 8);
    // A válvula de ambiente não pode entrar no meio de um teste de fonte.
    vi.stubEnv("PRECOS_DESPEJO_URL", "");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await prisma.skinPreco.deleteMany({
      where: { skinTemplateId: { in: skinsCriadas } },
    });
    await prisma.skinTemplate.deleteMany({ where: { id: { in: skinsCriadas } } });
  });

  it("casa a fase da Doppler e usa a linha sem fase como reserva", async () => {
    const faca = `★ Karambit ${marca}`;
    const phase1 = await novaSkin(`${faca} | Doppler Phase 1`);
    const phase2 = await novaSkin(`${faca} | Doppler Phase 2`);

    rede({
      csgotrader: json({
        [`${faca} | Doppler (Factory New)`]: {
          steam: { last_7d: 1000, doppler: { "Phase 1": 1200 } },
        },
      }),
    });

    const r = await sincronizarPrecosDoCatalogo({ tenantId });
    expect(r.ok).toBe(true);

    // A Phase 1 tem preço próprio no despejo e é ele que vale. Herdar o preço
    // da faixa toda erraria em 200 dólares nesta faca.
    expect(await precoDe(phase1, "FACTORY_NEW")).toBe(1200 * DOLAR);
    // A Phase 2 não tem preço próprio, então fica com o da faixa: preço da
    // faixa é pior que o exato e é muito melhor que preço nenhum.
    expect(await precoDe(phase2, "FACTORY_NEW")).toBe(1000 * DOLAR);
  });

  it("StatTrak não herda o preço da linha comum", async () => {
    // A diferença entre os dois é de vezes, não de por cento.
    const nome = `AK-47 ${marca} | Asiimov`;
    const comum = await novaSkin(nome);
    const stattrak = await novaSkin(`${nome} ST`, { statTrak: true });

    rede({
      csgotrader: json({
        [`${nome} (Field-Tested)`]: { steam: { last_7d: 50 } },
      }),
    });

    const r = await sincronizarPrecosDoCatalogo({ tenantId });
    expect(r.ok).toBe(true);
    expect(await precoDe(comum, "FIELD_TESTED")).toBe(50 * DOLAR);
    expect(await precoDe(stattrak, "FIELD_TESTED")).toBeNull();
  });

  it("o catálogo aprende o valor de referência, com o Field-Tested na frente", async () => {
    const nome = `AWP ${marca} | Asiimov`;
    const id = await novaSkin(nome);

    rede({
      csgotrader: json({
        [`${nome} (Factory New)`]: { steam: { last_7d: 100 } },
        [`${nome} (Field-Tested)`]: { steam: { last_7d: 40 } },
        [`${nome} (Battle-Scarred)`]: { steam: { last_7d: 20 } },
      }),
    });

    await sincronizarPrecosDoCatalogo({ tenantId });

    const skin = await prisma.skinTemplate.findUniqueOrThrow({
      where: { id },
      select: { skinValueBrl: true },
    });
    // Field-Tested manda por ser o acabamento mais sorteado, mesmo não sendo o
    // mais barato nem o mais caro.
    expect(Number(skin.skinValueBrl)).toBe(40 * DOLAR);
  });

  it("página HTML na primeira fonte não derruba o recurso: tenta a próxima", async () => {
    // Foi exatamente isto que quebrou a primeira versão, e ela tinha uma fonte
    // só.
    const nome = `M4A1-S ${marca} | Printstream`;
    const id = await novaSkin(nome);

    rede({
      csgotrader: {
        ok: true,
        status: 200,
        corpo: "<!DOCTYPE html><html><body>404</body></html>",
      },
      csgobackpack: json({
        success: true,
        items_list: {
          [`${nome} (Minimal Wear)`]: {
            price: { "7_days": { median: 80, average: 82, sold: "300" } },
          },
        },
      }),
    });

    const r = await sincronizarPrecosDoCatalogo({ tenantId });
    expect(r).toMatchObject({ ok: true, fonte: "csgobackpack" });
    expect(await precoDe(id, "MINIMAL_WEAR")).toBe(80 * DOLAR);
  });

  it("todas as fontes fora do ar viram um motivo legível, sem expor endereço", async () => {
    await novaSkin(`Glock-18 ${marca} | Fade`);

    rede({
      csgotrader: {
        ok: true,
        status: 200,
        corpo: "<!DOCTYPE html><html></html>",
      },
      csgobackpack: { ok: false, status: 503, corpo: "" },
    });

    const r = await sincronizarPrecosDoCatalogo({ tenantId });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toMatch(/csgotrader: respondeu uma página HTML/i);
      expect(r.erro).toMatch(/csgobackpack: respondeu 503/i);
      // O endereço nunca entra na mensagem: a válvula do ambiente pode
      // carregar uma chave dentro da URL.
      expect(r.erro).not.toMatch(/https?:\/\//);
    }
  });

  it("despejo que não casa com nada diz isso, em vez de dizer que deu certo", async () => {
    await novaSkin(`Desert Eagle ${marca} | Blaze`);

    rede({
      csgotrader: json({
        "Skin que não está no catálogo (Factory New)": { steam: { last_7d: 5 } },
      }),
    });

    const r = await sincronizarPrecosDoCatalogo({ tenantId });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/nenhum casou com as skins do catálogo/i);
  });
});
