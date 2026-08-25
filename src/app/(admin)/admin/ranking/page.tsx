import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, MessageCircle } from "lucide-react";

import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { leaderboard } from "@/server/services/xp";
import { whatsappLink } from "@/server/services/customers";
import { RankBadge } from "@/components/rank/rank-badge";
import { rankFromXp } from "@/lib/rank";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/cpf";

export const metadata: Metadata = { title: "Ranking" };
export const dynamic = "force-dynamic";

// Ranking de XP dos participantes. Fica só aqui, no painel: uma lista
// pública de quem mais gasta é convite a engenharia social — e o operador
// precisa dos dados de contato junto, o que num site público seria vazamento.
export default async function AdminRankingPage() {
  const session = await getAdminOrThrow();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  const [rows, settings] = await Promise.all([
    leaderboard(tenantId, 100),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { rankEnabled: true, xpPerBrl: true },
    }),
  ]);

  const totalXp = rows.reduce((sum, row) => sum + row.xp, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.spent, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Ranking</h1>
          <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Ranking</span>
          </nav>
        </div>
        <p className="text-xs text-muted-foreground">
          R$ 1 pago = {settings?.xpPerBrl ?? 10} XP
          {settings?.rankEnabled === false && (
            <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-amber-500">
              rank desligado
            </span>
          )}
        </p>
      </div>

      {rows.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Participantes ranqueados" value={rows.length.toLocaleString("pt-BR")} />
          <Stat label="XP distribuído" value={totalXp.toLocaleString("pt-BR")} />
          <Stat label="Receita dos ranqueados" value={formatBRL(totalSpent)} />
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 text-center">#</TableHead>
              <TableHead>Participante</TableHead>
              <TableHead>Patente</TableHead>
              <TableHead className="text-right">XP</TableHead>
              <TableHead className="text-right">Gasto</TableHead>
              <TableHead className="text-center">Compras</TableHead>
              <TableHead>Última compra</TableHead>
              <TableHead className="w-12 text-right">Zap</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  Ninguém pontuou ainda. O primeiro número pago abre o ranking.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const rank = rankFromXp(row.xp);
                return (
                  <TableRow key={row.userId} className="hover:bg-muted/40">
                    <TableCell className="text-center font-mono text-xs text-muted-foreground tabular-nums">
                      {row.position}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/usuarios/${row.userId}/editar`}
                        className="block max-w-56 truncate text-sm font-medium hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.phone ? formatPhone(row.phone) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <RankBadge rank={rank} size="sm" />
                        <span className="text-xs font-semibold">{rank.tierName}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold tabular-nums">
                      {row.xp.toLocaleString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold text-emerald-500 tabular-nums">
                      {formatBRL(row.spent)}
                    </TableCell>
                    <TableCell className="text-center text-sm tabular-nums">
                      {row.paidReservations}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.lastPurchaseAt ? formatDate(row.lastPurchaseAt) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* O contato fica aqui e só aqui: é a lista de quem
                          vale a pena chamar quando entra campanha nova. */}
                      {whatsappLink(row.phone) ? (
                        <a
                          href={whatsappLink(row.phone)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Conversar com ${row.name} no WhatsApp`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/10"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      {rows.length === 100 && (
        <p className="text-center text-xs text-muted-foreground">
          Mostrando os 100 primeiros por XP.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="font-mono text-xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
