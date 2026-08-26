import { describe, expect, it } from "vitest";

import { dataParaCsv, dinheiroParaCsv, gerarCsv } from "./csv";

/** Sem o BOM e sem o CRLF final, para conferir só o conteúdo. */
function linhas(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

describe("gerarCsv", () => {
  it("separa por ponto e vírgula, que é o que o Excel pt-BR espera", () => {
    const csv = gerarCsv(["Nome", "Valor"], [["Ana", "10,00"]]);
    expect(linhas(csv)).toEqual(["Nome;Valor", "Ana;10,00"]);
  });

  it("começa com BOM, senão acento vira caractere quebrado no Excel", () => {
    expect(gerarCsv(["Nome"], [["João"]]).startsWith("﻿")).toBe(true);
  });

  it("usa CRLF, que é o que a especificação define", () => {
    expect(gerarCsv(["A"], [["b"]])).toContain("\r\n");
  });

  it("protege o campo que contém o separador", () => {
    // Sem aspas, esse endereço deslocaria todas as colunas seguintes.
    const csv = gerarCsv(["Endereco"], [["Rua A; 100"]]);
    expect(linhas(csv)[1]).toBe('"Rua A; 100"');
  });

  it("dobra as aspas internas", () => {
    const csv = gerarCsv(["Nome"], [['Ana "A" Silva']]);
    expect(linhas(csv)[1]).toBe('"Ana ""A"" Silva"');
  });

  it("protege quebra de linha dentro da célula", () => {
    const csv = gerarCsv(["Obs"], [["linha1\nlinha2"]]);
    expect(csv).toContain('"linha1\nlinha2"');
  });

  it("neutraliza fórmula, que aqui é ataque e não formatação", () => {
    // O nome vem de campo público do site. Sem a aspa simples, abrir a
    // planilha executaria o conteúdo.
    for (const perigoso of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
      const csv = gerarCsv(["Nome"], [[perigoso]]);
      expect(linhas(csv)[1]).toBe(`'${perigoso}`);
    }
  });

  it("nome comum não ganha aspa simples à toa", () => {
    expect(linhas(gerarCsv(["Nome"], [["Ana Silva"]]))[1]).toBe("Ana Silva");
  });

  it("vazio e nulo viram célula vazia, não a palavra null", () => {
    const csv = gerarCsv(["A", "B", "C"], [[null, undefined, ""]]);
    expect(linhas(csv)[1]).toBe(";;");
  });

  it("sem linhas, sai só o cabeçalho", () => {
    expect(linhas(gerarCsv(["Nome", "CPF"], []))).toEqual(["Nome;CPF"]);
  });
});

describe("dinheiroParaCsv", () => {
  it("usa vírgula decimal e não divide por cem", () => {
    // totalAmount já vem em reais. Dividir mostraria a base cem vezes menor.
    expect(dinheiroParaCsv(1234.5)).toBe("1234,50");
    expect(dinheiroParaCsv(0)).toBe("0,00");
    expect(dinheiroParaCsv(1.5)).toBe("1,50");
  });

  it("não leva R$, senão o Excel trata como texto e não soma a coluna", () => {
    expect(dinheiroParaCsv(10)).not.toContain("R$");
  });
});

describe("dataParaCsv", () => {
  it("sai no formato brasileiro", () => {
    const texto = dataParaCsv(new Date("2026-08-26T14:30:00Z"));
    expect(texto).toMatch(/^\d{2}\/\d{2}\/\d{4}/);
  });

  it("nulo vira vazio, não Invalid Date", () => {
    expect(dataParaCsv(null)).toBe("");
  });
});
