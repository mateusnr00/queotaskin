import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CACHE_EM_SEGUNDOS,
  SteamMarketProvider,
  precoDaSkinNoMercado,
} from "./skin-price";

/** O que a Steam responde quando dá certo. */
type ChamadaDeFetch = [url: unknown, opcoes?: { next?: { revalidate?: number }; cache?: string }];

function steamResponde(corpo: unknown, status = 200) {
  // As chamadas são guardadas à mão para o teste poder conferir a URL e as
  // opções de cache sem depender da inferência de tipo do vi.fn.
  const chamadas: ChamadaDeFetch[] = [];
  vi.stubGlobal("fetch", async (url: unknown, opcoes?: ChamadaDeFetch[1]) => {
    chamadas.push([url, opcoes]);
    return { ok: status >= 200 && status < 300, status, json: async () => corpo };
  });
  return chamadas;
}

afterEach(() => vi.unstubAllGlobals());

describe("SteamMarketProvider", () => {
  it("lê o preço e o volume da resposta boa", async () => {
    steamResponde({
      success: true,
      lowest_price: "R$ 128,45",
      median_price: "R$ 126,70",
      volume: "523",
    });

    const r = await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preco.lowestPriceBrl).toBe(128.45);
      expect(r.preco.medianPriceBrl).toBe(126.7);
      expect(r.preco.volume).toBe(523);
      expect(r.preco.marketHashName).toBe("AK-47 | Redline (Field-Tested)");
    }
  });

  it("success=false vira SEM_ANUNCIO, e não erro fatal", async () => {
    // É a resposta para nome que não existe no mercado. Não é falha nossa
    // nem da rede, e o formulário não pode travar por causa dela.
    steamResponde({ success: false });
    const r = await SteamMarketProvider.buscar("Skin que não existe");
    expect(r).toMatchObject({ ok: false, motivo: "SEM_ANUNCIO" });
    if (!r.ok) expect(r.mensagem).toMatch(/preencha o preço à mão/i);
  });

  it("sem lowest_price cai na mediana", async () => {
    // Item de pouco giro tem histórico e nenhum anúncio aberto no instante.
    steamResponde({ success: true, median_price: "R$ 90,00" });
    const r = await SteamMarketProvider.buscar("Faca cara");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preco.lowestPriceBrl).toBe(90);
  });

  it("sem preço nenhum vira SEM_ANUNCIO", async () => {
    steamResponde({ success: true, volume: "3" });
    const r = await SteamMarketProvider.buscar("Faca sem anúncio");
    expect(r).toMatchObject({ ok: false, motivo: "SEM_ANUNCIO" });
  });

  it("429 vira LIMITE, com o que fazer na mensagem", async () => {
    steamResponde({}, 429);
    const r = await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");
    expect(r).toMatchObject({ ok: false, motivo: "LIMITE" });
    if (!r.ok) expect(r.mensagem).toMatch(/limitando/i);
  });

  it("outro status de erro vira FONTE_FORA e diz qual foi", async () => {
    steamResponde({}, 503);
    const r = await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");
    expect(r).toMatchObject({ ok: false, motivo: "FONTE_FORA" });
    if (!r.ok) expect(r.mensagem).toContain("503");
  });

  it("timeout vira TEMPO_ESGOTADO, e não exceção solta", async () => {
    vi.stubGlobal("fetch", async () => {
      const e = new Error("The operation was aborted due to timeout");
      e.name = "TimeoutError";
      throw e;
    });
    const r = await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");
    expect(r).toMatchObject({ ok: false, motivo: "TEMPO_ESGOTADO" });
  });

  it("rede caída vira FONTE_FORA, e não exceção solta", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const r = await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");
    expect(r).toMatchObject({ ok: false, motivo: "FONTE_FORA" });
  });

  it("corpo que não é JSON vira RESPOSTA_INVALIDA", async () => {
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token '<'");
      },
    }));
    const r = await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");
    expect(r).toMatchObject({ ok: false, motivo: "RESPOSTA_INVALIDA" });
  });
});

describe("o cache", () => {
  it("por padrão pede com revalidate, para não bombardear a Steam", async () => {
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 10,00" });
    await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");

    const opcoes = chamadas[0]?.[1];
    expect(opcoes?.next?.revalidate).toBe(CACHE_EM_SEGUNDOS);
    expect(opcoes?.cache).toBeUndefined();
  });

  it("forçar fura o cache, que é o botão Atualizar preço", async () => {
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 10,00" });
    await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)", {
      forcar: true,
    });

    const opcoes = chamadas[0]?.[1];
    expect(opcoes?.cache).toBe("no-store");
    expect(opcoes?.next).toBeUndefined();
  });

  it("a URL carrega o market_hash_name, que é a chave do cache", async () => {
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 10,00" });
    await SteamMarketProvider.buscar("AK-47 | Redline (Field-Tested)");

    const url = String(chamadas[0]?.[0]);
    expect(url).toContain("appid=730");
    expect(url).toContain("currency=7");
    expect(url).toContain(encodeURIComponent("AK-47 | Redline (Field-Tested)"));
  });
});

describe("precoDaSkinNoMercado", () => {
  it("monta o nome a partir da skin do banco, não do que a tela mandar", async () => {
    const chamadas = steamResponde({ success: true, lowest_price: "R$ 50,00" });
    await precoDaSkinNoMercado({
      skin: { name: "★ Karambit | Doppler Phase 2" },
      wear: "FACTORY_NEW",
    });

    const url = String(chamadas[0]?.[0]);
    // A fase saiu: a Steam não tem esse item.
    expect(decodeURIComponent(url)).toContain("★ Karambit | Doppler (Factory New)");
  });

  it("faca sem pintura tenta Factory New quando o nome pelado não existe", async () => {
    // O catálogo trata faca sem pintura como item sem desgaste; a Steam não.
    let chamada = 0;
    vi.stubGlobal("fetch", async () => {
      chamada += 1;
      return {
        ok: true,
        status: 200,
        json: async () =>
          chamada === 1
            ? { success: false }
            : { success: true, lowest_price: "R$ 700,00" },
      };
    });

    const r = await precoDaSkinNoMercado({
      skin: { name: "★ Bayonet" },
      wear: null,
    });
    expect(chamada).toBe(2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.preco.lowestPriceBrl).toBe(700);
  });

  it("não insiste quando a falha não é falta de anúncio", async () => {
    // Repetir uma consulta que levou 429 só afunda mais o limite.
    let chamada = 0;
    vi.stubGlobal("fetch", async () => {
      chamada += 1;
      return { ok: false, status: 429, json: async () => ({}) };
    });

    await precoDaSkinNoMercado({ skin: { name: "★ Bayonet" }, wear: null });
    expect(chamada).toBe(1);
  });
});
