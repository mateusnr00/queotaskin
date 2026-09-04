# PRODUCTION RELEASE CHECKLIST — HEAD `48d4e58`

Checklist operacional FINAL do primeiro release endurecido. **Nada aqui foi
executado.** A ordem de release autoritativa vive em `RELEASE-PLAN.md` (§6);
este documento é o roteiro de execução por **gates humanos**.

## Regras invioláveis
- **NÃO há script único que rode tudo** (§55). Cada gate é um checkpoint humano.
- Comandos **READ-ONLY** e **MUTATING** nunca se misturam no mesmo bloco (§51).
- Todo comando MUTATING está marcado **# REQUIRES EXPLICIT HUMAN APPROVAL** (§52).
- **STOP ON FAILURE** (§54): gate que falha → NÃO avança para o próximo.
- Floors (§48): CODE SAFE FLOOR `86fa00b`; PRODUCTION ROLLBACK FLOOR (pós-lockdown)
  `2e2c423`; HEAD candidato `48d4e58`.

---

## GATE-0 — CODE (dev)  → PASS / NO-GO
Evidência (local, já coletada nesta fase):
- Testes: 1381/1381 (run limpo). Typecheck PASS. Lint 0 errors. Build PASS.
- Secret scan limpo. Working tree CLEAN. Diff só security/UI/docs/tests.

### READ-ONLY
```bash
git rev-parse HEAD                 # deve ser 48d4e58
npm run typecheck
npm run lint
npm run test
npm run build                      # build NÃO roda migration
```
CI versionada a confirmar humanamente (§56): `.github/workflows/ci.yml`
(typecheck+lint+test+build no HEAD; sentinela test/prod; sem deploy).

---

## GATE-1 — BACKUP / PITR (operador)  → PASS / NO-GO
**Sem isto: RELEASE NO-GO (§41).** Evidência que o operador deve OBTER (§5):
- [ ] backup automático ativo (timestamp da última proteção)
- [ ] PITR ativo + janela/retention conhecida
- [ ] restore capability validada (ou classificada HUMAN VERIFY, §42)
- [ ] RPO/RTO alvo definidos
- [ ] responsável nomeado
Checklist detalhado: `BACKUP-CHECKLIST.md`. Restore reprocessa webhooks →
**ativar o guard ANTES de restaurar** (idempotência por `providerEventId` é a rede).

---

## GATE-2 — DB PREFLIGHT (operador, READ-ONLY)  → PASS / NO-GO

### READ-ONLY
```bash
npm run db:migrate:preflight
```
Dimensionar o UNIQUE de `PaymentWebhookEvent(provider, providerEventId)` (§19):
```sql
-- READ-ONLY. Sem PII.
SELECT count(*)                                   AS linhas
  FROM "PaymentWebhookEvent";
SELECT provider, "providerEventId", count(*)      AS repetidos
  FROM "PaymentWebhookEvent"
 GROUP BY provider, "providerEventId"
HAVING count(*) > 1;
SELECT indexname FROM pg_indexes
 WHERE tablename = 'PaymentWebhookEvent';
SELECT pg_size_pretty(pg_total_relation_size('"PaymentWebhookEvent"')) AS tamanho;
```
Contagem de legado sem senha (§27) — **só contagens, sem CPF/nome/telefone**:
```sql
-- READ-ONLY. Sem PII.
SELECT count(*) AS total_users             FROM "User";
SELECT count(*) AS password_ready          FROM "User" WHERE "passwordHash" IS NOT NULL;
SELECT count(*) AS legacy_no_password      FROM "User" WHERE "passwordHash" IS NULL;
```
Árvore de decisão de índice (§20): < 100k → migração normal; 100k–1M → janela de
baixo tráfego; > 1M → `CREATE INDEX CONCURRENTLY` manual + `migrate resolve
--applied` (só neste caso). **Não improvisar DDL nem alterar migration agora.**

---

## GATE-3 — GUARD ON (operador)  → PASS / NO-GO
Instalar e ativar o Financial Maintenance Guard; a partir daqui NENHUM código
(OLD, NEW, webhook, worker) aprova. Fail-closed: linha ausente/NULL bloqueia.

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL
```bash
psql "$DIRECT_URL" -f prisma/guard/financial-maintenance.install.sql   # REQUIRES EXPLICIT HUMAN APPROVAL
psql "$DIRECT_URL" -f prisma/guard/financial-maintenance.activate.sql   # REQUIRES EXPLICIT HUMAN APPROVAL
```
### READ-ONLY (provar ON)
```bash
psql "$DIRECT_URL" -f prisma/guard/financial-maintenance.status.sql     # enabled = true
```

---

## GATE-4 — ROLES / LOCKDOWN (operador)  → PASS / NO-GO
Ordem: roles → migrations (GATE-5) → lockdown. O lockdown depende da função
`fin_transicao_pagamento` (migration) e das roles.

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL (como migration_role/dona)
```bash
psql "$DIRECT_URL" -f prisma/roles/roles.sql                    # REQUIRES EXPLICIT HUMAN APPROVAL
# ALTER ROLE app_runtime LOGIN PASSWORD '...'  (fora do versionado)  # REQUIRES EXPLICIT HUMAN APPROVAL
# --- só APÓS o GATE-5 (função existe) ---
psql "$DIRECT_URL" -f prisma/roles/financial-fsm-lockdown.sql   # REQUIRES EXPLICIT HUMAN APPROVAL
```
**Antes de apontar DATABASE_URL→app_runtime** (pré-requisito de cutover, GATE-5.5):
RLS resolvida. O Supabase (`ensure_rls`) habilita RLS em toda tabela; app_runtime
sem BYPASSRLS seria negada em tudo.
### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL (como superuser supabase_admin)
```bash
psql "$SUPABASE_ADMIN_URL" -f prisma/roles/runtime-rls.sql   # REQUIRES EXPLICIT HUMAN APPROVAL (superuser)
```
Depois: apontar **DATABASE_URL→app_runtime** e **DIRECT_URL→migration_role**.
**Credencial de migration NUNCA no runtime (§11).**
### READ-ONLY (provar privilégios)
```bash
psql "$DATABASE_URL" -f prisma/roles/verify-roles.sql
psql "$DATABASE_URL" -f prisma/roles/verify-runtime-rls.sql
# app_runtime: bypassa RLS, sem DDL, sem UPDATE(status) de Payment, audit append-only.
```

---

## GATE-5 — MIGRATIONS (operador, job separado)  → PASS / NO-GO
BUILD NÃO migra (§21). Migration é job dedicado, com DIRECT_URL/migration_role.

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL
```bash
npm run db:migrate:deploy      # REQUIRES EXPLICIT HUMAN APPROVAL
```
### READ-ONLY (validar schema)
```bash
npx prisma migrate status
```
Falha de migration (§22): guard continua ON; **não liberar tráfego financeiro**;
**não** `migrate reset`; **não** marcar applied casualmente; investigar; forward-fix.
Inventário e risco por migration: `MIGRATION-RISK.md` (todas EXPAND/aditivas).

---

## GATE-6 — DEPLOY NEW (operador)  → PASS / NO-GO
Deploy do código NEW (build sem migration). Chaves presentes ANTES: AUTH_SECRET,
PAYMENT_SECRET_ENCRYPTION_KEY, **ADMIN_MFA_ENCRYPTION_KEY (≠ payment)**, CRON_SECRET,
DATABASE_URL(app_runtime), DIRECT_URL(migration_role). Boot faz fail-fast se faltar
ou se as duas chaves de cifra forem iguais (§24).

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL
```bash
# deploy pela plataforma (pipeline)                # REQUIRES EXPLICIT HUMAN APPROVAL
```
### READ-ONLY (liveness/readiness)
```bash
curl -fsS https://<host>/api/health         # {status, release:<sha>, ts}
curl -fsS https://<host>/api/health/ready    # {ready:true}; 503 se DB fora
```

---

## GATE-7 — DRAIN (operador)  → PASS / NO-GO
**Proibido "esperar 5 min e assumir" (§35).** Critério: 100% das respostas de
`/api/health` na janela observada trazem o **sha do NEW**, e o deployment/version
da plataforma confirma. SHA vem de `VERCEL_GIT_COMMIT_SHA`/`RELEASE_ID` (§34).
### READ-ONLY
```bash
for i in $(seq 1 30); do curl -fsS https://<host>/api/health | grep -o '"release":"[^"]*"'; sleep 2; done
# todas as linhas devem mostrar o mesmo sha do NEW
```

---

## GATE-8 — GUARD OFF (operador)  → PASS / NO-GO
Só depois de: roles ok, migrations ok, lockdown ok, drain 100% NEW, chave MFA ok.

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL
```bash
psql "$DIRECT_URL" -f prisma/guard/financial-maintenance.deactivate.sql  # REQUIRES EXPLICIT HUMAN APPROVAL
```
### READ-ONLY (provar OFF)
```bash
psql "$DIRECT_URL" -f prisma/guard/financial-maintenance.status.sql      # enabled = false
```
Se o guard não desativar: tudo segue PENDING (fail-closed). Investigar; **nunca
forçar aprovação** (§50).

---

## GATE-9 — RECONCILIATION + RECIPHER (operador)  → PASS / NO-GO
Recifrar TOTP legado para v2 (bounded, idempotente, rerunnable, sem plaintext):
função `recifrarSegredosMfaLegados` (§30). Reprocessar backlog: só STRONG,
oldest-first, teto por passada; sem mass-approve, sem SQL cru (§37/§38).

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL
```bash
# recifrarSegredosMfaLegados()        # REQUIRES EXPLICIT HUMAN APPROVAL (rodar até 0 v1 restantes)
# reconciliarPagamentosPendentes()    # REQUIRES EXPLICIT HUMAN APPROVAL (bounded)
```
Métricas de backlog a observar (§39): pending count, oldest pending age,
reconciliation count, reconciliation failure count, needs-reconciliation count.

---

## GATE-10 — CANARY (dono + operador)  → PASS / NO-GO
**Planejar apenas; execução exige autorização humana explícita.** Smoke de auth
primeiro (§44): participante **CPF+senha**; admin **senha+TOTP**; sem dados
pessoais reais desnecessários. Canary transacional (§43): tenant definido,
NexusPag STRONG, **menor valor seguro**, pagamento humano autorizado; verificar
exatamente uma Reservation, um Payment, amount/identity corretos, tickets, XP uma
vez, affiliate effect no máximo uma vez, receipt e audit completos.

**ABORTAR (§45)** em: amount/identity mismatch, ticket/XP/affiliate duplicado,
Payment sem prova STRONG, Reservation PAID sem Payment APPROVED, audit ausente,
bypass de MFA admin, bypass de auth legado, health/readiness falhando.

### MUTATING — REQUIRES EXPLICIT HUMAN APPROVAL
```bash
# pagamento real mínimo autorizado por humano   # REQUIRES EXPLICIT HUMAN APPROVAL
```

---

## GATE-11 — MONITORING (operador)  → PASS / NO-GO
Alerting mínimo do §40 ativo (ou monitoramento humano explícito na janela):
amount/identity mismatch, reconciliation required, guard block, payment
verification failure, webhook failure, cron failure, spike de MFA/step-up,
brute-force de senha participante, falha de health/readiness. Contrato:
`ALERTING-CONTRACT.md`. Janelas (§46): 0–15 min, 30–60 min, 24 h.
Registrar o **rollback floor** e encerrar a janela.

---

## INCIDENT STOP BUTTON (§50)
1. **Guard ON** (activate.sql) — congela toda aprovação financeira.
2. **Kill switch**: `PAYMENTS_AUTO_APPROVAL_DISABLED=true` — nenhum caminho
   automático NEW aprova (fica PENDING/reconciliável).
3. Preservar logs e `AdminSecurityEvent` (append-only) — **não deletar evidência**.
4. Rollback só ≥ floor; pós-lockdown, forward-fix (RUNBOOK-release-rollback).

## Rollback por camada (§47) — ver `RELEASE-PLAN.md` §C/§D e RUNBOOK-release-rollback
Pré-guard: rollback livre ≥ `86fa00b`. Guard ON / roles / migrations (aditivas) /
lockdown: manter guard ON, forward-fix, **nunca** dropar coluna P0/P1 nem remover
o guard. Pós-lockdown: floor `2e2c423`; abaixo disso os writers são fail-closed.
