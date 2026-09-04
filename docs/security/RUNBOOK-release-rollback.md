# Runbook de Release e Rollback (P0 + P1)

> **A sequência autoritativa e 7.1-aware (com roles, FSM function, lockdown e
> chave MFA) vive em `RELEASE-PLAN.md`.** Este arquivo mantém a matriz de
> rollback e o floor; para a ordem exata de execução, use o RELEASE-PLAN.

## Sequência de release (preserva a propriedade "sem janela vulnerável")
Ordem obrigatória — não altere:
1. Backup/PITR confirmado (ver BACKUP-CHECKLIST).
2. Preflight read-only (`npm run db:migrate:preflight`) + queries de integridade.
3. **DB guard ON** (financial maintenance): `psql -f prisma/guard/financial-maintenance.activate.sql`. Provar ON (status.sql). A partir daqui NENHUM código aprova (nem OLD).
4. Drenar 100% das instâncias OLD.
5. **Migrations como job separado**: `npm run db:migrate:deploy` (DIRECT_URL/migration_role). Validar schema.
6. Deploy do código NEW (build NÃO roda migration). Confirmar 100% NEW.
7. Smoke sem dinheiro (ver DEPLOY-OBSERVABILITY): app sobe, schema, assinatura inválida rejeitada, kill switch, MFA admin, sem 500.
8. **DB guard OFF** (deactivate.sql). Provar OFF.
9. Reprocessar backlog (`reconciliarPagamentosPendentes`), monitorando reconciliação.
10. Canary transacional humano autorizado (nunca automático; NexusPag mínimo).
11. Monitorar 24h. Registrar rollback floor.

## Checklist de release (humano)
- [ ] backup/PITR verificado
- [ ] roles de DB verificadas (app_runtime sem DDL, migration_role dona)
- [ ] guard instalado
- [ ] guard ativado
- [ ] migrations aplicadas (job separado)
- [ ] deploy
- [ ] OLD drenado
- [ ] smoke de segurança (sem dinheiro)
- [ ] guard desativado
- [ ] reconciliação do backlog
- [ ] canary autorizado por humano
- [ ] monitoramento ligado
- [ ] rollback floor registrado

## SAFE ROLLBACK FLOOR (reavaliado pós P1-A/P1-B/P1-C)
> **CODE SAFE FLOOR = `86fa00b`** (primeiro commit com P0 financeiro + P1-A
> completo + P1-B admin MFA). **NUNCA** fazer deploy ou rollback de código abaixo
> dele: reabre nome+CPF, remove MFA de admin ou a verificação financeira.
>
> **PRODUCTION ROLLBACK FLOOR (pós-lockdown) = `2e2c423`.** Depois que o
> `financial-fsm-lockdown.sql` for aplicado no banco (column-revoke de
> `Payment.status`), os writers financeiros por Prisma cru ficam fail-closed
> abaixo desse floor → **forward-fix é a política**; rollback abaixo só junto da
> remoção do lockdown, **com guard ON**. HEAD candidato atual: `48d4e58`.

## Matriz de rollback
| Camada | Rollback seguro | Rollback INSEGURO | Preferência |
|---|---|---|---|
| APP | para ≥ floor | para < floor (reabre A1/MFA) | forward-fix |
| SCHEMA | manter (aditivo) | dropar colunas P0/P1 | nunca dropar |
| GUARD | manter instalado, flag OFF | remover o guard | manter |
| AUTH | ≥ floor | remover OTP/sessionVersion | forward-fix |
| ADMIN MFA | ≥ floor | remover MFA/step-up | forward-fix |

Se o próprio HEAD tiver bug: manter guard ON, hotfix forward, nunca rollback < floor.
