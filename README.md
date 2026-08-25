# QuéOta Skin — Sorteios de skins de Counter-Strike 2

Plataforma de sorteios (rifas) nichada em skins de CS2: facas, luvas e
coberturas lendárias, com pagamento por PIX e entrega por oferta de troca
na Steam.

Construída sobre o motor de rifas do JobRifa (Next.js 16 + Postgres), com
uma camada de domínio própria do Counter-Strike descrita em
[Camada CS2](#camada-cs2).

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

## Camada CS2

O que diferencia o QuéOta Skin de uma plataforma de rifa genérica.

### Ficha da skin no prêmio

Cada `Prize` carrega os metadados do item: nome, **raridade** (as 8 faixas
do CS2, com as cores oficiais da Valve), **desgaste** (FN/MW/FT/WW/BS),
**float**, StatTrak™, Souvenir, valor de mercado, coleção e link de
inspeção no jogo. Todos os campos são opcionais — um prêmio que não é skin
(saldo, periférico) usa só a descrição e renderiza num card neutro.

Cadastro em **Admin → Sorteios → Editar → Prêmios**. Ao digitar o float, o
painel confere se o desgaste escolhido bate com as faixas oficiais e
oferece a correção em um clique.

### Destaque automático

`headlineSkin()` elege o prêmio de **maior raridade** como o destaque da
campanha. Num kit com faca, luvas e AK, quem abre a página é a luva
Extraordinária — e a moldura do bloco assume a cor dourada dela.

### Entrega na Steam

O participante cadastra o **link de troca** em `/minha-conta`. A validação
aceita apenas o formato exato que a Steam gera: um link truncado passaria
no cadastro e só falharia na hora de enviar a skin, que é o pior momento
para descobrir. Do link é derivado o **SteamID64**, útil para conferir que
o ganhador não trocou de conta entre a compra e o sorteio.

Depois do sorteio, **Admin → Entregas** lista cada campanha sorteada com o
ganhador, contato, link de troca copiável e os prêmios a enviar. A tela
sinaliza quem ainda não cadastrou o link e alerta quando o número
declarado não consta como vendido.

### Tema

O preset `cs2` (Admin → Personalizar tema) usa o laranja do HUD do
Counter-Strike, calibrado para o modo escuro.

### Onde mexer

| Arquivo | O quê |
|---|---|
| `src/lib/cs2.ts` | Cores, rótulos, faixas de float, validação de link de troca |
| `src/components/cs2/` | `SkinCard`, `SkinHero`, selos de raridade/desgaste |
| `src/components/admin/skin-prize-editor.tsx` | Cadastro da ficha da skin |
| `src/server/services/deliveries.ts` | Fila de entregas pós-sorteio |
| `src/lib/cs2.test.ts` | Testes da lógica de domínio |

## Sistema de rank

Progressão por gasto, pensada para recorrência: o jogador volta porque o
próximo nível está perto e porque campanhas exclusivas dependem dele.

### A escada

**Níveis 0 a 21**, como na Gamers Club, agrupados em sete faixas nomeadas
com o vocabulário das patentes do competitivo do CS — Prata, Prata Elite,
Nova de Ouro, Mestre Guardião, Águia Lendária, Supremo e Global Elite.

A curva é quadrática (`XP_STEP * L * (L+1) / 2`): o começo é rápido e o topo
é de longo prazo.

| Nível | XP | Equivale a |
|---|---|---|
| 1 | 100 | R$ 10 |
| 5 | 1.500 | R$ 150 |
| 10 | 5.500 | R$ 550 |
| 21 | 23.100 | R$ 2.310 |

**Acima do 21**, quatro patentes de prestígio na ordem da carreira de um
profissional — primeiro você assina com uma org, depois vira lenda de Major,
depois levanta o troféu e, no fim, entra pra história:

| Patente | XP | Equivale a |
|---|---|---|
| Pro Player | 40.000 | R$ 4.000 |
| Legend | 80.000 | R$ 8.000 |
| Campeão de Major | 150.000 | R$ 15.000 |
| GOAT | 300.000 | R$ 30.000 |

Toda a escada sai de `src/lib/rank.ts` — mudar limiares, ordem ou nomes é
mexer só naquele arquivo.

### Como o XP é creditado

**10 XP por real** gasto em números pagos (ajustável por tenant em
`Tenant.xpPerBrl`). Centavos são truncados: R$ 19,90 rende os mesmos 190 XP
que R$ 19,00.

O XP **não expira e não é gasto** — o nível é permanente. Um rank que cai
puniria quem parou de comprar, que é o oposto do objetivo.

### Integridade

`XpEntry` é um extrato e a **fonte da verdade**; `UserProgress.xp` é só o
total desnormalizado, para o ranking ordenar sem varrer o extrato.

Todo crédito roda dentro de uma transação com **advisory lock por (usuário,
tenant)** e o total é **recalculado a partir do extrato** depois do insert,
nunca incrementado a partir de uma leitura anterior. Sem isso, dois
pagamentos simultâneos do mesmo usuário leem o mesmo total antigo e o segundo
apaga o crédito do primeiro.

A idempotência é feita **consultando antes de inserir**, nunca capturando a
violação do índice único: no Postgres um statement que falha aborta a
transação inteira (SQLSTATE 25P02) e os comandos seguintes são recusados.
Consultar antes é seguro porque já estamos dentro do lock. O índice único
`(userId, reason, reservationId)` fica como rede de segurança.

`src/server/services/xp.integration.test.ts` cobre exatamente esses casos
contra um Postgres real — inclusive dez créditos concorrentes e a mesma
reserva creditada cinco vezes em paralelo. Ele só roda contra banco local.

### O ranking é interno

A lista de quem mais pontuou vive **só no painel** (`/admin/ranking`), nunca
no site público. Uma vitrine de quem gasta mais é convite a engenharia
social — e o operador precisa de telefone, gasto e última compra ao lado do
XP, o que num site aberto seria vazamento.

O participante continua vendo **o próprio** progresso em `/minha-conta`:
patente, barra até o próximo degrau e extrato de XP. O que ele não vê é a
posição relativa nem quem está acima dele.

### Campanhas exclusivas

`Raffle.minLevel` (1–21) restringe a campanha a quem alcançou aquele nível;
quem está em patente de prestígio passa em qualquer exigência. É o que dá
consequência ao rank — sem isso ele seria só um selo.

O bloqueio é decidido **no servidor**, em `createReservationAction`. A página
pública apenas mostra o aviso, e ele é escrito para motivar: *"Faltam 1.500
XP — cerca de R$ 150 em outras campanhas para liberar esta."*

### Linguagem visual

**A silhueta do selo sobe junto com a faixa.** Losango na Prata, pentágono
na Prata Elite, hexágono na Nova de Ouro, heptágono no Mestre Guardião,
octógono na Águia Lendária, decágono no Supremo — e o Global Elite fecha a
escada com o mesmo decágono, mas com um anel externo destacado. O prestígio
vira roseta com brilho, claramente fora da escala.

Isso é o que faz o rank ser legível em 26px e para quem não distingue
matizes: dá para reconhecer a faixa pelo contorno, antes da cor. Cada selo é
anel colorido por fora, miolo escuro por dentro e número branco no centro.

A geometria é gerada por `polygon(sides, inset, notch)` em `rank-badge.tsx`:
o mesmo polígono percorrido com recuos diferentes vira anel, corpo e miolo,
sem empilhar máscaras. `notch` puxa os vértices ímpares para dentro e
transforma o polígono em roseta.

Supremo e Global Elite têm a mesma contagem de lados de propósito — passar de
10 para 12 lados seria indistinguível numa lista; o anel é que separa os dois.

Cada componente tem **uma cor só**, a da faixa — e a paleta é dessaturada de
propósito. Uma lista de ranking com sete cores neon vira ruído; puxada para o
sóbrio, ela informa sem gritar.

A marca do sistema é a **aresta de acento à esquerda** do painel, no lugar de
borda colorida em volta. Números sempre em `JetBrains Mono` com `tabular-nums`,
para as colunas não dançarem entre linhas.

O ranking **não tem barra de progresso**: numa lista, uma barra "até o próximo
nível" mente para o olho — o GOAT apareceria cheio e o Campeão de Major quase
vazio logo abaixo dele. Lá o que ordena é XP e posição, então é isso que a
linha mostra. A barra fica no perfil, onde significa algo.

### Onde mexer

| Arquivo | O quê |
|---|---|
| `src/lib/rank.ts` | Curva, limiares, faixas, patentes, cores |
| `src/server/services/xp.ts` | Crédito, estorno, ajuste, ranking |
| `src/components/rank/rank-badge.tsx` | Selo hexagonal e barra |
| `src/components/rank/rank-chip.tsx` | Chip do header |
| `src/components/rank/rank-card.tsx` | Cartão do perfil e escada |
| `src/components/rank/rank-row.tsx` | Linha do ranking |
| `src/app/(admin)/admin/ranking/` | Ranking (painel) |

### Ainda não implementado

- **Estorno automático.** `reverseXpForReservation` está pronta e testada,
  mas a plataforma não tem fluxo de estorno (o status `REFUNDED` existe no
  enum e nada o aplica). Quando existir, chame a função no mesmo ponto.
- **Pontos gastáveis.** O SKNRS separa `xp` (permanente, define o nível) de
  `balance` (gastável, resgatável). Aqui só existe o XP. O extrato já
  comporta a segunda moeda quando fizer sentido.

## Pré-requisitos

- **Node.js 20.19+ ou 22+** (atualmente Node 20.18.1 está instalado — recomendo atualizar)
- npm 10+
- Conta no [Supabase](https://supabase.com) com um projeto criado
- (Opcional para Fase 1) Contas em: Mercado Pago, Resend, Upstash, Inngest

## Setup local — passo a passo

### 1. Clone e instale dependências

```bash
git clone <repo-url> queotaskin
cd queotaskin
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
