import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Trophy } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { maskName } from "@/lib/mask";
import { rankFromXp } from "@/lib/rank";
import { RankBadge } from "@/components/rank/rank-badge";
import { leaderboard, leaderboardPosition } from "@/server/services/xp";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Ranking",
  description: "Os participantes com mais XP na plataforma.",
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default async function RankingPage() {
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const settings = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { rankEnabled: true, xpPerBrl: true },
  });
  if (!settings?.rankEnabled) notFound();

  const session = await auth();
  const [rows, myPosition] = await Promise.all([
    leaderboard(tenant.id, 50),
    session?.user?.id
      ? leaderboardPosition(session.user.id, tenant.id)
      : Promise.resolve(null),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <header>
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Trophy className="h-6 w-6 text-amber-500" />
          Ranking
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada R$ 1 em números pagos vale {settings.xpPerBrl} XP. O rank é
          permanente — XP não expira.
        </p>
      </header>

      {myPosition != null && myPosition > 50 && (
        <p className="rounded-xl border bg-muted/40 px-4 py-3 text-sm">
          Você está em <strong>{myPosition}º</strong>. Continue participando para
          entrar no top 50.
        </p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          Ninguém pontuou ainda. O primeiro número pago abre o ranking.
        </div>
      ) : (
        <ol className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((row) => {
            const isMe = session?.user?.id === row.userId;
            const rank = rankFromXp(row.xp);
            return (
              <li
                key={row.userId}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  isMe && "bg-primary/10",
                )}
              >
                <span className="w-8 shrink-0 text-center text-sm font-bold tabular-nums text-muted-foreground">
                  {MEDALS[row.position - 1] ?? `${row.position}º`}
                </span>

                <RankBadge rank={rank} size="md" showLabel={false} />

                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {isMe ? "Você" : maskName(row.name)}
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold tabular-nums">
                    {row.xp.toLocaleString("pt-BR")}
                  </span>
                  <span className="block text-[0.65rem] text-muted-foreground">
                    {rank.label}
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
