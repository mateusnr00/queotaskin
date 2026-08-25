# JobRifa — Sistema de Rifas/Sorteios Online

Plataforma de rifas online (marca branca), single-tenant, construída em Next.js 16 + Supabase Postgres.

## Stack

- **Framework**: Next.js 16 (App Router, Server Actions, Cache Components, Turbopack)
- **Linguagem**: TypeScript (strict)
- **Banco**: PostgreSQL via Supabase
- **ORM**: Prisma 6
- **Auth**: Auth.js v5 (NextAuth) com Prisma adapter + credentials
- **UI**: Tailwind CSS v4 + shadcn/ui
- **Validação**: Zod
- **Forms**: react-hook-form + `@hookform/resolvers/zod`
- **Storage**: Supabase Storage (Fase 2)
- **Pagamentos**: Mercado Pago (Fase 2)
- **Email**: Resend (Fase 2)
- **Jobs / Cron**: Vercel Cron (atual) → Inngest (Fase 2)
- **PDF**: `@react-pdf/renderer` (Fase 2)
- **Testes**: Vitest

## Pré-requisitos

- **Node.js 20.19+ ou 22+** (atualmente Node 20.18.1 está instalado — recomendo atualizar)
- npm 10+
- Conta no [Supabase](https://supabase.com) com um projeto criado
- (Opcional para Fase 1) Contas em: Mercado Pago, Resend, Upstash, Inngest

## Setup local — passo a passo

### 1. Clone e instale dependências

```bash
git clone <repo-url> rifa-system
cd rifa-system
npm install
```

### 2. Configure variáveis de ambiente

Copie o `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Mínimo necessário pra rodar a Fase 1:

- `DATABASE_URL` — string com pooler do Supabase (porta 6543)
- `DIRECT_URL` — string sem pooler (porta 5432), usada pelo Prisma para migrations
- `AUTH_SECRET` — gere com `openssl rand -base64 32` ou `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
- `AUTH_URL` — em dev: `http://localhost:3000`
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` — credenciais do admin criado pelo seed

Encontre as strings do Supabase em **Project Settings → Database → Connection string**.

### 3. Crie as tabelas no banco

```bash
npm run db:migrate
```

Isso roda `prisma migrate dev`, que:
1. Lê `prisma/schema.prisma`
2. Compara com o estado atual do banco
3. Cria um arquivo de migration em `prisma/migrations/`
4. Aplica no banco

Da primeira vez, ele vai pedir um nome pra migration (algo como `init`).

### 4. Popule com dados iniciais

```bash
npm run db:seed
```

Cria:
- 1 usuário **ADMIN** (credenciais vêm das envs `SEED_ADMIN_*`)
- 1 rifa de exemplo em `/sorteios/rifa-exemplo`
- Linha de `SiteSettings` (singleton)

### 5. Rode o servidor de dev

```bash
npm run dev
```

Acesse:
- Site público: <http://localhost:3000>
- Login: <http://localhost:3000/login>
- Admin: <http://localhost:3000/admin> (logue com o admin do seed)

## Scripts úteis

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run start` | Roda o build |
| `npm run lint` | ESLint |
| `npm run typecheck` | Verifica tipos sem gerar saída |
| `npm test` | Roda Vitest |
| `npm run test:watch` | Vitest em modo watch |
| `npm run db:generate` | Gera o cliente Prisma a partir do schema |
| `npm run db:migrate` | Cria + aplica migration (dev) |
| `npm run db:migrate:deploy` | Aplica migrations já existentes (prod) |
| `npm run db:reset` | **APAGA** o banco e re-aplica migrations + seed |
| `npm run db:seed` | Popula com dados iniciais |
| `npm run db:studio` | UI visual do Prisma para inspecionar dados |

## Estrutura

```
src/
  app/
    (public)/          # site público
      page.tsx           → home
      sorteios/
        page.tsx         → lista de sorteios
        [slug]/page.tsx  → detalhe + form de reserva
      comprovante/[reservationId]/page.tsx
    (auth)/
      login/page.tsx
      registro/page.tsx
    (admin)/
      admin/
        layout.tsx       → sidebar + auth guard
        page.tsx         → dashboard
        sorteios/
          page.tsx       → listagem
          novo/page.tsx
          [id]/editar/page.tsx
    api/
      auth/[...nextauth]/route.ts
      cron/expire-reservations/route.ts
  auth.config.ts       # config edge-safe (middleware)
  auth.ts              # config completa (Prisma + bcrypt)
  middleware.ts        # roteia auth nas requests
  components/
    ui/                # shadcn primitives
    public/            # header, reservation form
    admin/             # raffle form, status actions
    forms/             # login, register
  lib/
    db.ts              # Prisma client singleton
    auth-helpers.ts    # requireAuth, requireAdmin
    cpf.ts             # validação + format
    slug.ts
    format.ts          # BRL, datas
    errors.ts          # erros de domínio
    validations/       # schemas Zod
  server/
    actions/           # Server Actions (auth, raffles, reservations)
    services/          # lógica de negócio (raffles, reservations)
prisma/
  schema.prisma
  seed.ts
```

## Decisões importantes

### Modelo de Tickets "Lazy"
A tabela `Ticket` **não** recebe uma linha por número quando a rifa é criada. Numa rifa de 1 milhão de números, isso seria absurdo. Em vez disso, só inserimos uma linha quando o número é reservado/pago. A ausência de linha = número AVAILABLE.

O `@@unique([raffleId, number])` é o que garante que dois usuários simultâneos não consigam reservar o mesmo número — o segundo INSERT falha com erro de constraint, a transação rolla, e o sistema avisa o usuário.

### Auth com 2 arquivos (edge-safe + Node)
O middleware do Next.js roda em edge runtime, onde Prisma e bcrypt não funcionam. Por isso a config do NextAuth é dividida:
- `auth.config.ts` — só callbacks e rotas, sem Prisma. Usado pelo middleware.
- `auth.ts` — config completa com adapter Prisma e provider Credentials. Usado pelas Server Actions.

### Server Actions vs API Routes
- **Server Actions** para tudo que vem de formulários do app (login, registro, criação de rifa, reserva).
- **API Routes** apenas para webhooks (Mercado Pago) e callbacks externos (NextAuth, Cron).

### Concorrência segura na reserva
A função `createReservation` em `src/server/services/reservations.ts` usa uma transação Prisma com `createMany`. Se qualquer ticket colidir, a transação rolla e devolvemos um `ReservationConflictError` listando os números que estão em conflito.

### CPF como dígitos
CPF é armazenado somente como 11 dígitos (sem ponto/traço). A formatação fica na camada de UI via `formatCpf()`.

## Fases do projeto

- **Fase 1 (MVP — atual)**: auth + admin de rifas (aba Geral) + público + reserva sem pagamento + expiração via cron.
- **Fase 2**: Mercado Pago (Checkout Pro + Pix) + webhooks + PDF de comprovante + email transacional (Resend) + upload de imagens (Supabase Storage) + aba Imagens no admin.
- **Fase 3**: Sorteio baseado em Loteria Federal + sorteio próprio com semente verificável + página de resultados.
- **Fase 4**: Afiliados + comissões + promoções/combos + links UTM/desconto.
- **Fase 5**: Restante do admin (FAQ, anúncios, termos, privacidade, sobre, temas, relatórios) + filantropia.

## Segurança

- Senhas: bcrypt cost 12.
- Validação dupla: cliente (UX) + servidor (Zod em toda Server Action).
- CSRF: protegido nativamente pelas Server Actions do Next.js.
- SQL Injection: impossível via Prisma (queries parametrizadas).
- Webhooks: HMAC do Mercado Pago será validado na Fase 2.
- Idempotência: tabela `PaymentWebhookEvent` com `@@unique([provider, externalId])`.
- Rate limit: a wirar com Upstash Redis em endpoints públicos.
- Cron: header `Authorization: Bearer $CRON_SECRET` exigido.
- LGPD: dados pessoais (CPF, telefone) tratados explicitamente; usuário pode (Fase 5) solicitar exclusão.

## Deploy

A aplicação é compatível com Vercel. Para deployar:

1. Conecte o repo no Vercel.
2. Configure as envs (todas do `.env.example`) em **Project Settings → Environment Variables**.
3. O Vercel detecta Next.js automaticamente.
4. Em **Functions**, garanta que `CRON_SECRET` esteja setado — o Vercel Cron usa pra autenticar.
5. O `vercel.json` declara o cron a cada 5 min para expirar reservas.

## Licença

Privada — uso interno.
