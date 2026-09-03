import { describe, expect, it } from "vitest";

import {
  chaveDoNome,
  fontesDeDespejo,
  lerDespejoDoCsgobackpack,
  lerDespejoDoCsgotrader,
  lerNomeDeMercado,
} from "./precos-em-lote";

describe("lerDespejoDoCsgotrader", () => {
  const despejo = {
    "AK-47 | Redline (Field-Tested)": {
      steam: { last_24h: 13.1, last_7d: 12.7, last_30d: 12.5, last_90d: 12.2 },
      buff163: { starting_at: { price: 10.2 } },
      skinport: { starting_at: 11.9 },
    },
    "★ Karambit | Doppler (Factory New)": {
      steam: {
        last_7d: null,
        last_30d: 980.5,
        doppler: { "Phase 1": 1120.4, Ruby: 2890, "Phase 3": null },
      },
    },
    "Item sem Steam": { buff163: { starting_at: { price: 3 } } },
    "Item com preço zerado": { steam: { last_7d: 0, last_30d: 0 } },
  };

  it("fica com a janela de 7 dias, que é a régua escolhida", () => {
    const r = lerDespejoDoCsgotrader(despejo);
    const ak = r.find((x) => x.marketName.startsWith("AK-47"));
    expect(ak).toEqual({
      marketName: "AK-47 | Redline (Field-Tested)",
      usd: 12.7,
      campo: "steam_last_7d",
      volume: null,
      fase: null,
    });
  });

  it("cai para 30 dias quando a de 7 não veio", () => {
    // Acontece com item de pouco giro, que é justamente a faca cara.
    const r = lerDespejoDoCsgotrader(despejo);
    const faca = r.find((x) => x.marketName.startsWith("★") && !x.fase);
    expect(faca).toMatchObject({ usd: 980.5, campo: "steam_last_30d" });
  });

  it("separa as fases da Doppler em linhas próprias", () => {
    // Na Steam a Ruby e a Phase 4 moram na mesma linha e a diferença só
    // aparece na inspeção. Um quinto do catálogo daqui é skin de fase, então
    // herdar o preço da faixa toda seria errar em 182 skins.
    const r = lerDespejoDoCsgotrader(despejo);
    const fases = r.filter((x) => x.fase);
    expect(fases).toHaveLength(2);
    expect(fases).toContainEqual({
      marketName: "★ Karambit | Doppler (Factory New)",
      usd: 1120.4,
      campo: "steam_doppler",
      volume: null,
      fase: "Phase 1",
    });
    expect(fases.find((x) => x.fase === "Ruby")?.usd).toBe(2890);
    // Fase sem preço não vira linha: preço nenhum é melhor que preço zero.
    expect(fases.some((x) => x.fase === "Phase 3")).toBe(false);
  });

  it("ignora item sem bloco da Steam", () => {
    // O despejo traz Buff e Skinport junto. Misturar mercado com mercado daria
    // um número que não é de lugar nenhum.
    const r = lerDespejoDoCsgotrader(despejo);
    expect(r.some((x) => x.marketName === "Item sem Steam")).toBe(false);
  });

  it("ignora preço zerado", () => {
    const r = lerDespejoDoCsgotrader(despejo);
    expect(r.some((x) => x.marketName === "Item com preço zerado")).toBe(false);
  });

  it("aguenta resposta fora do formato sem quebrar", () => {
    expect(lerDespejoDoCsgotrader(null)).toEqual([]);
    expect(lerDespejoDoCsgotrader([1, 2, 3])).toEqual([]);
    expect(lerDespejoDoCsgotrader("texto")).toEqual([]);
  });
});

describe("lerDespejoDoCsgobackpack", () => {
  const despejo = {
    success: true,
    items_list: {
      "AWP | Asiimov (Field-Tested)": {
        price: {
          "24_hours": { average: 60.2, median: 59.9, sold: "412" },
          "7_days": { average: 58.4, median: 57.8, sold: "2901" },
          "30_days": { average: 57, median: 56.5, sold: "11002" },
        },
      },
      "Item só com histórico velho": {
        price: { all_time: { average: 9.5, median: 9.1 } },
      },
      "Item sem preço": { price: {} },
    },
  };

  it("prefere a mediana de 7 dias e guarda o volume", () => {
    const r = lerDespejoDoCsgobackpack(despejo);
    expect(r.find((x) => x.marketName.startsWith("AWP"))).toEqual({
      marketName: "AWP | Asiimov (Field-Tested)",
      usd: 57.8,
      campo: "backpack_7_days",
      volume: 2901,
      fase: null,
    });
  });

  it("cai para as janelas seguintes na ordem", () => {
    const r = lerDespejoDoCsgobackpack(despejo);
    expect(r.find((x) => x.marketName.startsWith("Item só"))).toMatchObject({
      usd: 9.1,
      campo: "backpack_all_time",
    });
  });

  it("ignora item sem preço nenhum", () => {
    const r = lerDespejoDoCsgobackpack(despejo);
    expect(r.some((x) => x.marketName === "Item sem preço")).toBe(false);
  });

  it("aguenta resposta fora do formato sem quebrar", () => {
    expect(lerDespejoDoCsgobackpack(null)).toEqual([]);
    expect(lerDespejoDoCsgobackpack({ success: false })).toEqual([]);
    expect(lerDespejoDoCsgobackpack({ items_list: [1, 2] })).toEqual([]);
  });
});

describe("fontesDeDespejo", () => {
  it("tenta mais de uma, porque fonte gratuita sai do ar", () => {
    // Foi exatamente o que aconteceu: a única fonte respondeu 200 com uma
    // página HTML e o recurso inteiro parou.
    expect(fontesDeDespejo().length).toBeGreaterThan(1);
  });

  it("o endereço do ambiente entra na frente de todos", () => {
    // A válvula para trocar de fonte sem esperar deploy de código.
    const fontes = fontesDeDespejo("https://exemplo.test/precos.json");
    expect(fontes[0]?.url).toBe("https://exemplo.test/precos.json");
    expect(fontes.length).toBe(fontesDeDespejo().length + 1);
  });

  it("endereço em branco não vira fonte", () => {
    expect(fontesDeDespejo("   ").length).toBe(fontesDeDespejo().length);
  });
});

describe("lerNomeDeMercado", () => {
  it("separa o desgaste do nome", () => {
    expect(lerNomeDeMercado("AK-47 | Fire Serpent (Field-Tested)")).toEqual({
      base: "AK-47 | Fire Serpent",
      wear: "FIELD_TESTED",
      statTrak: false,
      souvenir: false,
      fase: null,
    });
  });

  it("entende faca com estrela", () => {
    expect(lerNomeDeMercado("★ Karambit | Fade (Factory New)")).toEqual({
      base: "★ Karambit | Fade",
      wear: "FACTORY_NEW",
      statTrak: false,
      souvenir: false,
      fase: null,
    });
  });

  it("tira StatTrak e Souvenir do nome e devolve como marca", () => {
    // No catálogo os dois são coluna, não parte do texto: um StatTrak casando
    // com a linha comum daria o preço errado, e ele é bem mais caro.
    expect(lerNomeDeMercado("StatTrak™ AK-47 | Redline (Minimal Wear)")).toEqual({
      base: "AK-47 | Redline",
      wear: "MINIMAL_WEAR",
      statTrak: true,
      souvenir: false,
      fase: null,
    });
    expect(lerNomeDeMercado("Souvenir AWP | Dragon Lore (Well-Worn)")).toEqual({
      base: "AWP | Dragon Lore",
      wear: "WELL_WORN",
      statTrak: false,
      souvenir: true,
      fase: null,
    });
  });

  it("tira a fase do nome, que é como o catálogo daqui escreve", () => {
    // O catálogo tem "★ Bowie Knife | Gamma Doppler Emerald"; a Steam tem
    // "★ Bowie Knife | Gamma Doppler". Sem separar, nenhuma das 182 skins de
    // fase acharia preço.
    expect(lerNomeDeMercado("★ Stiletto Knife | Doppler Phase 1")).toMatchObject({
      base: "★ Stiletto Knife | Doppler",
      fase: "Phase 1",
    });
    expect(
      lerNomeDeMercado("★ Bowie Knife | Gamma Doppler Emerald"),
    ).toMatchObject({
      base: "★ Bowie Knife | Gamma Doppler",
      fase: "Emerald",
    });
    expect(
      lerNomeDeMercado("★ Karambit | Doppler Black Pearl (Factory New)"),
    ).toMatchObject({
      base: "★ Karambit | Doppler",
      wear: "FACTORY_NEW",
      fase: "Black Pearl",
    });
  });

  it("só tira a fase de skin que é Doppler", () => {
    // A trava existe para o nome que termina em palavra de fase por acaso não
    // perder a última palavra e deixar de casar com coisa nenhuma.
    expect(lerNomeDeMercado("AK-47 | Emerald Pinstripe")).toMatchObject({
      base: "AK-47 | Emerald Pinstripe",
      fase: null,
    });
    expect(lerNomeDeMercado("Glock-18 | Ruby")).toMatchObject({
      base: "Glock-18 | Ruby",
      fase: null,
    });
  });

  it("parêntese que não é desgaste continua no nome", () => {
    // Cortar todo parêntese final quebraria o nome de meio catálogo de
    // adesivos.
    expect(lerNomeDeMercado("Sweet Dreams (Holo)")?.base).toBe(
      "Sweet Dreams (Holo)",
    );
  });

  it("devolve nulo para nome vazio", () => {
    expect(lerNomeDeMercado("   ")).toBeNull();
  });
});

describe("chaveDoNome", () => {
  it("compara sem caixa e sem espaço sobrando", () => {
    expect(chaveDoNome("  AK-47 |  Redline ")).toBe(
      chaveDoNome("ak-47 | redline"),
    );
  });
});
