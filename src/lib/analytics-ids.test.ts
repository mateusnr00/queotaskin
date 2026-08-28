import { describe, expect, it } from "vitest";

import { conferirId, extrairId, pareceScript } from "./analytics-ids";

const SCRIPT_GA = `<!-- Google tag (gtag.js) --> <script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC1234567"></script> <script> window.dataLayer = window.dataLayer || [];</script>`;

describe("conferirId", () => {
  it("aceita id válido de cada provedor", () => {
    expect(conferirId("626989286873174", "meta").ok).toBe(true);
    expect(conferirId("G-ABC1234567", "ga4").ok).toBe(true);
    expect(conferirId("CQWERTYUIOPASDFGH", "tiktok").ok).toBe(true);
  });

  // Vazio é como se desliga o rastreamento, e não pode virar erro.
  it("aceita vazio", () => {
    expect(conferirId("", "meta")).toEqual({ ok: true, valor: "" });
    expect(conferirId("   ", "ga4")).toEqual({ ok: true, valor: "" });
  });

  it("tira espaço em volta", () => {
    expect(conferirId("  G-ABC1234567 ", "ga4").valor).toBe("G-ABC1234567");
  });

  // O erro que motivou este arquivo: o campo se chama ID e aceita o bloco
  // inteiro, salva, e o rastreamento fica inerte sem avisar ninguém.
  it("recusa o bloco de instalação e aponta o id de dentro dele", () => {
    const r = conferirId(SCRIPT_GA, "ga4");
    expect(r.ok).toBe(false);
    expect(r.valor).toBe("G-ABC1234567");
    expect(r.erro).toContain("bloco de instalação");
  });

  it("recusa o bloco quando não acha id dentro", () => {
    const r = conferirId("<script>alguma coisa</script>", "ga4");
    expect(r.ok).toBe(false);
    expect(r.valor).toBe("");
  });

  it("recusa formato que não é de nenhum provedor", () => {
    expect(conferirId("abc", "meta").ok).toBe(false);
    expect(conferirId("123", "ga4").ok).toBe(false);
    // Id da Meta no campo do GA4 continua sendo erro.
    expect(conferirId("626989286873174", "ga4").ok).toBe(false);
  });
});

describe("pareceScript", () => {
  it("reconhece bloco de instalação", () => {
    expect(pareceScript(SCRIPT_GA)).toBe(true);
    expect(pareceScript("fbq('init','123')")).toBe(true);
    expect(pareceScript("ttq.load('X')")).toBe(true);
  });

  it("não confunde id com script", () => {
    expect(pareceScript("G-ABC1234567")).toBe(false);
    expect(pareceScript("626989286873174")).toBe(false);
  });
});

describe("extrairId", () => {
  it("acha o id dentro do bloco de cada provedor", () => {
    expect(extrairId(SCRIPT_GA, "ga4")).toBe("G-ABC1234567");
    expect(extrairId(`fbq('init','626989286873174');`, "meta")).toBe(
      "626989286873174",
    );
    expect(extrairId(`ttq.load('CQWERTYUIOPASDFGH');`, "tiktok")).toBe(
      "CQWERTYUIOPASDFGH",
    );
  });

  it("devolve null quando não há id", () => {
    expect(extrairId("<script></script>", "ga4")).toBeNull();
  });
});
