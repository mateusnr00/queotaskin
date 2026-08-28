import { describe, expect, it } from "vitest";

import { diaEmBrasilia } from "@/server/services/visitas";

describe("diaEmBrasilia", () => {
  it("um instante da manhã cai no próprio dia", () => {
    expect(diaEmBrasilia(new Date("2026-08-28T13:00:00Z")).toISOString()).toBe(
      "2026-08-28T00:00:00.000Z",
    );
  });

  it("depois das 21h em Brasília ainda é o mesmo dia, não o seguinte", () => {
    // 2026-08-29T01:00Z são 22h do dia 28 em Brasília (UTC-3).
    expect(diaEmBrasilia(new Date("2026-08-29T01:00:00Z")).toISOString()).toBe(
      "2026-08-28T00:00:00.000Z",
    );
  });

  it("de madrugada em Brasília já é o dia novo", () => {
    // 2026-08-28T04:00Z é 1h da manhã do dia 28 aqui.
    expect(diaEmBrasilia(new Date("2026-08-28T04:00:00Z")).toISOString()).toBe(
      "2026-08-28T00:00:00.000Z",
    );
  });

  it("a virada acontece à meia-noite daqui, e não à meia-noite UTC", () => {
    // 23h59 de Brasília do dia 28 = 02:59Z do dia 29.
    const antes = diaEmBrasilia(new Date("2026-08-29T02:59:00Z"));
    // 00h01 de Brasília do dia 29 = 03:01Z do dia 29.
    const depois = diaEmBrasilia(new Date("2026-08-29T03:01:00Z"));
    expect(antes.toISOString()).toBe("2026-08-28T00:00:00.000Z");
    expect(depois.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });
});
