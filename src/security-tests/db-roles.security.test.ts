// P1-C INFRA-1/2/3/15 - separacao de privilegios do Postgres, provada em
// scratch. Usa SET ROLE app_runtime (o superuser assume os privilegios da role
// nao-superuser, entao as checagens de permissao valem).
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = "postgresql://postgres@localhost:5433";
const DB = "queota_roles_check";
const habilitado = (() => {
  try { execFileSync("psql", [`${BASE}/postgres`, "-tAc", "SELECT 1"], { stdio: "pipe" }); return true; }
  catch { return false; }
})();

function admin(sql: string) { execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: "pipe" }); }
/** Roda como app_runtime; retorna true se DEU ERRO (negado), false se passou. */
function negadoComoApp(sql: string): boolean {
  try {
    execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-c", `SET ROLE app_runtime; ${sql}`], { stdio: "pipe" });
    return false;
  } catch { return true; }
}

(habilitado ? describe : describe.skip)("P1-C · separacao de roles do Postgres (scratch)", () => {
  beforeAll(() => {
    execFileSync("psql", [`${BASE}/postgres`, "-tAc", `DROP DATABASE IF EXISTS ${DB}`], { stdio: "pipe" });
    execFileSync("psql", [`${BASE}/postgres`, "-tAc", `CREATE DATABASE ${DB}`], { stdio: "pipe" });
    // schema minimo representativo
    admin(`
      CREATE TABLE "Payment" (id text PRIMARY KEY, status text NOT NULL DEFAULT 'PENDING');
      CREATE TABLE "AdminSecurityEvent" (id text PRIMARY KEY, action text NOT NULL);
      CREATE TABLE "LegacyRecoveryAudit" (id text PRIMARY KEY, action text NOT NULL);
      CREATE TABLE "_financial_maintenance" (id boolean PRIMARY KEY DEFAULT true, enabled boolean NOT NULL DEFAULT false);
      CREATE TABLE "_financial_maintenance_audit" (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, action text);
      INSERT INTO "_financial_maintenance" (id, enabled) VALUES (true, false);
      INSERT INTO "Payment" (id) VALUES ('p1');
      INSERT INTO "AdminSecurityEvent" (id, action) VALUES ('e1','LOGIN_SUCCESS');
      INSERT INTO "LegacyRecoveryAudit" (id, action) VALUES ('a1','ABRIR');
      CREATE FUNCTION guard() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN RETURN NEW; END $f$;
      CREATE TRIGGER prevent_payment_approval BEFORE UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION guard();
    `);
    // aplica os grants (versao com LOGIN/senha de teste)
    execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-f", "prisma/roles/roles.sql"], { stdio: "pipe" });
  });
  afterAll(() => {
    if (!habilitado) return;
    execFileSync("psql", [`${BASE}/postgres`, "-tAc", `DROP DATABASE IF EXISTS ${DB}`], { stdio: "pipe" });
  });

  it("INFRA-1 app_runtime NAO faz DDL", () => {
    expect(negadoComoApp(`CREATE TABLE x (id int)`)).toBe(true);
    expect(negadoComoApp(`ALTER TABLE "Payment" ADD COLUMN y int`)).toBe(true);
    expect(negadoComoApp(`DROP TABLE "Payment"`)).toBe(true);
    expect(negadoComoApp(`CREATE FUNCTION f2() RETURNS int LANGUAGE sql AS 'SELECT 1'`)).toBe(true);
  });

  it("INFRA-2 app_runtime NAO remove/altera o financial guard nem liga a flag", () => {
    expect(negadoComoApp(`DROP TRIGGER prevent_payment_approval ON "Payment"`)).toBe(true);
    expect(negadoComoApp(`ALTER FUNCTION guard() RENAME TO guard2`)).toBe(true);
    expect(negadoComoApp(`UPDATE "_financial_maintenance" SET enabled = true WHERE id = true`)).toBe(true);
    expect(negadoComoApp(`DELETE FROM "_financial_maintenance"`)).toBe(true);
  });

  it("INFRA-3 audit e append-only para o runtime (INSERT ok; UPDATE/DELETE negado)", () => {
    expect(negadoComoApp(`INSERT INTO "AdminSecurityEvent" (id, action) VALUES ('e2','MFA_ENROLL')`)).toBe(false); // insere ok
    expect(negadoComoApp(`UPDATE "AdminSecurityEvent" SET action = 'x' WHERE id = 'e1'`)).toBe(true);
    expect(negadoComoApp(`DELETE FROM "AdminSecurityEvent" WHERE id = 'e1'`)).toBe(true);
    expect(negadoComoApp(`UPDATE "LegacyRecoveryAudit" SET action = 'x' WHERE id = 'a1'`)).toBe(true);
    expect(negadoComoApp(`DELETE FROM "LegacyRecoveryAudit" WHERE id = 'a1'`)).toBe(true);
  });

  it("INFRA-15 DML normal de negocio funciona para app_runtime", () => {
    expect(negadoComoApp(`SELECT * FROM "Payment"`)).toBe(false);
    expect(negadoComoApp(`UPDATE "Payment" SET status = 'REJECTED' WHERE id = 'p1'`)).toBe(false);
    expect(negadoComoApp(`INSERT INTO "Payment" (id) VALUES ('p2')`)).toBe(false);
    expect(negadoComoApp(`SELECT enabled FROM "_financial_maintenance"`)).toBe(false); // leitura da flag ok
  });
});
