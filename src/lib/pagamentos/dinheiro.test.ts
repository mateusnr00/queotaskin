import { describe, expect, it } from "vitest";
import { normalizeBRLToCents } from "./dinheiro";

describe("normalizeBRLToCents - dinheiro em centavos inteiros", () => {
  it("converte reais válidos", () => {
    expect(normalizeBRLToCents(50)).toEqual({ ok: true, centavos: 5000 });
    expect(normalizeBRLToCents(100.01)).toEqual({ ok: true, centavos: 10001 });
    expect(normalizeBRLToCents(0.01)).toEqual({ ok: true, centavos: 1 });
  });
  it("recusa não-number", () => {
    for (const v of ["100", "100.00", null, undefined, {}, [], true]) {
      expect(normalizeBRLToCents(v as unknown).ok).toBe(false);
    }
  });
  it("recusa não-finito e negativo", () => {
    for (const v of [NaN, Infinity, -Infinity, -100, -0.01]) {
      expect(normalizeBRLToCents(v).ok).toBe(false);
    }
  });
});
