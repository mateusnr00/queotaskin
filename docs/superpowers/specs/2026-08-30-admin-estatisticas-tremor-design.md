# Estatísticas do Admin (Início + Relatórios) com Tremor

Data: 2026-08-30
Branch: `claude/queota-skin-cs2-raffle-v2pv7n`

## Objetivo

Redesenhar as telas **Início** (`/admin`) e **Relatórios** (`/admin/relatorios`)
como um painel de estatísticas, usando **Tremor** (data-viz) re-tematizado ao
design system atual, e adicionando métricas que hoje faltam para uma operação
de rifa/skin.

## Decisões travadas (com o usuário)

- **Escopo:** redesign + novas métricas (não é só re-skin).
- **Tremor:** re-tematizado aos nossos tokens (não a paleta gray/blue padrão).
  Preserva tema claro/escuro e a **cor primária por tenant** (`--primary`).
- **Métricas novas:** funil de conversão, faturamento por canal/UTM, reservas
  em risco, progresso das campanhas, comparativo período-a-período.
- **Período:** seletor até **180 dias** (presets 7/30/90/180 + custom; teto 180).
  No **Início**, o período controla a **seção de análise inteira** (gráfico de
  vendas + funil + faturamento por canal). KPIs "hoje", reservas em risco,
  campanhas ativas e "última hora" seguem em **tempo real**.
- Intervalo longo **agrupa automático** (dia → semana → mês) conforme o tamanho.

## Wireframes (Excalidraw)

- Início v2: https://excalidraw.com/#json=WqzhW_GfqVkG_06ZfGaGu,Cb3o6cuztKJammCFSiPN_g
- Relatórios: https://excalidraw.com/#json=nu2dpRwZmni2ruhYhQ4hU,5K-A9dsKhuNmvdOElOiqSg

## Stack atual (confirmado)

- Next 16.2.6, React 19.2.4, Tailwind v4 (`@theme inline` + oklch CSS vars),
  shadcn/ui (style base-nova), lucide-react.
- **recharts 3.8.1 já instalado** e tematizado via `--chart-*` (o `SalesChart`).
- Tremor exige Tailwind v4.1+ e React 18.3+ → compatível. Charts do Tremor são
  construídos sobre recharts.

## Ponte de tema (o ponto central)

Tremor colore gráficos por chaves nomeadas (`AvailableChartColorsKeys`, ex.
`"blue"`) que resolvem para classes Tailwind via `getColorClassName`. Como os
componentes vêm copiados pro repo, editamos o mapa de cores do Tremor para usar
os utilitários que o `globals.css` **já expõe** no `@theme inline`
(`--color-chart-1..5`): `fill-chart-1`, `stroke-chart-1`, `text-chart-1`,
`bg-chart-1`, etc. Chave extra `primary` → `--primary` (laranja por tenant).

Superfícies (Card, títulos): reaproveitar os componentes **shadcn atuais** (já
tematizados). Do Tremor entram só as peças de data-viz re-tematizadas:
`AreaChart`, `BarChart`/`ComboChart`, `BarList`, `DonutChart`, `CategoryBar`,
`ProgressBar`, `BadgeDelta`.

## Dados (sem migration — tudo já existe e indexado)

- **Funil / conversão:** `VisitaDiaria` (visitas + visitantes distintos, por dia,
  por tenant) → `Reservation` criadas → `Reservation status=PAID`. Conversão =
  pagas / visitantes.
- **Faturamento por canal (UTM):** `Reservation.utmContent` guarda o canal na
  **venda** → `groupBy utmContent where status=PAID` (_sum totalAmount, _count).
  Rótulos via `CANAIS` (`src/lib/canais-de-campanha.ts`). Visitas por canal em
  `VisitaDeCampanha`.
- **Reservas em risco:** `status=PENDING` + `expiresAt` (índice `[status,
  expiresAt]`). Taxa de expiração = `EXPIRED / (PAID + EXPIRED)` na janela.
- **Progresso de campanha:** `Raffle.totalNumbers` vs `Ticket`s de reservas
  PAID, `status=ACTIVE`.
- **Método de pagamento:** `Payment.method` (`groupBy`).
- **Comparativo período-a-período:** `Reservation.paidAt` em buckets; período
  anterior = mesma duração imediatamente antes.

## Telas

### Início (`/admin`)
1. Banner (mantém).
2. KPIs "hoje" + BadgeDelta vs ontem + sparkline 7d: Faturamento, Reservas
   pagas, Ticket médio, **Conversão %** (nova). Tempo real.
3. **Bloco Análise** (seletor de período até 180d controla os 3):
   - Vendas no tempo (AreaChart/ComboChart, agrupa dia/semana/mês).
   - Funil de conversão (BarList).
   - Faturamento por canal/UTM (BarList).
4. **Bloco Operação/Agora** (tempo real):
   - Reservas em risco (DonutChart + R$ pendente + taxa de expiração).
   - Campanhas ativas (CategoryBar por sorteio, % vendido).
   - Top 5 compradores (mantém) + Vendas na última hora (mantém).

### Relatórios (`/admin/relatorios`)
1. Filtros: Tipo (auto), Sorteio, De, Até (**teto 180d**), Gerar (GET, mantém).
2. KPIs com BadgeDelta vs período anterior: Faturamento, Reservas pagas,
   Títulos vendidos, Ticket médio.
3. Gráfico principal: ComboChart (faturamento em barras + reservas em linha).
4. Faturamento por canal/UTM (BarList) + Método de pagamento (DonutChart).
5. Tabela detalhada (mantém, re-tematizada).

## Fases de implementação

- **Fase 1 — Tremor + ponte de tema.** Instalar/copiar Tremor; mapear cores pros
  `--chart-*`/`--primary`; migrar `SalesChart` como prova; build verde.
- **Fase 2 — Serviços de dados (TDD).** `estatisticas.ts` com funções puras e
  testáveis: funil/conversão, risco+expiração, faturamento por canal, progresso
  de campanha, série temporal com auto-bucket, comparativo período anterior.
- **Fase 3 — Início v2.** Montar as duas seções; seletor de período (URL).
- **Fase 4 — Relatórios.** ComboChart, KPIs comparativos, canal, método; manter
  tabela; aplicar teto de 180 dias.

## Fora de escopo (por ora)

- Fila de entregas de skins no painel (mencionado, não priorizado).
- Export CSV dos relatórios.
- Qualquer mudança de schema/migration.

## Verificação

- `npm run typecheck` e `npm test` verdes ao fim de cada fase.
- Conferir tema claro/escuro e a cor primária por tenant nos gráficos.
- Sanidade de dados via leitura no banco (SELECT) quando útil.
