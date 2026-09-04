# Inventário de segredos (por categoria, nunca por valor)

| Categoria | Variável | Propósito | Server/Client | Obrigatória prod | Rotacionável | Falha se ausente |
|---|---|---|---|---|---|---|
| DATABASE | DATABASE_URL | runtime/pooler (app_runtime) | server | sim | sim | app não sobe |
| DATABASE | DIRECT_URL | migrations (migration_role) | server | sim | sim | migração falha |
| AUTH | AUTH_SECRET | assinatura de sessão Auth.js | server | sim | sim (invalida sessões) | fail-fast (P1-C) |
| ENCRYPTION | PAYMENT_SECRET_ENCRYPTION_KEY | cifra gateway secrets + TOTP admin | server | sim | especial (ver rotação) | fail-fast |
| PAYMENTS | NEXUSPAG_WEBHOOK_TOKEN | path do webhook NexusPag | server | quando habilitado | sim | webhook 403 |
| PAYMENTS | SYNCPAY/SIGILOPAY/HORSEPAY_WEBHOOK_TOKEN | idem por gateway | server | quando habilitado | sim | webhook 403 |
| PAYMENTS | SYNCPAY_CLIENT_ID/SECRET/BASE_URL | credencial SyncPay (legado/env) | server | quando habilitado | sim | provider indisp. |
| CRON | CRON_SECRET | autentica Vercel Cron | server | sim | sim | cron 401 (prod) |
| OTP | (nenhuma real ainda) | provider de entrega participante | server | dependência de deploy | — | fail-closed |
| CONFIG | PAYMENTS_AUTO_APPROVAL_DISABLED | kill switch | server | opcional | n/a | fail-closed p/ PENDING |
| CONFIG | PAYMENTS_ALLOW_STATUS_ONLY_AUTO_APPROVAL | opt-in NÃO-prod | server | proibida em prod | n/a | ignorada em prod |
| PUBLIC | NEXT_PUBLIC_SUPABASE_URL | URL pública Supabase | client | sim | n/a | imagens quebram |
| PUBLIC | NEXT_PUBLIC_APP_NAME/URL | branding | client | sim | n/a | cosmético |

Regra: nenhuma `NEXT_PUBLIC_*` carrega segredo (validado por env-validation).
