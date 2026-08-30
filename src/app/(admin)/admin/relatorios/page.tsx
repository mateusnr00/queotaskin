import type { Metadata } from "next";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { formatBRL } from "@/lib/format";
import { StatDeHoje } from "@/components/admin/estatisticas/stat-de-hoje";
import { GraficoCombo } from "@/components/admin/estatisticas/grafico-combo";
import { ListaPorCanal } from "@/components/admin/estatisticas/lista-por-canal";
import { MetodoDonut } from "@/components/admin/estatisticas/metodo-donut";
import {
  serieDeVendas,
  faturamentoPorCanal,
  metodoDePagamento,
  totaisComparativo,
} from "@/server/services/estatisticas";
import { limitarIntervalo, type Granularidade } from "@/lib/periodo";

export const metadata: Metadata = { title: "Relatórios" };

const GRAN_LABEL: Record<Granularidade, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    raffleId?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;
  const raffleId = sp.raffleId === "all" ? undefined : sp.raffleId;

  // Padrão: últimos 30 dias. O intervalo é preso ao teto de 180 dias.
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const from0 = sp.from ? new Date(`${sp.from}T00:00:00`) : defaultFrom;
  const to0 = sp.to ? new Date(`${sp.to}T23:59:59.999`) : now;
  const { from, to } = limitarIntervalo(
    Number.isNaN(from0.getTime()) ? defaultFrom : from0,
    Number.isNaN(to0.getTime()) ? now : to0,
  );

  const recorte = { tenantId, from, to, raffleId };

  const [comparativo, serie, canais, metodos, raffleOptions] =
    await Promise.all([
      totaisComparativo(recorte),
      serieDeVendas(recorte),
      faturamentoPorCanal(recorte),
      metodoDePagamento(recorte),
      prisma.raffle.findMany({
        where: { tenantId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true },
      }),
    ]);

  const linhas = [...serie.pontos].reverse(); // tabela: mais recente primeiro

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Vendas confirmadas (PAGO), com comparativo e gráficos. Agrupamento
          automático por {GRAN_LABEL[serie.granularidade].toLowerCase()}.
        </p>
      </div>

      <form className="grid gap-3 md:grid-cols-4">
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            De
          </label>
          <Input
            type="date"
            name="from"
            defaultValue={isoDay(from)}
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Até (teto de 180 dias)
          </label>
          <Input
            type="date"
            name="to"
            defaultValue={isoDay(to)}
            className="mt-1"
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full md:w-auto">
            Gerar relatório
          </Button>
        </div>
      </form>

      {/* KPIs com delta vs período anterior de mesmo tamanho. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatDeHoje
          label="Faturamento"
          value={formatBRL(comparativo.atual.faturamento)}
          delta={comparativo.variacao.faturamento}
          hint={`antes: ${formatBRL(comparativo.anterior.faturamento)}`}
        />
        <StatDeHoje
          label="Reservas pagas"
          value={comparativo.atual.reservas.toLocaleString("pt-BR")}
          delta={comparativo.variacao.reservas}
          hint={`antes: ${comparativo.anterior.reservas.toLocaleString("pt-BR")}`}
        />
        <StatDeHoje
          label="Títulos vendidos"
          value={comparativo.atual.titulos.toLocaleString("pt-BR")}
          delta={comparativo.variacao.titulos}
          hint={`antes: ${comparativo.anterior.titulos.toLocaleString("pt-BR")}`}
        />
        <StatDeHoje
          label="Ticket médio"
          value={formatBRL(comparativo.atual.ticketMedio)}
          delta={comparativo.variacao.ticketMedio}
          hint={`antes: ${formatBRL(comparativo.anterior.ticketMedio)}`}
        />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Faturamento e reservas no tempo</h2>
        <GraficoCombo pontos={serie.pontos} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Faturamento por canal</h2>
          <ListaPorCanal canais={canais} />
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Método de pagamento</h2>
          <MetodoDonut metodos={metodos} />
        </Card>
      </div>

      {/* Tabela detalhada. */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{GRAN_LABEL[serie.granularidade]}</TableHead>
              <TableHead className="text-right">Reservas</TableHead>
              <TableHead className="text-right">Títulos</TableHead>
              <TableHead className="text-right">Faturamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-muted-foreground"
                >
                  Nenhuma venda no período selecionado.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((p) => (
                <TableRow key={p.chave}>
                  <TableCell className="font-medium">{p.rotulo}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.reservas.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p.titulos.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatBRL(p.faturamento)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
