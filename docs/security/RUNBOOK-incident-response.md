# Runbook de resposta a incidente (mínimo)

Para cada cenário: **contain → revoke → rotate → preserve evidence → recover → verify**.

## Admin comprometido
- Contain: `revogarTodasAsSessoes(userId)` (sobe sessionVersion). Desabilitar a conta.
- Revoke: reset de MFA (`resetarMfa`) força re-enrollment; revoga recovery codes.
- Rotate: senha do admin (temporária + mustChangePassword).
- Evidence: `AdminSecurityEvent` (append-only) — não apagar.
- Recover: re-enrollment assistido. Verify: revisar audit de ações do ator.

## Vazamento de secret de gateway
- Contain: desativar autoaprovação (`PAYMENTS_AUTO_APPROVAL_DISABLED=true`).
- Rotate: novo secret no painel (write-only); o antigo deixa de valer no gateway.
- Verify: webhook/polling só aprovam com o novo secret.

## Vazamento de credencial de banco
- Impacto alto inevitável se for a migration_role (DDL). Isolar, rotacionar,
  restringir acesso. app_runtime vazada é menos grave (sem DDL, audit append-only).
- Rotate a senha; revisar audit; considerar PITR se houve escrita maliciosa.

## Anomalia de verificação de pagamento (amount/identity mismatch)
- Guard ON, investigar `PAYMENT_VERIFICATION`/`PAYMENT_REQUIRES_RECONCILIATION`.
- Nunca aprovar manualmente sem step-up + motivo (auditado).

## Brute-force / credential-stuffing de senha (participante)
- Detect: pico no bucket `PARTICIPANT_PASSWORD_ATTEMPT` (rate-limit fail-closed
  já bloqueia por CPF; ver ALERTING-CONTRACT).
- Contain: manter o rate-limit ligado; bloquear IP/CPF abusivo se necessário.
- Recover: conta comprometida → `revogarTodasAsSessoes(userId)` (sobe
  sessionVersion) + forçar troca de senha (recuperação assistida). Sem OTP
  externo envolvido (FASE 10.2: CPF+senha).

## Regressão de deploy
- Seguir a matriz de rollback; forward-fix preferido; nunca < floor.
