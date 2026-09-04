# PR: Hardening de segurança P0 + P1 (financeiro, auth, admin, infra)

## Objetivo
Fechar as vulnerabilidades da auditoria (F-01 e correlatas) sem alterar o
produto: verificação financeira real, login forte, MFA de admin e isolamento de
infra. **16 commits** sobre `main` (`143691b..2e2c423`), todos de segurança.

## O que muda
- **P0 financeiro (PASS)**: webhook deixa de ser prova; verificação S2S no
  gateway (NexusPag STRONG: status+amount+identity); FSM única escritora de
  status; idempotência forte; kill switch; tier por provider; financial
  maintenance guard (trigger no banco); reconciliador determinístico.
- **P1-A participante (COMPLETE)**: login CPF+OTP (nome+CPF morto); cadastro com
  telefone verificado; sessionVersion/reauth; migração assistida de legado.
- **P1-B admin (COMPLETE)**: MFA TOTP (RFC 6238); step-up em ações críticas;
  winner lock; gateway secret write-only; auditoria privilegiada; recovery codes.
- **Security UI (FASE 10/10.1)**: login/registro/troca-de-telefone/reauth-Steam
  por OTP; admin MFA login/enrollment/step-up (modal reutilizavel) conectado em
  TODAS as acoes criticas (payment override, gateway, role, senha, legacy
  approval, MFA reset); recuperacao de legado (participante + painel de suporte
  admin, tenant-scoped, dados mascarados). Provider de OTP: abstracao fail-closed
  (registry + HttpOtpProvider); vendor real = BLOCKED BY PROVIDER SELECTION
  (docs/security/OTP-PROVIDER-SELECTION.md).
- **P1-C infra (CODE COMPLETE)**: separação de roles do Postgres (app_runtime
  sem DDL); audit append-only; lockdown financeiro no banco (DML não fabrica
  aprovação); chave de MFA separada da de pagamento; env-validation fail-fast;
  security headers; build ≠ migration; CI; runbooks.

## Migrations (7, aditivas)
Ver docs/security/MIGRATION-RISK.md. Nenhuma CONTRACT/irreversível.

## SQL de operador (fora da cadeia Prisma)
prisma/roles/*.sql (roles, lockdown, verify), prisma/guard/*.sql. Aplicados na
janela de release — ver docs/security/RELEASE-PLAN.md.

## Risco / rollback
CODE SAFE FLOOR `86fa00b`; **PROD ROLLBACK FLOOR pós-lockdown `2e2c423`** (abaixo
disso, writers financeiros ficam fail-closed → forward-fix).

## Testes
1363/1363 (2 runs); suítes de segurança permanentes (SECURITY-TEST-MANIFEST).

## Produção = NO-GO
Requer passos de operador (PRODUCTION-CONFIG-REQUIRED + RELEASE-PLAN):
roles/lockdown/guard, ADMIN_MFA_ENCRYPTION_KEY, backup/PITR, **OTP provider real
(blocker)**, alerting, rollout controlado.

---
## Checklist do revisor
- [ ] Payment writers: só FSM + choke point + override admin-gated
- [ ] Auth: nome+CPF morto/fail-closed; telefone não verificado não autentica
- [ ] Admin: MFA ativa bloqueia senha-só; ações críticas exigem step-up
- [ ] DB roles: app_runtime sem DDL; audit append-only; guard imexível
- [ ] Operator SQL: ordem no RELEASE-PLAN; migration credential fora do runtime
- [ ] Migrations aditivas; migrate deploy do zero limpo
- [ ] env-validation fail-fast; STATUS_ONLY impossível em prod
- [ ] Runbooks correspondem ao HEAD
