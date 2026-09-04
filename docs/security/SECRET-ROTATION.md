# Rotação de segredos

| Segredo | Como rotacionar | Cuidado |
|---|---|---|
| AUTH_SECRET | trocar env; todas as sessões caem | exige novo login de todos |
| DB password (app_runtime) | ALTER ROLE ... PASSWORD; atualizar DATABASE_URL | reconectar pool |
| DB password (migration_role) | idem; atualizar DIRECT_URL | isolado do runtime |
| Gateway key/secret | painel (write-only); revalida no gateway | antigo deixa de valer |
| PAYMENT_SECRET_ENCRYPTION_KEY | ver abaixo — NÃO trivial | pode tornar cifrados ilegíveis |
| OTP provider secret | quando o provider real existir | fail-closed enquanto ausente |

## Rotação da encryption key — GAP declarado
`PAYMENT_SECRET_ENCRYPTION_KEY` cifra **gateway secrets E TOTP de admin** com a
MESMA chave (blast radius maior). O sistema **NÃO suporta rotação de chave** hoje:
trocá-la torna ilegível tudo que já foi cifrado.

**Recomendação (P2, migração aditiva versionada):**
1. Introduzir versionamento no blob cifrado (`v2:<iv>:<ct>` com key-id).
2. Chaves separadas por domínio: `PAYMENT_SECRET_ENCRYPTION_KEY` (gateways) e
   `ADMIN_MFA_ENCRYPTION_KEY` (TOTP). Ver TOTP-KEY-SEPARATION abaixo.
3. Re-cifrar em background lendo com a chave velha e gravando com a nova.
Enquanto não implementado: **domínios compartilham a chave** — documentado.

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
