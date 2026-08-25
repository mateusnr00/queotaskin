# Deploy

Produção roda na branch `main`. O build executa
`prisma generate → scripts/migrate-deploy.mjs → next build`; o script do meio
aplica as migrations e, no primeiro deploy, popula o banco.

## 1. Banco (Supabase)

Projeto: **queota-skin** · região `us-east-1` · Postgres 17.

**Use o usuário `postgres`.** Papéis criados por SQL não funcionam através do
pooler: o Supavisor mantém a própria lista de usuários por projeto e só o
`postgres` está registrado nela. Um papel customizado existe no Postgres mas o
pooler responde `FATAL: tenant/user <papel>.<ref> not found`.

Para menor privilégio seria preciso registrar o papel no pooler pelo painel do
Supabase, ou conectar direto — e a conexão direta é IPv6, que a Vercel não
alcança.

As duas connection strings saem de **Supabase → Project Settings → Database →
Connection string**. Use a senha do banco definida na criação do projeto (ou
gerada em **Reset database password**):

```
# App (pooler em transaction mode — é o que serverless precisa)
DATABASE_URL="postgresql://postgres.<PROJECT_REF>:<SENHA>@aws-<N>-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Migrations (session mode — migration não roda em transaction pooler)
DIRECT_URL="postgresql://postgres.<PROJECT_REF>:<SENHA>@aws-<N>-us-east-1.pooler.supabase.com:5432/postgres"
```

O prefixo `aws-<N>` varia por projeto (`aws-0`, `aws-1`...). Copie o host
exato do painel; o resto do formato é este.

> O host direto (`db.<ref>.supabase.co`) resolve **só em IPv6**. Se o ambiente
> de build não tiver IPv6, use o pooler nas duas variáveis, como acima.

## 2. Variáveis na Vercel

Escopo **Production**. Gere os segredos com `openssl rand -base64 32`.

**Obrigatórias** — sem qualquer uma delas o site não sobe:

| Variável | Valor |
|---|---|
| `DATABASE_URL` | pooler, porta 6543 (acima) |
| `DIRECT_URL` | pooler, porta 5432 (acima) |
| `AUTH_SECRET` | `openssl rand -base64 32` |

**Primeiro deploy** — criam o admin e populam o banco, depois podem sair:

| Variável | Valor |
|---|---|
| `SEED_ADMIN_NAME` | seu nome completo — é metade do login do admin |
| `SEED_ADMIN_PHONE` | seu celular com DDD, só dígitos (10 ou 11) |
| `RUN_SEED` | `1` |

**Upload de imagens** — sem as três, o botão de enviar capa responde
"Supabase Storage não está configurado":

| Variável | Onde achar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → Data API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` (secreta) |
| `SUPABASE_STORAGE_BUCKET` | nome do bucket, ex. `raffle-images` |

O bucket precisa existir e ser **público** (o site mostra as capas para
visitante deslogado). A escrita não depende de política: a service role
ignora RLS e vive só no servidor. Para criar do zero:

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('raffle-images', 'raffle-images', true, 10485760,
        ARRAY['image/png','image/jpeg','image/jpg','image/webp','image/gif']);

CREATE POLICY "raffle_images_public_read"
  ON storage.objects FOR SELECT USING (bucket_id = 'raffle-images');
```

> A `SERVICE_ROLE_KEY` dá acesso total ao banco, ignorando RLS. Ela é
> server-only — nunca prefixe com `NEXT_PUBLIC_`, ou vai parar no bundle do
> navegador.

**Recomendadas** — o site sobe sem elas, mas alguma função fica capenga:

| Variável | Para quê |
|---|---|
| `PAYMENT_SECRET_ENCRYPTION_KEY` | salvar credenciais de PIX no painel |
| `NEXT_PUBLIC_APP_URL` | montar a URL do webhook do gateway |
| `CRON_SECRET` | proteger a rota de expiração de reservas |

`AUTH_URL`, `NEXTAUTH_URL` e `NEXT_PUBLIC_APP_NAME` não precisam ser
definidas: o Auth.js detecta a URL pela `VERCEL_URL`, e o nome do site vem do
`Tenant` no banco.

`PAYMENT_SECRET_ENCRYPTION_KEY` criptografa as credenciais de PIX gravadas
pelo painel. Trocá-la depois torna ilegível o que já foi salvo.

O login do admin é **nome + celular**, sem senha. Os dois valores vêm de
`SEED_ADMIN_NAME` e `SEED_ADMIN_PHONE` — use os seus, não os de exemplo.

> Se `DATABASE_URL` ou `DIRECT_URL` faltarem no escopo **Production**, o build
> falha de propósito, com a lista do que está faltando. Antes ele passava em
> silêncio e publicava um site que respondia 500 em toda página — build verde
> escondendo deploy quebrado.

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
