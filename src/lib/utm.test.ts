import { describe, expect, it } from "vitest";

import { marcasDaBusca } from "./utm";

describe("marcasDaBusca", () => {
  it("lê as três marcas da URL", () => {
    const b = new URLSearchParams(
      "utm_source=facebook&utm_medium=cpc&utm_campaign=ak-redline",
    );
    expect(marcasDaBusca(b)).toEqual({
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "ak-redline",
    });
  });

  it("o que não veio fica indefinido, e não vazio", () => {
    // String vazia no banco diria "veio de lugar nenhum"; indefinido diz
    // "não sei", que é a verdade.
    expect(marcasDaBusca(new URLSearchParams("utm_source=meta"))).toEqual({
      utmSource: "meta",
      utmMedium: undefined,
      utmCampaign: undefined,
    });
  });

  it("descarta espaço em branco", () => {
    expect(marcasDaBusca(new URLSearchParams("utm_source=%20%20")).utmSource)
      .toBeUndefined();
  });

  it("corta no tamanho da coluna", () => {
    const gigante = "x".repeat(500);
    const r = marcasDaBusca(new URLSearchParams(`utm_campaign=${gigante}`));
    expect(r.utmCampaign).toHaveLength(120);
  });
});
