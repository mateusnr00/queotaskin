# Deploy

Produção roda na branch `main`. O build executa
`prisma generate → scripts/migrate-deploy.mjs → next build`; o script do meio
aplica as migrations e, no primeiro deploy, popula o banco.

## 1. Banco (Supabase)

Projeto: **queota-skin** · região `us-east-1` · Postgres 17.

A aplicação usa o papel `queota_app`, não o `postgres` — assim a credencial
que vive na Vercel não é superusuária. O papel já existe, com `CREATE` no
schema `public` (as migrations precisam) e privilégios nas tabelas.

As duas connection strings saem de **Supabase → Project Settings → Database →
Connection string**. Troque o usuário `postgres` por `queota_app` e use a
senha do papel:

```
# App (pooler em transaction mode — é o que serverless precisa)
DATABASE_URL="postgresql://queota_app.<PROJECT_REF>:<SENHA>@aws-<N>-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Migrations (session mode — migration não roda em transaction pooler)
DIRECT_URL="postgresql://queota_app.<PROJECT_REF>:<SENHA>@aws-<N>-us-east-1.pooler.supabase.com:5432/postgres"
```

O prefixo `aws-<N>` varia por projeto (`aws-0`, `aws-1`...). Copie o host
exato do painel; o resto do formato é este.

> O host direto (`db.<ref>.supabase.co`) resolve **só em IPv6**. Se o ambiente
> de build não tiver IPv6, use o pooler nas duas variáveis, como acima.

## 2. Variáveis na Vercel

Escopo **Production**. Gere os segredos com `openssl rand -base64 32`:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | pooler, porta 6543 (acima) |
| `DIRECT_URL` | pooler, porta 5432 (acima) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `https://<seu-dominio>` |
| `NEXTAUTH_URL` | mesmo valor de `AUTH_URL` |
| `PAYMENT_SECRET_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_NAME` | `QuéOta Skin` |
| `NEXT_PUBLIC_APP_URL` | mesmo valor de `AUTH_URL` |
| `SEED_ADMIN_NAME` | seu nome completo — é metade do login do admin |
| `SEED_ADMIN_PHONE` | seu celular com DDD, só dígitos — a outra metade |
| `RUN_SEED` | `1` **só no primeiro deploy** |

`PAYMENT_SECRET_ENCRYPTION_KEY` criptografa as credenciais de PIX gravadas
pelo painel. Trocá-la depois torna ilegível o que já foi salvo.

O login do admin é **nome + celular**, sem senha. Os dois valores vêm de
`SEED_ADMIN_NAME` e `SEED_ADMIN_PHONE` — use os seus, não os de exemplo.

### Sobre `RUN_SEED`

O banco sobe vazio, e sem um `Tenant` cadastrado toda página pública responde
404: nenhum host resolve pra tenant nenhum. `RUN_SEED=1` faz o build rodar
`prisma/seed.ts` depois das migrations, criando tenant, admin, campanhas de
exemplo e participantes.

**Remova a variável depois do primeiro deploy.** O seed é idempotente, então
repetir não duplica nada — mas build não é lugar de escrever dados.

## 3. Domínio

Em dev/preview (`localhost`, `*.vercel.app`) o tenant é resolvido por
fallback: pega o primeiro cadastrado. Com domínio próprio, cadastre os hosts
em `TenantHost` — o seed já cria `queotaskin.com`, `www.queotaskin.com` e
`admin.queotaskin.com`. Ajuste para o seu domínio real via painel ou SQL.

O painel admin pode viver em host separado (`admin.<dominio>`); veja
`src/proxy.ts` e `src/lib/admin-host.ts`.

## 4. Pagamentos

Nada de PIX funciona até configurar um gateway em **Admin → Configurações →
Pagamentos** (SyncPay ou CodePay). As credenciais são gravadas criptografadas
no `Tenant`, não em env var.

Para o webhook, defina `NEXT_PUBLIC_APP_URL` e o token do provedor
(`SYNCPAY_WEBHOOK_TOKEN` / `CODEPAY_WEBHOOK_TOKEN`); a URL a cadastrar no
gateway aparece na própria tela de pagamentos.

## 5. Cron

`vercel.json` não define cron ainda. A rota `/api/cron/expire-reservations`
libera números de reservas vencidas e deveria rodar de minuto em minuto —
sem ela, números só voltam pra rifa quando alguém dispara uma nova reserva.
Proteja com `CRON_SECRET`.
