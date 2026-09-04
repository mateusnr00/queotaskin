# Manifesto de suítes de segurança — NÃO REMOVER

Estas suítes provam invariantes de segurança. Removê-las reabre vulnerabilidades.

## P0 — financeiro
- src/security-tests/payment-webhook.security.test.ts (F-01)
- src/security-tests/payment-adversarial.security.test.ts
- src/security-tests/nexuspag-strong.security.test.ts
- src/security-tests/financial-maintenance-guard.security.test.ts
- src/security-tests/kill-switch.security.test.ts
- src/security-tests/reconciliacao-pagamentos.security.test.ts
- src/security-tests/write-guard.security.test.ts

## P1-A — participante
- src/security-tests/auth-otp.security.test.ts
- src/security-tests/registro-seguro.security.test.ts
- src/security-tests/sessao-enforcement.security.test.ts
- src/security-tests/recuperacao-legado.security.test.ts

## P1-B — admin
- src/security-tests/admin-mfa.security.test.ts
- src/security-tests/admin-enforcement.security.test.ts
- src/lib/auth/totp.test.ts

## P1-C — infra/ops
- src/security-tests/db-roles.security.test.ts
- src/security-tests/infra.security.test.ts
- src/security-tests/db-financial-fsm.security.test.ts (7.1 lockdown financeiro)
- src/security-tests/mfa-key-separation.security.test.ts (7.1 chave MFA)

Barreira test/prod: src/test/assert-safe-environment.test.ts (NUNCA remover).
Rode todas: `npm run security:test`.
