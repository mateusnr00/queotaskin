import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { maskName } from "@/lib/mask";
import { RankRow } from "@/components/rank/rank-row";
import { leaderboard, leaderboardPosition } from "@/server/services/xp";

export const metadata: Metadata = {
  title: "Ranking",
  description: "Os participantes com mais XP na plataforma.",
};

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
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Ranking</h1>
          <p className="text-sm text-muted-foreground">
            R$ 1 em números pagos = {settings.xpPerBrl} XP. O rank não expira.
          </p>
        </div>
        {myPosition != null && (
          <span className="font-mono text-xs text-muted-foreground">
            você: <b className="font-bold text-foreground">{myPosition}º</b>
          </span>
        )}
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-[#232730] bg-[#141619] p-12 text-center text-sm text-muted-foreground">
          Ninguém pontuou ainda. O primeiro número pago abre o ranking.
        </div>
      ) : (
        <ol className="space-y-1.5">
          {rows.map((row) => (
            <RankRow
              key={row.userId}
              position={row.position}
              name={session?.user?.id === row.userId ? "Você" : maskName(row.name)}
              xp={row.xp}
              isMe={session?.user?.id === row.userId}
            />
          ))}
        </ol>
      )}

      {myPosition != null && myPosition > rows.length && (
        <p className="text-center text-xs text-muted-foreground">
          Você está em {myPosition}º. Faltam {myPosition - rows.length} posições
          para entrar no top {rows.length}.
        </p>
      )}
    </div>
  );
}
