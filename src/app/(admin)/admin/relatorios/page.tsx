import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import Link from "next/link";
import {
  BarChart3,
  CalendarRange,
  Coins,
  FileSearch,
  Receipt,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Etiqueta, Moldura, Placa } from "@/components/admin/moldura";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/format";

export const metadata: Metadata = { title: "Relatórios" };

type GroupKey = "day" | "week" | "month";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Calcula a chave de agrupamento (segunda-feira da semana ISO) para uma data.
// Padrão ISO 8601: semana começa na segunda.
function isoWeek(d: Date): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 1); // segunda da mesma semana
  return date.toISOString().slice(0, 10);
}

function isoMonth(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

const GROUP_LABEL: Record<GroupKey, string> = {
  day: "Dia",
  week: "Semana",
  month: "Mês",
};

function formatBucketLabel(bucket: string, group: GroupKey): string {
  if (group === "month") {
    const [y, m] = bucket.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(date);
  }
  const date = new Date(bucket + "T00:00:00Z");
  if (group === "week") {
    return "Sem. iniciada em " + new Intl.DateTimeFormat("pt-BR").format(date);
  }
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

const num = (n: number) => n.toLocaleString("pt-BR");

/** "1 reserva", "2 reservas". Plural fixo é o tipo de descuido que se lê. */
const plural = (n: number, um: string, muitos: string) =>
  `${num(n)} ${n === 1 ? um : muitos}`;

/**
 * A composição do período, em barra.
 *
 * A tabela diz os números; a barra diz a proporção, que é o que se procura num
 * relatório antes de qualquer conta: qual período pesou mais e quanto dele foi
 * embora em custo. A largura é relativa ao maior faturamento da lista, então
 * a comparação entre linhas é visual e não exige ler doze valores.
 */
function Barra({
  total,
  custo,
  maximo,
}: {
  total: number;
  custo: number;
  maximo: number;
}) {
  if (maximo <= 0 || total <= 0) return null;
  const largura = Math.max(2, (total / maximo) * 100);
  // A fatia de custo é medida dentro do próprio faturamento do período. Custo
  // maior que o faturamento (dia de entrega sem venda) satura em 100%: passar
  // disso desenharia uma barra maior do que a do período campeão.
  const fatiaDeCusto = Math.min(100, (custo / total) * 100);
  return (
    <div
      className="mt-1.5 h-1 w-full max-w-[220px] overflow-hidden rounded-full bg-white/[0.05]"
      aria-hidden
    >
      <div className="h-full rounded-full" style={{ width: `${largura}%` }}>
        <div className="flex h-full w-full">
          <div
            className="h-full bg-amber-500/70"
            style={{ width: `${fatiaDeCusto}%` }}
          />
          <div className="h-full flex-1 bg-emerald-500/70" />
        </div>
      </div>
    </div>
  );
}

/** Um número de contexto na faixa de volume. */
function Volume({
  rotulo,
  valor,
  icone,
}: {
  rotulo: string;
  valor: string;
  icone: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {icone}
        {rotulo}
      </span>
      <span className="text-lg font-black tabular-nums">{valor}</span>
    </div>
  );
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    group?: string;
    raffleId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;
  const group = (
    ["day", "week", "month"].includes(sp.group ?? "") ? sp.group : "day"
  ) as GroupKey;
  const raffleId = sp.raffleId === "all" ? undefined : sp.raffleId;

  // Padrão: últimos 30 dias.
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);

  const from = sp.from ? new Date(sp.from) : defaultFrom;
  const to = sp.to ? new Date(sp.to + "T23:59:59") : now;

  // Carrega reservas PAGAS no intervalo. Considera apenas as confirmadas;
  // pendentes/expiradas não contam como venda. Filtra pelo tenant atual.
  const where: Prisma.ReservationWhereInput = {
    status: "PAID",
    paidAt: { gte: from, lte: to },
    raffle: { tenantId },
    ...(raffleId && { raffleId }),
  };

  // O CUSTO DAS SKINS, no mesmo intervalo.
  //
  // O gasto é lançado na data em que a skin SAIU. Quando não há data de envio,
  // que é o caso de prêmio pago em Pix, cai na data do sorteio: o dinheiro saiu
  // por causa daquela campanha, e deixá-lo fora do relatório mostraria lucro
  // que não existe.
  const custoWhere: Prisma.RaffleWhereInput = {
    tenantId,
    deliveryCost: { not: null },
    ...(raffleId && { id: raffleId }),
    OR: [
      { deliveredAt: { gte: from, lte: to } },
      { deliveredAt: null, winnerDrawnAt: { gte: from, lte: to } },
    ],
  };

  const [reservations, raffleOptions, entregas, tenant] = await Promise.all([
    prisma.reservation.findMany({
      where,
      orderBy: { paidAt: "asc" },
      select: {
        paidAt: true,
        totalAmount: true,
        _count: { select: { tickets: true } },
      },
    }),
    prisma.raffle.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true },
    }),
    prisma.raffle.findMany({
      where: custoWhere,
      select: {
        deliveryCost: true,
        deliveryFxRate: true,
        deliveredAt: true,
        winnerDrawnAt: true,
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cnyToBrl: true },
    }),
  ]);

  // O custo é gravado em YUAN, e cada entrega carrega o PTAX do dia em que ela
  // saiu. A taxa do painel é a rede de segurança, para as linhas gravadas antes
  // de o câmbio por entrega existir e para o dia em que o Olinda falhou.
  //
  // Converter linha a linha é o que torna o fechamento estável: pela taxa
  // global, atualizá-la reconverteria o gasto de julho pelo câmbio de hoje, e o
  // mês fechado mudaria de valor sem ninguém ter mexido nele.
  const taxaDoPainel =
    tenant?.cnyToBrl != null && Number(tenant.cnyToBrl) > 0
      ? Number(tenant.cnyToBrl)
      : null;

  // Agrega in-memory pelo bucket escolhido.
  // Para escalar (centenas de milhares de reservas), trocar pra query SQL
  // com date_trunc, Prisma raw query. Por enquanto JS é suficiente.
  const bucketKeyFn =
    group === "day" ? isoDay : group === "week" ? isoWeek : isoMonth;

  const buckets = new Map<
    string,
    { count: number; tickets: number; total: number; custo: number }
  >();
  const vazio = () => ({ count: 0, tickets: 0, total: 0, custo: 0 });

  for (const r of reservations) {
    if (!r.paidAt) continue;
    const key = bucketKeyFn(r.paidAt);
    const entry = buckets.get(key) ?? vazio();
    entry.count += 1;
    entry.tickets += r._count.tickets;
    entry.total += Number(r.totalAmount);
    buckets.set(key, entry);
  }

  // O custo entra nos mesmos baldes do faturamento, para a linha do período
  // mostrar as duas pontas lado a lado.
  let custoEmYuan = 0;
  let custoEmReais = 0;
  /** O que não teve como converter: nem boletim próprio, nem taxa no painel. */
  let yuanSemTaxa = 0;
  for (const e of entregas) {
    const quando = e.deliveredAt ?? e.winnerDrawnAt;
    if (!quando) continue;
    const emYuan = Number(e.deliveryCost);
    custoEmYuan += emYuan;

    const daLinha =
      e.deliveryFxRate != null && Number(e.deliveryFxRate) > 0
        ? Number(e.deliveryFxRate)
        : null;
    const taxa = daLinha ?? taxaDoPainel;
    if (taxa == null) {
      yuanSemTaxa += emYuan;
      continue;
    }
    const emReais = emYuan * taxa;
    custoEmReais += emReais;
    const key = bucketKeyFn(quando);
    const entry = buckets.get(key) ?? vazio();
    entry.custo += emReais;
    buckets.set(key, entry);
  }

  const rows = Array.from(buckets.entries()).sort(
    ([a], [b]) => (a < b ? 1 : -1), // mais recente primeiro
  );
  const maiorFaturamento = rows.reduce((m, [, d]) => Math.max(m, d.total), 0);

  const totalReservations = reservations.length;
  const totalTickets = reservations.reduce(
    (acc, r) => acc + r._count.tickets,
    0,
  );
  const totalRevenue = reservations.reduce(
    (acc, r) => acc + Number(r.totalAmount),
    0,
  );
  // Traço quando NADA converteu: R$ 0,00 com custo em yuan na tela seria a
  // tela afirmando que a premiação saiu de graça. Quando parte converteu, o
  // total mostra o que dá e o aviso diz o que ficou de fora.
  const totalCusto =
    yuanSemTaxa > 0 && custoEmReais === 0 ? null : custoEmReais;
  const resultado = totalCusto == null ? null : totalRevenue - totalCusto;
  // Margem sobre o faturamento. Sem faturamento não há percentual: dividir por
  // zero daria Infinity na tela.
  const margem =
    resultado == null || totalRevenue === 0
      ? null
      : (resultado / totalRevenue) * 100;

  // Atalhos de período. Escolher "últimos 7 dias" com dois seletores de data é
  // trabalho de calendário para uma pergunta que se faz o tempo todo.
  const desde = (dias: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - dias);
    return d;
  };
  const inicioDoMes = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const atalhos: { rotulo: string; de: Date; ate: Date }[] = [
    { rotulo: "7 dias", de: desde(7), ate: now },
    { rotulo: "30 dias", de: desde(30), ate: now },
    { rotulo: "90 dias", de: desde(90), ate: now },
    { rotulo: "Este mês", de: inicioDoMes, ate: now },
  ];
  const href = (de: Date, ate: Date) => {
    const q = new URLSearchParams({ group, from: isoDay(de), to: isoDay(ate) });
    if (raffleId) q.set("raffleId", raffleId);
    return `/admin/relatorios?${q.toString()}`;
  };
  const deAtual = isoDay(from);
  const ateAtual = isoDay(to);

  const rotuloDoSorteio = raffleId
    ? (raffleOptions.find((r) => r.id === raffleId)?.title ??
      "Todos os sorteios")
    : "Todos os sorteios";

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div>
          <Etiqueta icone={<BarChart3 aria-hidden className="h-3 w-3" />}>
            Financeiro
          </Etiqueta>
          <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendas confirmadas e o custo das skins entregues, no período
            escolhido.
          </p>
        </div>
      </header>

      {/* Filtros, na mesma moldura das outras telas do painel. Soltos no fundo
          eles pareciam três controles largados antes do conteúdo. */}
      <Moldura>
        <form className="divide-y divide-white/[0.06]">
          <div className="flex flex-wrap items-center gap-1.5 px-3 py-2.5 md:px-4">
            <span className="mr-1 flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
              <CalendarRange aria-hidden className="h-3.5 w-3.5" />
              Período
            </span>
            {atalhos.map((a) => {
              const ativo =
                isoDay(a.de) === deAtual && isoDay(a.ate) === ateAtual;
              return (
                <Link
                  key={a.rotulo}
                  href={href(a.de, a.ate)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                    ativo
                      ? "border-red-500/40 bg-red-500/15 text-red-300"
                      : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                  )}
                >
                  {a.rotulo}
                </Link>
              );
            })}
          </div>

          <div className="grid gap-3 px-3 py-3 sm:grid-cols-2 md:px-4 lg:grid-cols-4">
            <div>
              <label className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                Agrupar por
              </label>
              <Select name="group" defaultValue={group}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue
                    labels={{
                      day: "Dia",
                      week: "Semana",
                      month: "Mês",
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Dia</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mês</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                Sorteio
              </label>
              <Select name="raffleId" defaultValue={raffleId ?? "all"}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue
                    labels={{
                      all: "Todos os sorteios",
                      ...Object.fromEntries(
                        raffleOptions.map((r) => [r.id, r.title]),
                      ),
                    }}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os sorteios</SelectItem>
                  {raffleOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                De
              </label>
              <Input
                type="date"
                name="from"
                defaultValue={deAtual}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                Até
              </label>
              <Input
                type="date"
                name="to"
                defaultValue={ateAtual}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between md:px-4">
            <p className="text-xs text-muted-foreground">
              {rotuloDoSorteio}, agrupado por {GROUP_LABEL[group].toLowerCase()}
              .
            </p>
            <Button type="submit" className="w-full sm:w-auto">
              Gerar relatório
            </Button>
          </div>
        </form>
      </Moldura>

      {yuanSemTaxa > 0 && (
        <p className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {yuanSemTaxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}{" "}
          yuan de custo ficaram de fora do resultado: essas entregas não têm o
          câmbio do dia gravado e não há taxa cadastrada no painel. Cadastre em
          Entregas, no botão Taxas.
        </p>
      )}

      {/* Os três números que respondem a pergunta da tela, em destaque. */}
      <div className="grid gap-3 md:grid-cols-3">
        <Placa
          rotulo="Faturamento"
          valor={formatBRL(totalRevenue)}
          nota="vendas confirmadas"
          icone={<Wallet className="h-3.5 w-3.5" />}
          destaque
        />
        <Placa
          rotulo="Custo das skins"
          valor={totalCusto == null ? "-" : formatBRL(totalCusto)}
          nota={`¥ ${custoEmYuan.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} pelo PTAX do dia de cada entrega`}
          icone={<Coins className="h-3.5 w-3.5" />}
          tom="custo"
          destaque
        />
        {/* Zero não é lucro: verde num período sem lançamento nenhum diz que
            deu certo, quando o que houve foi nada acontecer. */}
        <Placa
          rotulo="Resultado"
          valor={resultado == null ? "-" : formatBRL(resultado)}
          nota={
            margem == null
              ? "faturamento menos custo"
              : `margem de ${margem.toFixed(1).replace(".", ",")}%`
          }
          icone={<TrendingUp className="h-3.5 w-3.5" />}
          tom={
            resultado == null || resultado === 0
              ? "neutro"
              : resultado > 0
                ? "bom"
                : "ruim"
          }
          destaque
        />
      </div>

      {/* O volume por trás deles vai numa faixa, não em placas do tamanho das
          de cima: é contexto, e em cartão grande dois números pequenos ficam
          boiando no vazio, com o mesmo peso da resposta que a tela dá. */}
      <div className="grid grid-cols-2 divide-x divide-white/[0.06] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <Volume
          rotulo="Reservas pagas"
          valor={num(totalReservations)}
          icone={<Receipt aria-hidden className="h-3.5 w-3.5" />}
        />
        <Volume
          rotulo="Títulos vendidos"
          valor={num(totalTickets)}
          icone={<Ticket aria-hidden className="h-3.5 w-3.5" />}
        />
      </div>

      {rows.length === 0 ? (
        <Moldura>
          <div className="px-4 py-14 text-center">
            <FileSearch
              aria-hidden
              className="mx-auto h-8 w-8 text-muted-foreground/30"
              strokeWidth={1.5}
            />
            <p className="mt-3 text-sm font-semibold">
              Nenhum lançamento no período.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Escolha outro intervalo ou tire o filtro de sorteio.
            </p>
          </div>
        </Moldura>
      ) : (
        <>
          {/* Tabela no desktop. Seis colunas de números numa tela de 390px
              viram rolagem lateral, e quem arrasta perde de vista a linha. */}
          <Moldura className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[26%]">
                    {GROUP_LABEL[group]}
                  </TableHead>
                  <TableHead className="text-right">Reservas</TableHead>
                  <TableHead className="text-right">Títulos</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                  <TableHead className="text-right">Custo</TableHead>
                  <TableHead className="text-right">Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(([bucket, data]) => {
                  const linha = data.total - data.custo;
                  return (
                    <TableRow
                      key={bucket}
                      className="transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    >
                      <TableCell className="align-middle">
                        <span className="text-sm font-semibold">
                          {formatBucketLabel(bucket, group)}
                        </span>
                        <Barra
                          total={data.total}
                          custo={data.custo}
                          maximo={maiorFaturamento}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {num(data.count)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {num(data.tickets)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatBRL(data.total)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          data.custo > 0
                            ? "text-amber-400"
                            : "text-muted-foreground",
                        )}
                      >
                        {data.custo > 0 ? formatBRL(data.custo) : "-"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-bold tabular-nums",
                          linha >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {formatBRL(linha)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Moldura>

          {/* Cartões no celular: cada período é um bloco fechado. */}
          <div className="space-y-3 md:hidden">
            {rows.map(([bucket, data]) => {
              const linha = data.total - data.custo;
              return (
                <Moldura key={bucket}>
                  <div className="space-y-2.5 p-3">
                    <div>
                      <p className="text-sm font-bold">
                        {formatBucketLabel(bucket, group)}
                      </p>
                      <Barra
                        total={data.total}
                        custo={data.custo}
                        maximo={maiorFaturamento}
                      />
                    </div>

                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                          Faturamento
                        </p>
                        <p className="text-lg font-black tabular-nums">
                          {formatBRL(data.total)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                          Custo
                        </p>
                        <p
                          className={cn(
                            "text-lg font-black tabular-nums",
                            data.custo > 0
                              ? "text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {data.custo > 0 ? formatBRL(data.custo) : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                      <span className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
                        Resultado
                      </span>
                      <span
                        className={cn(
                          "text-base font-black tabular-nums",
                          linha >= 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        {formatBRL(linha)}
                      </span>
                    </div>

                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {plural(data.count, "reserva", "reservas")},{" "}
                      {plural(data.tickets, "título", "títulos")}
                    </p>
                  </div>
                </Moldura>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
