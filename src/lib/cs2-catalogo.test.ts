import { describe, expect, it } from "vitest";

import {
  chaveDeBusca,
  montarIndice,
  nomeDoItem,
  normalizar,
  procurar,
  type ItemDaApi,
} from "./cs2-catalogo";

const AK: ItemDaApi = {
  id: "skin-91a429af4a60",
  name: "AK-47 | Redline",
  image: "https://community.akamai.steamstatic.com/economy/image/abc",
  rarity: { id: "rarity_legendary_weapon", name: "Classified" },
  category: { name: "Rifles" },
  collections: [{ name: "The Huntsman Collection" }],
  wears: [{ name: "Field-Tested" }, { name: "Minimal Wear" }],
};

const KARAMBIT: ItemDaApi = {
  id: "skin-1",
  name: "★ Karambit | Doppler",
  phase: "Phase 2",
  rarity: { id: "rarity_ancient_weapon" },
  category: { name: "Knives" },
  wears: [{ name: "Factory New" }],
};

const LUVA: ItemDaApi = {
  id: "skin-2",
  name: "★ Sport Gloves | Pandora's Box",
  rarity: { id: "rarity_ancient" },
  category: { name: "Gloves" },
  wears: [{ name: "Field-Tested" }],
};

const FACA_LIMPA: ItemDaApi = {
  id: "skin-3",
  name: "★ Bayonet",
  rarity: { id: "rarity_ancient_weapon" },
  category: { name: "Knives" },
  wears: [],
};

const AGENTE: ItemDaApi = {
  id: "agent-4613",
  name: "Bloody Darryl The Strapped | The Professionals",
  rarity: { id: "rarity_legendary_character" },
  collections: [{ name: "Operation Riptide Agents" }],
};

describe("normalizar", () => {
  it("iguala o que a Steam escreve e o que a pessoa digita", () => {
    // Pela chave, e não pelo normalizado: "AK-47" vira "ak 47" e "ak47"
    // continua "ak47", então só sem os espaços os dois se encontram.
    expect(chaveDeBusca("AK-47 | Redline (Field-Tested)")).toBe(
      chaveDeBusca("ak47 redline field tested"),
    );
  });

  it("descarta a estrela da faca e o TM do StatTrak", () => {
    expect(normalizar("★ StatTrak™ Karambit | Fade")).toBe("karambit fade");
  });

  it("expande a abreviação de desgaste", () => {
    expect(normalizar("ak 47 redline ft")).toBe("ak 47 redline field tested");
    expect(normalizar("awp dragon lore bs")).toBe(
      "awp dragon lore battle scarred",
    );
  });

  it("tira acento", () => {
    expect(normalizar("Café")).toBe("cafe");
  });
});

describe("nomeDoItem", () => {
  it("põe o desgaste entre parênteses, como a Steam", () => {
    expect(nomeDoItem("AK-47 | Redline", "Field-Tested")).toBe(
      "AK-47 | Redline (Field-Tested)",
    );
  });

  it("acrescenta a fase quando existe", () => {
    expect(nomeDoItem("★ Karambit | Doppler", "Factory New", "Phase 2")).toBe(
      "★ Karambit | Doppler (Factory New) Phase 2",
    );
  });

  it("faca sem pintura não ganha parênteses", () => {
    expect(nomeDoItem("★ Bayonet", null)).toBe("★ Bayonet");
  });
});

describe("montarIndice", () => {
  const indice = montarIndice([AK, KARAMBIT, LUVA, FACA_LIMPA], [AGENTE]);

  it("gera uma linha por desgaste", () => {
    const doAk = indice.filter((l) => l.nome.startsWith("AK-47"));
    expect(doAk.map((l) => l.nome)).toEqual([
      "AK-47 | Redline (Field-Tested)",
      "AK-47 | Redline (Minimal Wear)",
    ]);
  });

  it("traduz raridade, inclusive a de luva e a de agente", () => {
    const porNome = new Map(indice.map((l) => [l.nome, l]));
    expect(porNome.get("AK-47 | Redline (Field-Tested)")?.raridade).toBe(
      "CLASSIFIED",
    );
    expect(
      porNome.get("★ Karambit | Doppler (Factory New) Phase 2")?.raridade,
    ).toBe("COVERT");
    expect(
      porNome.get("★ Sport Gloves | Pandora's Box (Field-Tested)")?.raridade,
    ).toBe("EXTRAORDINARY");
    // Superior é rosa no jogo, como Classified.
    expect(
      porNome.get("Bloody Darryl The Strapped | The Professionals")?.raridade,
    ).toBe("CLASSIFIED");
  });

  it("traduz desgaste para o enum", () => {
    const ft = indice.find((l) => l.nome === "AK-47 | Redline (Field-Tested)");
    expect(ft?.desgaste).toBe("FIELD_TESTED");
  });

  it("agente entra sem desgaste", () => {
    const a = indice.find((l) => l.categoria === "Agents");
    expect(a?.desgaste).toBeNull();
    expect(a?.nome).toBe("Bloody Darryl The Strapped | The Professionals");
  });

  it("faca sem pintura vira uma linha só", () => {
    expect(indice.filter((l) => l.nome === "★ Bayonet")).toHaveLength(1);
  });

  it("não produz nome repetido", () => {
    const nomes = indice.map((l) => l.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});

describe("procurar", () => {
  const indice = montarIndice([AK, KARAMBIT, LUVA, FACA_LIMPA], [AGENTE]);

  it("acha pelo nome exato da Steam", () => {
    expect(procurar("AK-47 | Redline (Field-Tested)", indice).exata?.nome).toBe(
      "AK-47 | Redline (Field-Tested)",
    );
  });

  it("acha digitado de qualquer jeito", () => {
    for (const termo of [
      "ak47 redline ft",
      "AK 47 Redline Field Tested",
      "ak-47 redline (field tested)",
    ]) {
      expect(procurar(termo, indice).exata?.nome).toBe(
        "AK-47 | Redline (Field-Tested)",
      );
    }
  });

  it("acha faca com fase, sem a estrela", () => {
    expect(procurar("karambit doppler factory new phase 2", indice).exata?.nome)
      .toBe("★ Karambit | Doppler (Factory New) Phase 2");
  });

  it("não achando, sugere em vez de errar calado", () => {
    const r = procurar("ak47 redline well worn", indice);
    expect(r.exata).toBeNull();
    expect(r.sugestoes.map((s) => s.nome)).toContain(
      "AK-47 | Redline (Field-Tested)",
    );
  });

  it("termo vazio não devolve nada", () => {
    expect(procurar("   ", indice)).toEqual({ exata: null, sugestoes: [] });
  });
});

describe("procurar: casos que a medição contra os dados reais revelou", () => {
  const indice = montarIndice(
    [
      AK,
      { ...AK, id: "x1", name: "M4A4 | Howl", rarity: { id: "rarity_contraband_weapon" }, wears: [{ name: "Well-Worn" }] },
      { ...AK, id: "x2", name: "M4A4 | Asiimov", wears: [{ name: "Battle-Scarred" }] },
      { ...AK, id: "x3", name: "M4A4 | Griffin", wears: [{ name: "Battle-Scarred" }] },
    ],
    [AGENTE],
  );

  it("prefixo único é acerto: agente sem o grupo depois da barra", () => {
    expect(procurar("bloody darryl the strapped", indice).exata?.nome).toBe(
      "Bloody Darryl The Strapped | The Professionals",
    );
  });

  it("prefixo repetido não vira acerto adivinhado", () => {
    // "ak47 redline" cabe em Field-Tested e Minimal Wear: escolher uma seria
    // inventar qual.
    expect(procurar("ak47 redline", indice).exata).toBeNull();
  });

  it("a palavra rara manda na sugestão", () => {
    // O Howl não existe em Battle-Scarred, o float dele para em 0,4. Antes
    // do peso, "m4a4 howl bs" sugeria Asiimov e Griffin, porque três
    // palavras comuns batiam mais que o único "howl".
    const r = procurar("m4a4 howl bs", indice);
    expect(r.exata).toBeNull();
    expect(r.sugestoes[0].nome).toContain("Howl");
  });
});

describe("procedência", () => {
  it("usa a coleção quando existe", () => {
    const [linha] = montarIndice([AK]);
    expect(linha.colecao).toBe("The Huntsman Collection");
  });

  it("cai para a caixa quando não há coleção, que é o caso das facas", () => {
    const [linha] = montarIndice([
      { ...KARAMBIT, collections: [], crates: [{ name: "Chroma Case" }] },
    ]);
    expect(linha.colecao).toBe("Chroma Case");
  });

  it("sem nenhum dos dois, fica nulo", () => {
    const [linha] = montarIndice([{ ...KARAMBIT, collections: [], crates: [] }]);
    expect(linha.colecao).toBeNull();
  });
});
