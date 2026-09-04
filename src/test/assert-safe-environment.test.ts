import { describe, expect, it } from "vitest";

import {
  assertSafeEnvironment,
  AmbienteInseguroError,
  SENTINELA_MARKER,
} from "./assert-safe-environment";

// A barreira é testada com env e leitor de sentinela INJETADOS: nenhum teste
// aqui abre conexão nem depende do banco real. É assim que se prova que ela
// bloqueia uma URL Supabase sem nunca tocar produção.

const LOCAL_OK = {
  NODE_ENV: "test",
  ALLOW_DESTRUCTIVE_TESTS: "true",
  DATABASE_URL: "postgresql://postgres@localhost:5433/queotaskin?schema=public",
};
const sentinelaBoa = () => SENTINELA_MARKER;

describe("barreira de isolamento — deixa passar só o ambiente comprovadamente local", () => {
  it("1. localhost + sentinela correta -> permite", () => {
    const d = assertSafeEnvironment({ env: LOCAL_OK, lerSentinela: sentinelaBoa });
    expect(d.host).toBe("localhost");
    expect(d.banco).toBe("queotaskin");
  });

  it("2. localhost sem sentinela -> bloqueia", () => {
    expect(() =>
      assertSafeEnvironment({ env: LOCAL_OK, lerSentinela: () => null }),
    ).toThrow(AmbienteInseguroError);
  });

  it("3. localhost com sentinela errada -> bloqueia", () => {
    expect(() =>
      assertSafeEnvironment({ env: LOCAL_OK, lerSentinela: () => "OUTRA_COISA" }),
    ).toThrow(/sentinela divergente/);
  });

  it("4. URL Supabase -> bloqueia ANTES de qualquer leitura", () => {
    let leu = false;
    expect(() =>
      assertSafeEnvironment({
        env: { ...LOCAL_OK, DATABASE_URL: "postgresql://u:p@db.abc.supabase.co:5432/postgres" },
        lerSentinela: () => { leu = true; return SENTINELA_MARKER; },
      }),
    ).toThrow(/produção/);
    expect(leu).toBe(false); // nunca conectou
  });

  it("5. hostname externo desconhecido -> bloqueia", () => {
    expect(() =>
      assertSafeEnvironment({
        env: { ...LOCAL_OK, DATABASE_URL: "postgresql://u:p@10.20.30.40:5432/queotaskin" },
        lerSentinela: sentinelaBoa,
      }),
    ).toThrow(/host não-local/);
  });

  it("6. ALLOW_DESTRUCTIVE_TESTS ausente -> bloqueia", () => {
    const { ALLOW_DESTRUCTIVE_TESTS, ...semOptIn } = LOCAL_OK;
    void ALLOW_DESTRUCTIVE_TESTS;
    expect(() =>
      assertSafeEnvironment({ env: semOptIn, lerSentinela: sentinelaBoa }),
    ).toThrow(/opt-in/);
  });

  it("7. nome de banco inesperado (postgres/production) -> bloqueia", () => {
    for (const db of ["postgres", "production", "defaultdb"]) {
      expect(() =>
        assertSafeEnvironment({
          env: { ...LOCAL_OK, DATABASE_URL: `postgresql://postgres@localhost:5433/${db}` },
          lerSentinela: sentinelaBoa,
        }),
      ).toThrow(/banco não permitido/);
    }
  });

  it("NODE_ENV != test -> bloqueia (camada 1)", () => {
    expect(() =>
      assertSafeEnvironment({ env: { ...LOCAL_OK, NODE_ENV: "production" }, lerSentinela: sentinelaBoa }),
    ).toThrow(/NODE_ENV/);
  });
});
