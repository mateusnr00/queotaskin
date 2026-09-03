import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buscarPrecoNaSteam,
  ehSemPintura,
  nomeDeMercado,
  precoEmReais,
  precoPorNumero,
  SteamLimitouError,
} from "./steam-market";

describe("nomeDeMercado", () => {
  it("tira a fase da Doppler, que não existe no nome de mercado da Steam", () => {
    // Este era o bug: o painel perguntava por um item inexistente, recebia
    // "não tenho anúncio", e a cota nascia em R$ 1,00. Eram 182 das 865 skins
    // do catálogo.
    expect(
      nomeDeMercado({ name: "★ Stiletto Knife | Doppler Phase 1" }, "FACTORY_NEW"),
    ).toBe("★ Stiletto Knife | Doppler (Factory New)");
    expect(
      nomeDeMercado({ name: "★ Bowie Knife | Gamma Doppler Emerald" }, "MINIMAL_WEAR"),
    ).toBe("★ Bowie Knife | Gamma Doppler (Minimal Wear)");
  });

  it("a fase sai antes do StatTrak entrar, e a estrela continua na frente", () => {
    expect(
      nomeDeMercado(
        { name: "★ Karambit | Doppler Ruby", skinStatTrak: true },
        "FACTORY_NEW",
      ),
    ).toBe("★ StatTrak™ Karambit | Doppler (Factory New)");
  });

  it("nome que termina em palavra de fase sem ser Doppler fica inteiro", () => {
    expect(nomeDeMercado({ name: "AK-47 | Emerald Pinstripe" }, "FIELD_TESTED")).toBe(
      "AK-47 | Emerald Pinstripe (Field-Tested)",
    );
  });

  it("gruda o desgaste no nome do catálogo", () => {
    expect(nomeDeMercado({ name: "AK-47 | Redline" }, "FIELD_TESTED")).toBe(
      "AK-47 | Redline (Field-Tested)",
    );
  });

  it("deixa sem desgaste quem não tem, como o agente", () => {
    expect(
      nomeDeMercado({ name: "'Blueberries' Buckshot | NSWC SEAL" }, null),
    ).toBe("'Blueberries' Buckshot | NSWC SEAL");
  });

  it("põe o StatTrak depois da estrela, e não antes", () => {
    // Na Steam é "★ StatTrak™ Karambit", nunca "StatTrak™ ★ Karambit".
    expect(
      nomeDeMercado(
        { name: "★ Karambit | Doppler", skinStatTrak: true },
        "FACTORY_NEW",
      ),
    ).toBe("★ StatTrak™ Karambit | Doppler (Factory New)");
  });

  it("põe o StatTrak na frente quando não há estrela", () => {
    expect(
      nomeDeMercado({ name: "AK-47 | Redline", skinStatTrak: true }, "MINIMAL_WEAR"),
    ).toBe("StatTrak™ AK-47 | Redline (Minimal Wear)");
  });

  it("põe Souvenir na frente de tudo", () => {
    expect(
      nomeDeMercado({ name: "AWP | Dragon Lore", skinSouvenir: true }, "FACTORY_NEW"),
    ).toBe("Souvenir AWP | Dragon Lore (Factory New)");
  });

  it("preserva a estrela que o catálogo já traz", () => {
    expect(nomeDeMercado({ name: "★ Bayonet | Autotronic" }, "WELL_WORN")).toBe(
      "★ Bayonet | Autotronic (Well-Worn)",
    );
  });
});

describe("precoEmReais", () => {
  it("lê o formato brasileiro, com ponto de milhar", () => {
    // Confundir o ponto de milhar com decimal transforma 1.234,56 em 1,23.
    expect(precoEmReais("R$ 1.234,56")).toBe(1234.56);
    expect(precoEmReais("R$ 42,50")).toBe(42.5);
    expect(precoEmReais("R$ 12.345.678,90")).toBe(12345678.9);
  });

  it("aguenta o espaço não separável que a Steam manda", () => {
    expect(precoEmReais("R$ 1.999,99")).toBe(1999.99);
  });

  it("devolve null para vazio, zero e lixo", () => {
    expect(precoEmReais(undefined)).toBeNull();
    expect(precoEmReais(null)).toBeNull();
    expect(precoEmReais("")).toBeNull();
    expect(precoEmReais("R$ 0,00")).toBeNull();
    expect(precoEmReais("sem preço")).toBeNull();
  });
});

describe("precoPorNumero", () => {
  it("divide o valor da skin pela quantidade de números", () => {
    expect(precoPorNumero(500, 100)).toBe(5);
    expect(precoPorNumero(1000, 200)).toBe(5);
  });

  it("arredonda o centavo para cima, para a rifa não nascer no prejuízo", () => {
    // 1234.56 / 100 = 12.3456. Para baixo, cem números arrecadariam
    // R$ 1.234,00 por uma skin de R$ 1.234,56.
    expect(precoPorNumero(1234.56, 100)).toBe(12.35);
    expect(precoPorNumero(10, 3)).toBe(3.34);
  });

  it("devolve null quando não dá para dividir", () => {
    expect(precoPorNumero(0, 100)).toBeNull();
    expect(precoPorNumero(500, 0)).toBeNull();
    expect(precoPorNumero(-5, 100)).toBeNull();
  });
});

describe("ehSemPintura", () => {
  it("reconhece faca e luva sem pintura", () => {
    expect(ehSemPintura("★ Bayonet")).toBe(true);
    expect(ehSemPintura("★ Bayonet | Autotronic")).toBe(false);
    expect(ehSemPintura("AK-47 | Redline")).toBe(false);
  });
});

describe("buscarPrecoNaSteam", () => {
  afterEach(() => vi.unstubAllGlobals());

  function respondeCom(porNome: Record<string, unknown>, status = 200) {
    const pedidos: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      const nome = decodeURIComponent(
        new URL(url).searchParams.get("market_hash_name") ?? "",
      );
      pedidos.push(nome);
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => porNome[nome] ?? { success: false },
      } as unknown as Response;
    });
    return pedidos;
  }

  it("prefere a mediana ao menor preço", async () => {
    // O menor é um anúncio só, que qualquer um derruba ou levanta sozinho.
    respondeCom({
      "AK-47 | Redline (Field-Tested)": {
        success: true,
        lowest_price: "R$ 40,00",
        median_price: "R$ 45,10",
        volume: "1.234",
      },
    });
    const r = await buscarPrecoNaSteam({ name: "AK-47 | Redline" }, "FIELD_TESTED");
    expect(r).toEqual({
      brl: 45.1,
      nomeConsultado: "AK-47 | Redline (Field-Tested)",
      volume: 1234,
      usouMenorPreco: false,
    });
  });

  it("cai no menor preço quando não há mediana", async () => {
    respondeCom({
      "AWP | Dragon Lore (Factory New)": {
        success: true,
        lowest_price: "R$ 98.000,00",
      },
    });
    const r = await buscarPrecoNaSteam({ name: "AWP | Dragon Lore" }, "FACTORY_NEW");
    expect(r!.brl).toBe(98000);
    expect(r!.usouMenorPreco).toBe(true);
  });

  it("tenta Factory New para faca sem pintura, que na Steam tem desgaste", async () => {
    // O catálogo trata "★ Bayonet" como item sem desgaste. A Steam não.
    const pedidos = respondeCom({
      "★ Bayonet (Factory New)": { success: true, median_price: "R$ 2.100,00" },
    });
    const r = await buscarPrecoNaSteam({ name: "★ Bayonet" }, null);
    expect(pedidos).toEqual(["★ Bayonet", "★ Bayonet (Factory New)"]);
    expect(r!.brl).toBe(2100);
  });

  it("não tenta duas vezes para um agente, que realmente não tem desgaste", async () => {
    const pedidos = respondeCom({});
    const r = await buscarPrecoNaSteam(
      { name: "'Blueberries' Buckshot | NSWC SEAL" },
      null,
    );
    expect(pedidos).toHaveLength(1);
    expect(r).toBeNull();
  });

  it("devolve null para item que não está à venda", async () => {
    respondeCom({});
    expect(
      await buscarPrecoNaSteam({ name: "AK-47 | Redline" }, "FACTORY_NEW"),
    ).toBeNull();
  });

  it("levanta um erro próprio no 429, para a tela poder pedir para esperar", async () => {
    respondeCom({}, 429);
    await expect(
      buscarPrecoNaSteam({ name: "AK-47 | Redline" }, "FIELD_TESTED"),
    ).rejects.toBeInstanceOf(SteamLimitouError);
  });
});
