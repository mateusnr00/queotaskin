import { describe, expect, it } from "vitest";

import {
  MAX_DIAS_PERIODO,
  diasEntre,
  limitarIntervalo,
  escolherGranularidade,
  periodoAnterior,
  variacaoPercentual,
  chaveDoBucket,
} from "./periodo";

describe("diasEntre", () => {
  it("conta os dias inteiros entre duas datas", () => {
    expect(
      diasEntre(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-31T00:00:00Z")),
    ).toBe(30);
  });

  it("o mesmo dia é zero", () => {
    const d = new Date("2026-08-10T09:00:00Z");
    expect(diasEntre(d, d)).toBe(0);
  });
});

describe("limitarIntervalo", () => {
  it("mantém um intervalo dentro do teto", () => {
    const from = new Date("2026-08-01T00:00:00Z");
    const to = new Date("2026-08-20T00:00:00Z");
    const r = limitarIntervalo(from, to);
    expect(r.from).toEqual(from);
    expect(r.to).toEqual(to);
  });

  it("encolhe o começo quando passa de 180 dias, preservando o fim", () => {
    const from = new Date("2025-01-01T00:00:00Z");
    const to = new Date("2026-08-30T00:00:00Z");
    const r = limitarIntervalo(from, to);
    expect(r.to).toEqual(to);
    expect(diasEntre(r.from, r.to)).toBe(MAX_DIAS_PERIODO);
  });

  it("o teto é 180 dias", () => {
    expect(MAX_DIAS_PERIODO).toBe(180);
  });
});

describe("escolherGranularidade", () => {
  it("períodos curtos vão por dia", () => {
    const from = new Date("2026-08-01T00:00:00Z");
    const to = new Date("2026-08-30T00:00:00Z"); // 29 dias
    expect(escolherGranularidade(from, to)).toBe("dia");
  });

  it("períodos médios vão por semana", () => {
    const from = new Date("2026-05-01T00:00:00Z");
    const to = new Date("2026-08-01T00:00:00Z"); // ~92 dias
    expect(escolherGranularidade(from, to)).toBe("semana");
  });

  it("períodos longos vão por mês", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const to = new Date("2026-08-01T00:00:00Z"); // ~180 dias
    expect(escolherGranularidade(from, to)).toBe("mes");
  });
});

describe("periodoAnterior", () => {
  it("devolve a janela de mesmo tamanho imediatamente antes", () => {
    const from = new Date("2026-08-01T00:00:00.000Z");
    const to = new Date("2026-08-31T00:00:00.000Z");
    const r = periodoAnterior(from, to);
    // termina 1ms antes do começo do período atual
    expect(r.to).toEqual(new Date(from.getTime() - 1));
    // mesma duração
    expect(r.to.getTime() - r.from.getTime()).toBe(to.getTime() - from.getTime());
  });
});

describe("variacaoPercentual", () => {
  it("calcula a variação arredondada", () => {
    expect(variacaoPercentual(120, 100)).toBe(20);
    expect(variacaoPercentual(80, 100)).toBe(-20);
  });

  it("anterior zero não divide por zero: devolve null", () => {
    expect(variacaoPercentual(50, 0)).toBeNull();
    expect(variacaoPercentual(0, 0)).toBeNull();
  });
});

describe("chaveDoBucket", () => {
  const d = new Date("2026-08-12T15:30:00Z"); // quarta-feira

  it("por dia usa a data ISO", () => {
    expect(chaveDoBucket(d, "dia")).toBe("2026-08-12");
  });

  it("por semana ancora na segunda-feira ISO", () => {
    // 2026-08-12 é quarta; a segunda da semana é 2026-08-10
    expect(chaveDoBucket(d, "semana")).toBe("2026-08-10");
  });

  it("por mês usa ano-mês", () => {
    expect(chaveDoBucket(d, "mes")).toBe("2026-08");
  });
});
