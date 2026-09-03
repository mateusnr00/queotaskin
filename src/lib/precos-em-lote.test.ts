import { describe, expect, it } from "vitest";

import {
  chaveDoNome,
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
      steam: { last_7d: null, last_30d: 980.5 },
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
    });
  });

  it("cai para 30 dias quando a de 7 não veio", () => {
    // Acontece com item de pouco giro, que é justamente a faca cara.
    const r = lerDespejoDoCsgotrader(despejo);
    const faca = r.find((x) => x.marketName.startsWith("★"));
    expect(faca).toMatchObject({ usd: 980.5, campo: "steam_last_30d" });
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

describe("lerNomeDeMercado", () => {
  it("separa o desgaste do nome", () => {
    expect(lerNomeDeMercado("AK-47 | Fire Serpent (Field-Tested)")).toEqual({
      base: "AK-47 | Fire Serpent",
      wear: "FIELD_TESTED",
      statTrak: false,
      souvenir: false,
    });
  });

  it("entende faca com estrela", () => {
    expect(lerNomeDeMercado("★ Karambit | Fade (Factory New)")).toEqual({
      base: "★ Karambit | Fade",
      wear: "FACTORY_NEW",
      statTrak: false,
      souvenir: false,
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
    });
    expect(lerNomeDeMercado("Souvenir AWP | Dragon Lore (Well-Worn)")).toEqual({
      base: "AWP | Dragon Lore",
      wear: "WELL_WORN",
      statTrak: false,
      souvenir: true,
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
