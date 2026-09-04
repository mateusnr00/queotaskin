// P1-C 7.1 DBFIN - app_runtime nao fabrica aprovacao financeira via DML.
import { execFileSync } from "node:child_process";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BASE = "postgresql://postgres@localhost:5433";
const DB = "queota_fsm_check";
const habilitado = (() => { try { execFileSync("psql", [`${BASE}/postgres`, "-tAc", "SELECT 1"], { stdio: "pipe" }); return true; } catch { return false; } })();

function raw(sql: string) { execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], { stdio: "pipe" }); }
function comoApp(sql: string): { ok: boolean; out: string } {
  try { const out = execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-tA", "-c", `SET ROLE app_runtime; ${sql}`], { stdio: "pipe" }).toString(); const linhas = out.split("\n").map((x) => x.trim()).filter(Boolean); return { ok: true, out: linhas[linhas.length - 1] ?? "" }; }
  catch (e) { return { ok: false, out: String((e as { stderr?: Buffer }).stderr ?? "") }; }
}
function statusPagamento(id: string): string {
  return execFileSync("psql", [`${BASE}/${DB}`, "-tAc", `SELECT status FROM "Payment" WHERE id='${id}'`], { stdio: "pipe" }).toString().trim();
}

(habilitado ? describe : describe.skip)("P1-C 7.1 · lockdown financeiro no banco (scratch)", () => {
  beforeAll(() => {
    execFileSync("psql", [`${BASE}/postgres`, "-tAc", `DROP DATABASE IF EXISTS ${DB}`], { stdio: "pipe" });
    execFileSync("psql", [`${BASE}/postgres`, "-tAc", `CREATE DATABASE ${DB}`], { stdio: "pipe" });
    raw(`
      CREATE TYPE "PaymentStatus" AS ENUM ('PENDING','APPROVED','REJECTED','CANCELLED','REFUNDED');
      CREATE TYPE "ReservationStatus" AS ENUM ('PENDING','PAID','EXPIRED','CANCELLED');
      CREATE TABLE "Reservation" (id text PRIMARY KEY, status "ReservationStatus" NOT NULL DEFAULT 'PENDING', "aprovadaNoPainel" boolean DEFAULT false);
      CREATE TABLE "Payment" (id text PRIMARY KEY, "reservationId" text NOT NULL, status "PaymentStatus" NOT NULL DEFAULT 'PENDING', "paidAt" timestamptz, "updatedAt" timestamptz DEFAULT now());
      INSERT INTO "Reservation" (id) VALUES ('r1');
      INSERT INTO "Payment" (id, "reservationId") VALUES ('p1','r1');
    `);
    // funcao autoritativa (da migration) + roles + lockdown
    execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-f", "prisma/migrations/20260909000000_funcao_de_transicao_de_pagamento/migration.sql"], { stdio: "pipe" });
    // roles.sql revoga UPDATE/DELETE em audit e _financial_maintenance que nao existem aqui: cria stubs
    raw(`CREATE TABLE "AdminSecurityEvent" (id text PRIMARY KEY); CREATE TABLE "LegacyRecoveryAudit" (id text PRIMARY KEY); CREATE TABLE "_financial_maintenance" (id boolean PRIMARY KEY DEFAULT true, enabled boolean NOT NULL DEFAULT false); CREATE TABLE "_financial_maintenance_audit" (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY); INSERT INTO "_financial_maintenance"(id,enabled) VALUES (true,false);`);
    execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-f", "prisma/roles/roles.sql"], { stdio: "pipe" });
    execFileSync("psql", [`${BASE}/${DB}`, "-v", "ON_ERROR_STOP=1", "-q", "-f", "prisma/roles/financial-fsm-lockdown.sql"], { stdio: "pipe" });
  });
  afterAll(() => { if (habilitado) execFileSync("psql", [`${BASE}/postgres`, "-tAc", `DROP DATABASE IF EXISTS ${DB}`], { stdio: "pipe" }); });

  it("DBFIN-1 app_runtime NAO faz UPDATE Payment.status direto", () => {
    expect(comoApp(`UPDATE "Payment" SET status='APPROVED' WHERE id='p1'`).ok).toBe(false);
    expect(statusPagamento("p1")).toBe("PENDING");
  });

  it("DBFIN-1 INSERT de Payment nasce PENDING mesmo tentando APPROVED", () => {
    expect(comoApp(`INSERT INTO "Payment" (id,"reservationId",status) VALUES ('p2','r1','APPROVED')`).ok).toBe(true);
    expect(statusPagamento("p2")).toBe("PENDING"); // trigger forcou PENDING
  });

  it("DBFIN-3 caminho legitimo: funcao aprova PENDING->APPROVED verificado", () => {
    const r = comoApp(`SELECT "fin_transicao_pagamento"('p1','APPROVED',true)`);
    expect(r.ok).toBe(true);
    expect(r.out.trim()).toBe("OK");
    expect(statusPagamento("p1")).toBe("APPROVED");
  });

  it("DBFIN-1 funcao recusa transicao impossivel e nao-verificada", () => {
    // p2 esta PENDING; APPROVED sem verificado -> SEM_VERIFICACAO
    expect(comoApp(`SELECT "fin_transicao_pagamento"('p2','APPROVED',false)`).out.trim()).toBe("SEM_VERIFICACAO");
    // p1 esta APPROVED; APPROVED->PENDING nao esta na matriz -> INVALIDA
    expect(comoApp(`SELECT "fin_transicao_pagamento"('p1','PENDING',true)`).out.trim()).toBe("INVALIDA");
  });

  it("DBFIN-2 app_runtime NAO marca Reservation PAID com Payment nao-aprovado", () => {
    // r1 tem p2 PENDING (alem de p1 APPROVED) -> ha pagamento nao-aprovado
    const r = comoApp(`UPDATE "Reservation" SET status='PAID' WHERE id='r1'`);
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/RESERVATION_PAID_SEM_PAGAMENTO_APROVADO/);
  });

  it("DBFIN-1 app_runtime continua sem DDL / sem dropar as protecoes", () => {
    expect(comoApp(`DROP FUNCTION "fin_transicao_pagamento"(text,text,boolean)`).ok).toBe(false);
    expect(comoApp(`DROP TRIGGER "force_payment_insert_pending" ON "Payment"`).ok).toBe(false);
    expect(comoApp(`ALTER FUNCTION "fin_transicao_pagamento"(text,text,boolean) RENAME TO x`).ok).toBe(false);
  });
});
