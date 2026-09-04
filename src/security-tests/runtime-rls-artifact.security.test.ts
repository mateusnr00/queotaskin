// GATE-5.5: guarda de regressao para a resolucao de RLS do runtime.
//
// O estado de producao (RLS habilitada nas 63 tabelas pela event trigger nativa
// `ensure_rls` do Supabase, com zero policies) bloqueia `app_runtime` (sem
// BYPASSRLS) em toda tabela. A correcao auditada e conceder BYPASSRLS a
// app_runtime (preserva o column lockdown e a protecao da Data API por RLS).
//
// Este teste e ESTATICO: garante que os artefatos existem e ainda carregam as
// protecoes-chave, para que um refactor futuro nao remova silenciosamente a
// resolucao. A verificacao COMPORTAMENTAL contra o banco vive em
// prisma/roles/verify-runtime-rls.sql (rodada pelo operador pos-fix/pos-deploy).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const ler = (p: string) => readFileSync(join(RAIZ, p), "utf8");

describe("runtime RLS resolution (GATE-5.5) - artefatos e invariantes", () => {
  it("runtime-rls.sql aplica BYPASSRLS somente em app_runtime", () => {
    const sql = ler("prisma/roles/runtime-rls.sql");
    expect(sql).toMatch(/ALTER ROLE app_runtime BYPASSRLS/);
  });

  it("runtime-rls.sql NAO usa DISABLE ROW LEVEL SECURITY como abordagem ativa", () => {
    const sql = ler("prisma/roles/runtime-rls.sql");
    // so pode aparecer dentro de linha de comentario que a rejeita
    for (const linha of sql.split("\n")) {
      if (/DISABLE ROW LEVEL SECURITY/i.test(linha)) {
        expect(linha.trimStart().startsWith("--")).toBe(true);
      }
    }
  });

  it("runtime-rls.sql nao concede BYPASSRLS a anon/authenticated", () => {
    const sql = ler("prisma/roles/runtime-rls.sql");
    expect(sql).not.toMatch(/ALTER ROLE (anon|authenticated) BYPASSRLS/);
  });

  it("verify-runtime-rls.sql checa BYPASSRLS de app_runtime, lockdown de Payment.status e exposicao da Data API", () => {
    const sql = ler("prisma/roles/verify-runtime-rls.sql");
    expect(sql).toMatch(/app_runtime/);
    expect(sql).toMatch(/rolbypassrls/i);
    expect(sql).toMatch(/has_column_privilege\('app_runtime','"Payment"','status','UPDATE'\)/);
    expect(sql).toMatch(/anon/);
    expect(sql).toMatch(/authenticated/);
    // e fail-closed: aborta com RAISE quando uma invariante e violada
    expect(sql).toMatch(/RAISE EXCEPTION/);
  });
});
