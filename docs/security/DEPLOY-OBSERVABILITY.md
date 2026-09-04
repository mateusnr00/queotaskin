# Observabilidade de deploy

## Drain do OLD (§20)
Provar 100% NEW por `/api/health` (campo `release` = sha do NEW) + deployment id
da plataforma. Nunca por tempo fixo. `/api/health/ready` confirma o banco.

## Primeiros 30–60 min
- Taxa de erro 5xx (deve ser ~0).
- Login admin com MFA (sucesso/falha).
- Webhooks: assinatura inválida, verificação, aprovações.
- `PAYMENT_REQUIRES_RECONCILIATION` e backlog PENDING.
- Guard: ativado/desativado conforme runbook; nenhum "guard bloqueou" fora de janela.

## Primeiras 24h
- Reconciliação: processados / pendentes / falhos / duração (ver observabilidade do reconciliador).
- Aprovações STRONG com `verificationMethod=S2S_STATUS_AMOUNT`.
- STATUS_ONLY: nenhuma autoaprovação (deve ser impossível em prod).
- Auth: brute force, MFA failures, step-up failures.

## Smoke (§58) — não executar automaticamente
- Non-money: app sobe, schema, assinatura inválida rejeitada, kill switch, sem 500.
- Admin MFA: enroll + login com TOTP.
- Participant login: CPF+senha (cadastro + login + reauth por senha).
- **NexusPag transação real mínima**: SOMENTE após autorização humana explícita.
