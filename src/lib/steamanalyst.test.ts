import { describe, expect, it } from "vitest";

import {
  chaveDoNome,
  lerNomeDeMercado,
  precoDoItem,
} from "./steamanalyst";

// Os quatro exemplos são os da documentação da SteamAnalyst, copiados com os
// campos que a gente lê. Testar contra eles é o que garante que a escolha do
// preço segue o que eles mesmos recomendam, e não o que parecia certo aqui.

describe("precoDoItem", () => {
  it("item comum usa a média de 7 dias", () => {
    // A documentação é explícita: "Use this value for your CS:GO project".
    const r = precoDoItem({
      market_name: "AK-47 | Fire Serpent (Field-Tested)",
      avg_price_7_days_raw: 193.24617,
      avg_daily_volume: "12",
      ongoing_price_manipulation: "0",
    });
    expect(r).toEqual({ usd: 193.24617, campo: "avg_price_7_days", volume: 12 });
  });

  it("item raro usa o mínimo sugerido, não o máximo", () => {
    // O máximo representa padrão e phase de alto valor, que a skin sorteada
    // quase nunca é. Usar o máximo inflaria o preço da cota.
    const r = precoDoItem({
      market_name: "★ Karambit | Fade (Factory New)",
      suggested_amount_avg_raw: 583.75,
      suggested_amount_min_raw: 567.5,
      avg_daily_volume: "3",
      ongoing_price_manipulation: "0",
    });
    expect(r).toEqual({
      usd: 567.5,
      campo: "suggested_amount_min",
      volume: 3,
    });
  });

  it("com manipulação em curso, usa o preço seguro", () => {
    // Nesse caso a própria API para de mandar a média de 7 dias.
    const r = precoDoItem({
      market_name: "XM1014 | Jungle (Well-Worn)",
      safe_price_raw: 0.58323,
      avg_daily_volume: 8,
      ongoing_price_manipulation: "1",
    });
    expect(r).toEqual({ usd: 0.58323, campo: "safe_price", volume: 8 });
  });

  it("item suspeito não entra no catálogo", () => {
    // Preço fora da curva vira preço de cota errado, e cota errada é dinheiro
    // real. Melhor não ter valor e a pessoa digitar.
    expect(
      precoDoItem({
        market_name: "AWP | Dragon Lore (Battle-Scarred)",
        avg_price_7_days_raw: 12000,
        suspicious: "1",
      }),
    ).toBeNull();
  });

  it("ignora o preço atual, mesmo quando é o único que veio", () => {
    // current_price é o anúncio mais barato do momento. A documentação manda
    // não usar, e aqui ele nem é lido.
    expect(
      precoDoItem({
        market_name: "Item sem histórico",
        ongoing_price_manipulation: "0",
      }),
    ).toBeNull();
  });

  it("recusa valor zerado ou ilegível", () => {
    expect(precoDoItem({ avg_price_7_days_raw: 0 })).toBeNull();
    expect(precoDoItem({ avg_price_7_days_raw: "abc" })).toBeNull();
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

  it("item sem desgaste fica com o nome inteiro", () => {
    expect(lerNomeDeMercado("Sticker | Titan (Holo) | Katowice 2014")).toEqual({
      base: "Sticker | Titan (Holo) | Katowice 2014",
      wear: null,
      statTrak: false,
      souvenir: false,
    });
  });

  it("parêntese que não é desgaste continua no nome", () => {
    // "Holo" está entre parênteses e não é acabamento: cortar ali quebraria o
    // nome de meio catálogo de adesivos.
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
    expect(chaveDoNome("  AK-47 |  Redline ")).toBe(chaveDoNome("ak-47 | redline"));
  });
});
