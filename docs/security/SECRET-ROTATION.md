# Rotação de segredos

| Segredo | Como rotacionar | Cuidado |
|---|---|---|
| AUTH_SECRET | trocar env; todas as sessões caem | exige novo login de todos |
| DB password (app_runtime) | ALTER ROLE ... PASSWORD; atualizar DATABASE_URL | reconectar pool |
| DB password (migration_role) | idem; atualizar DIRECT_URL | isolado do runtime |
| Gateway key/secret | painel (write-only); revalida no gateway | antigo deixa de valer |
| PAYMENT_SECRET_ENCRYPTION_KEY | ver abaixo — NÃO trivial | pode tornar cifrados ilegíveis |
| ~~OTP provider secret~~ | N/A (FASE 10.2: sem OTP externo) | - |

## Rotação da encryption key — separação de domínio IMPLEMENTADA (7.1)
Estado atual (pós P1-C 7.1): **domínios separados**. `PAYMENT_SECRET_ENCRYPTION_KEY`
cifra **apenas os gateway secrets**; `ADMIN_MFA_ENCRYPTION_KEY` cifra **apenas os
segredos TOTP do admin** (formato versionado v2). O boot faz fail-fast se a chave
MFA faltar ou for **igual** à de payment (env-validation).

Migração de legado: os TOTP v1 (cifrados com a chave de payment antes da 7.1) são
recifrados para v2 por `recifrarSegredosMfaLegados` (bounded, idempotente,
rerunnable, sem plaintext em log) — rodar até 0 v1 restantes no rollout (GATE-9).

**Rotação propriamente dita continua não-trivial** (trocar uma chave torna
ilegível o que ela cifrou). Caminho recomendado por domínio: introduzir novo
key-id no blob v2 e re-cifrar em background (ler com a chave velha, gravar com a
nova), sem downtime. Blast radius já reduzido pela separação acima.

## Separação de domínio da chave do TOTP — IMPLEMENTADA (7.1)
`ADMIN_MFA_ENCRYPTION_KEY` cifra os secrets TOTP de admin, **distinta** de
`PAYMENT_SECRET_ENCRYPTION_KEY` (gateways). Formato versionado: novos secrets
`v2:` (chave MFA); legados (sem prefixo) lidos com a chave de pagamento durante
a migração; re-cifra por `recifrarSegredosMfaLegados`. Em produção, sem a chave
MFA o boot cai (env-validation), sem fallback silencioso. Blast radius separado.

## (histórico) Separação de domínio da chave do TOTP (§63)
Idealmente o secret TOTP do admin não usa a mesma chave dos gateways. Gap
relevante mas de baixa exploração isolada (ambos server-side, at-rest).
Implementar junto do versionamento de chave (P2), pois exige re-cifra aditiva.
