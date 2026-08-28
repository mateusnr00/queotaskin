import { describe, expect, it } from "vitest";

import {
  PAISES,
  PAIS_PADRAO,
  formatarTelefone,
  paisPorIso,
  telefoneComPais,
  telefoneValido,
} from "./telefone";

describe("paisPorIso", () => {
  it("país desconhecido cai no padrão em vez de estourar", () => {
    // O ISO vem do banco, e conta antiga pode ter qualquer coisa ali depois
    // de uma importação. Devolver undefined faria a tela quebrar na hora de
    // ler o DDI.
    expect(paisPorIso("ZZ").iso).toBe(PAIS_PADRAO);
    expect(paisPorIso(null).iso).toBe(PAIS_PADRAO);
    expect(paisPorIso(undefined).iso).toBe(PAIS_PADRAO);
  });
});

describe("telefoneValido", () => {
  it("aceita celular e fixo brasileiros", () => {
    expect(telefoneValido("62998080613", "BR")).toBe(true);
    expect(telefoneValido("6232220000", "BR")).toBe(true);
  });

  it("recusa número brasileiro curto ou comprido demais", () => {
    expect(telefoneValido("629980806", "BR")).toBe(false);
    expect(telefoneValido("629980806131", "BR")).toBe(false);
  });

  it("cada país tem a própria faixa", () => {
    // Nove dígitos é válido em Portugal e curto no Brasil. Era o defeito que
    // o seletor existe para resolver: com a regra brasileira valendo para
    // todo mundo, o cliente de fora não conseguia concluir o cadastro.
    expect(telefoneValido("912345678", "PT")).toBe(true);
    expect(telefoneValido("912345678", "BR")).toBe(false);
  });

  it("a máscara não atrapalha a validação", () => {
    expect(telefoneValido("(62) 99808-0613", "BR")).toBe(true);
  });

  it('"outro país" aceita faixa larga, mas não qualquer coisa', () => {
    expect(telefoneValido("123456", "XX")).toBe(true);
    expect(telefoneValido("123456789012345", "XX")).toBe(true);
    expect(telefoneValido("12345", "XX")).toBe(false);
    expect(telefoneValido("1234567890123456", "XX")).toBe(false);
  });
});

describe("formatarTelefone", () => {
  it("aplica a máscara do país", () => {
    expect(formatarTelefone("62998080613", "BR")).toBe("(62) 99808-0613");
    expect(formatarTelefone("2125551234", "US")).toBe("(212) 555-1234");
    expect(formatarTelefone("912345678", "PT")).toBe("912 345 678");
  });

  it("formata parcial enquanto a pessoa digita", () => {
    expect(formatarTelefone("62", "BR")).toBe("(62");
    expect(formatarTelefone("6299", "BR")).toBe("(62) 99");
  });

  it("país sem máscara devolve os dígitos crus", () => {
    // Melhor sem enfeite do que com agrupamento inventado, que atrapalha
    // quem sabe o próprio número de cor.
    expect(formatarTelefone("1123456789", "AR")).toBe("1123456789");
  });

  it("dígito a mais não é engolido", () => {
    // Cortar em silêncio gravaria um número diferente do digitado.
    expect(formatarTelefone("629980806131", "BR")).toContain("1");
    expect(formatarTelefone("629980806131", "BR").replace(/\D/g, "")).toBe(
      "629980806131"
    );
  });
});

describe("telefoneComPais", () => {
  it("número do padrão não leva DDI: seria ruído para todo mundo", () => {
    expect(telefoneComPais("62998080613", "BR")).toBe("(62) 99808-0613");
  });

  it("número de fora leva o DDI, senão não dá para ligar", () => {
    expect(telefoneComPais("912345678", "PT")).toBe("+351 912 345 678");
  });

  it('"outro país" não inventa DDI', () => {
    expect(telefoneComPais("123456789", "XX")).toBe("123456789");
  });

  it("sem número, string vazia", () => {
    expect(telefoneComPais(null, "BR")).toBe("");
    expect(telefoneComPais("", "PT")).toBe("");
  });
});

describe("lista de países", () => {
  it("não tem ISO repetido, senão o seletor mostra dois iguais", () => {
    const isos = PAISES.map((p) => p.iso);
    expect(new Set(isos).size).toBe(isos.length);
  });

  it("toda faixa de dígitos é coerente", () => {
    for (const p of PAISES) {
      expect(p.digitos[0]).toBeLessThanOrEqual(p.digitos[1]);
      expect(p.digitos[0]).toBeGreaterThan(0);
    }
  });

  it("o padrão existe na lista", () => {
    expect(PAISES.some((p) => p.iso === PAIS_PADRAO)).toBe(true);
  });
});
