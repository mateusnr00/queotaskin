import { describe, expect, it } from "vitest";

import { numeroDoBilhete } from "./raspadinhas";

describe("numeroDoBilhete", () => {
  it("preenche com zeros até seis dígitos", () => {
    expect(numeroDoBilhete(184)).toBe("000184");
    expect(numeroDoBilhete(1)).toBe("000001");
  });

  it("não corta quando o número já é grande", () => {
    // Cortar transformaria dois bilhetes diferentes no mesmo número impresso.
    expect(numeroDoBilhete(1234567)).toBe("1234567");
  });
});
