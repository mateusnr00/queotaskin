import { describe, expect, it } from "vitest";

import { semAcento } from "@/lib/busca";

describe("semAcento", () => {
  it("tira o acento e mantém a letra", () => {
    // O ponto da função: quem digita "sao" tem que achar "São".
    expect(semAcento("São Paulo")).toBe("sao paulo");
    expect(semAcento("Fúria")).toBe("furia");
    expect(semAcento("Ninjas in Pyjamas")).toBe("ninjas in pyjamas");
  });

  it("ignora caixa e espaço nas pontas", () => {
    expect(semAcento("  FURIA  ")).toBe("furia");
    expect(semAcento("MiBr")).toBe("mibr");
  });

  it("deixa passar o que não tem acento", () => {
    expect(semAcento("G2")).toBe("g2");
    expect(semAcento("")).toBe("");
    expect(semAcento("virtus.pro")).toBe("virtus.pro");
  });

  it("uma busca acha a outra nos dois sentidos", () => {
    // É a garantia que interessa na tela: digitar com ou sem acento leva ao
    // mesmo resultado.
    expect(semAcento("Águia").includes(semAcento("agui"))).toBe(true);
    expect(semAcento("aguia").includes(semAcento("Águi"))).toBe(true);
  });
});
