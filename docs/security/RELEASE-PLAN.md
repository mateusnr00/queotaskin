# PLANO DE RELEASE — HEAD `2e2c423` (P0+P1-A+P1-B+P1-C)

Consolida os passos de operador. **Nada aqui foi executado.** A sequência
substitui a versão pré-7.1 do RUNBOOK-release-rollback (que não tinha roles/
FSM/lockdown/chave MFA).

## A. Matriz de dependência de operador (§2)
| Item | Code ready? | Prod config? | Human action | Failure mode | Rollback |
|---|---|---|---|---|---|
| migration_role | ✓ (SQL) | criar no Supabase | — | migração falha | recriar |
| app_runtime | ✓ (SQL) | criar + grants | — | app não escreve | ajustar grant |
| DATABASE_URL→app_runtime | ✓ | apontar | operador | app usa role errada | reapontar |
| DIRECT_URL→migration_role | ✓ | apontar | operador | migração sem DDL | reapontar |
| financial guard | ✓ (SQL) | instalar+ON/OFF | operador | — | uninstall/flag OFF |
| FSM function | ✓ (migration) | migrate deploy | — | writer financeiro falha | forward-fix |
| financial lockdown | ✓ (SQL) | aplicar na janela | operador | OLD fail-closed (ok) | remover só com guard ON |
| ADMIN_MFA_ENCRYPTION_KEY | ✓ | gerar+setar (≠payment) | operador | boot fail-fast | setar |
| PAYMENT_SECRET_ENCRYPTION_KEY | ✓ | já existe | operador | boot fail-fast | — |
| AUTH_SECRET / CRON_SECRET | ✓ | já existe | operador | boot/cron fail | setar |
| OTP provider (participante) | interface só | integrar (BLOCKER) | operador | login fail-closed | — |
| backup/PITR | — | habilitar+testar | operador | sem recuperação | — |
| migrations | ✓ | job separado | operador | forward-fix | nunca reset |
| Vercel build | ✓ (sem migrate) | pipeline | operador | — | redeploy |
| cron | ✓ | CRON_SECRET | operador | 401 | setar |
| alerting | contrato | integrar mínimo | operador | cego | — |
| reconciliation | ✓ | rodar pós-guard | operador | backlog cresce | rerun |
| canary | plano | autorização humana | operador | abortar (§30) | — |

## B. Sequência EXATA (§7/§9/§10/§33) — 7.1-aware
1. **Backup/PITR** confirmado (BACKUP-CHECKLIST) + **security freeze** (só hotfix/sec).
2. **Preflight read-only**: `npm run db:migrate:preflight` + `prisma/roles/preflight-webhook-index.sql`.
3. **Guard install + ON** (`financial-maintenance.install.sql` → `.activate.sql`; provar com `.status.sql`). OLD já congela.
4. **Roles**: `prisma/roles/roles.sql` (cria app_runtime, grants, audit append-only). Ainda como a role dona (migration).
5. **Migrations** (job separado, DIRECT_URL/migration_role): `npm run db:migrate:deploy`. Inclui a função `fin_transicao_pagamento`. Validar (`prisma migrate status`).
6. **Lockdown financeiro**: `prisma/roles/financial-fsm-lockdown.sql` (revoga UPDATE(status), INSERT→PENDING, trigger Reservation, GRANT EXECUTE). Depende da função (5) e das roles (4).
7. **Trocar credenciais**: `DATABASE_URL`→app_runtime, `DIRECT_URL`→migration_role. **Migration credential NUNCA no runtime.**
8. **ADMIN_MFA_ENCRYPTION_KEY** (≠ payment) disponível à app NEW.
9. **Deploy NEW** (build sem migration). Confirmar 100% NEW via `/api/health` (release id).
10. **Provar drain OLD** (§20): 100% das respostas de `/api/health` com o sha do NEW; deployment/version da plataforma confirma. **Não por tempo fixo.**
11. **Verificar roles**: `prisma/roles/verify-roles.sql` (app_runtime sem DDL, sem UPDATE status, audit append-only; current_user correto por URL).
12. **Recifra TOTP legado**: `recifrarSegredosMfaLegados` (bounded, idempotente); confirmar 0 v1 restantes.
13. **Guard OFF** (`.deactivate.sql`; provar OFF).
14. **Reconciliação** do backlog (`reconciliarPagamentosPendentes`) — só STRONG, nenhum mass-approve/SQL.
15. **Smoke sem dinheiro** (§24): admin enrollment→TOTP→recovery codes→login→step-up; kill switch; assinatura inválida rejeitada; sem 500.
16. **Canary** transacional (§29) — **autorização humana explícita**, valor mínimo, NexusPag STRONG, verificar amount/identity/Payment/Reservation/ticket/XP/audit/receipt. Abortar em qualquer critério do §30.
17. **Monitorar** 60min + 24h (RUNBOOK/DEPLOY-OBSERVABILITY). Registrar rollback floor.

## C. Cenários de deploy falho (§23) — comportamento / safe state / ação
| # | Cenário | Comportamento | Safe state | Ação do operador |
|---|---|---|---|---|
| A | migrations ok, deploy falha | NEW não sobe; OLD congelado (guard) | sem aprovação | redeploy NEW; guard segue ON |
| B | lockdown ok, NEW falha | writers financeiros fail-closed | PENDING acumula | forward-fix; guard ON; reconciliar depois |
| C | NEW sobe, MFA key ausente | boot fail-fast (env-validation) | app não sobe | setar chave; redeploy |
| D | OTP provider indisponível | login participante fail-closed | ninguém loga fraco | corrigir provider; guard não afeta |
| E | NexusPag indisponível | Payment PENDING (sem fallback) | reconciliável | reconciliar quando voltar |
| F | reconciliation falha | backlog permanece PENDING | recuperável | rerun bounded; investigar |
| G | guard não desativa | tudo segue PENDING | fail-closed | investigar flag; nunca forçar aprovação |
| H | DB credential incorreta | app não conecta OU sem DDL | fail-closed | corrigir URL/role |

## D. Rollback (§22/§37)
- **PRÉ-lockdown**: rollback de app livre até o CODE SAFE FLOOR `86fa00b`.
- **PÓS-lockdown**: **floor = `2e2c423`**. Abaixo disso, com column-revoke aplicado, os writers financeiros (prisma cru) ficam **fail-closed** → **forward-fix é a política**. Rollback abaixo só junto da remoção do lockdown, **com guard ON**. Durante incidente: manter guard ON, nunca desligar para "OLD processar".

## E. Gate matrix (§37)
| Gate | Status | Evidence | Owner | Blocking? |
|---|---|---|---|---|
| Code RC | PASS | FASE 8 | dev | — |
| Tests | PASS | 1363/1363 x2 | dev | sim |
| Build | PASS | next build | dev | sim |
| Secrets | PASS | scan limpo | dev | sim |
| DB roles | PENDING | verify-roles.sql (prod) | operador | **sim** |
| Guard | PENDING | status.sql (prod) | operador | **sim** |
| FSM lockdown | PENDING | verify-roles.sql (prod) | operador | **sim** |
| Migrations | READY | migrate status (prod) | operador | sim |
| MFA key | PENDING | env presente + ≠payment | operador | **sim** |
| OTP provider | **BLOCKER** | integração ausente | operador | **sim** |
| Backup/PITR | PENDING | checklist | operador | **sim** |
| Alerting | PENDING | mínimo do §18 | operador | sim |
| CI | READY | .github/workflows/ci.yml | dev/operador | não |
| Rollback | READY | esta doc | dev | não |
| Canary auth | PENDING | decisão humana | dono | **sim** |

## F. GO rule (§38)
PRODUCTION RELEASE só vira **READY FOR HUMAN EXECUTION** quando todos os gates
PENDING que dependem de config (não-produção-local) estiverem documentados sem
ambiguidade **e** o OTP provider estiver integrado. Enquanto o provider real
não existir, o login participante fica fail-closed → **NO-GO** para abrir o site
ao público, embora o restante possa ser preparado.
