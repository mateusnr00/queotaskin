import { Trophy } from "lucide-react";

import { RankBadge } from "@/components/rank/rank-badge";
import { MAX_LEVEL, PRESTIGE_RANKS, rankProgress, xpForLevel } from "@/lib/rank";

/**
 * Cartão de progresso do participante: rank atual, barra até o próximo
 * degrau e quanto falta em reais.
 *
 * O "faltam R$ X" é o coração da recorrência — número redondo e acionável,
 * bem melhor que mostrar só o XP cru.
 */
export function RankCard({
  xp,
  xpPerBrl,
  position,
}: {
  xp: number;
  xpPerBrl: number;
  position: number | null;
}) {
  const progress = rankProgress(xp, xpPerBrl);
  const { rank } = progress;

  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        style={{ background: `linear-gradient(90deg, ${rank.color}22, transparent)` }}
      >
        <div className="flex items-center gap-3">
          <RankBadge rank={rank} size="lg" showLabel={false} />
          <div>
            <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
              Seu rank
            </p>
            <p className="text-lg leading-tight font-bold" style={{ color: rank.color }}>
              {rank.label}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
            XP total
          </p>
          <p className="text-lg font-bold tabular-nums">{xp.toLocaleString("pt-BR")}</p>
          {position != null && (
            <p className="text-xs text-muted-foreground">
              {position}º no ranking geral
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t p-4">
        {progress.atMax ? (
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-amber-500">
            <Trophy className="h-4 w-4" />
            Você chegou ao topo. Não existe rank acima de GOAT.
          </p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">
                Próximo: <span className="font-semibold text-foreground">{progress.nextLabel}</span>
              </span>
              <span className="font-semibold tabular-nums">{progress.percent}%</span>
            </div>

            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso até ${progress.nextLabel}`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700"
                style={{
                  width: `${progress.percent}%`,
                  background: `linear-gradient(90deg, ${rank.color}88, ${rank.color})`,
                }}
              />
            </div>

            <p className="text-sm text-muted-foreground">
              Faltam{" "}
              <span className="font-bold text-foreground">
                {progress.xpToNext.toLocaleString("pt-BR")} XP
              </span>{" "}
              — cerca de{" "}
              <span className="font-bold text-foreground">
                R$ {progress.brlToNext.toLocaleString("pt-BR")}
              </span>{" "}
              em números.
            </p>
          </>
        )}

        <p className="border-t pt-2 text-xs text-muted-foreground">
          Cada R$ 1 gasto em números pagos vale {xpPerBrl} XP. O rank é
          permanente: XP não expira nem é descontado.
        </p>
      </div>
    </section>
  );
}

/** A escada completa: os 21 níveis e as 4 patentes acima deles. */
export function RankLadder({ xp }: { xp: number }) {
  const current = rankProgress(xp).rank;

  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="mb-1 text-base font-bold">A escada</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Níveis 0 a 21 como na Gamers Club. Depois do 21, começam as patentes.
      </p>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {Array.from({ length: MAX_LEVEL + 1 }, (_, level) => (
          <RankBadge
            key={level}
            xp={xpForLevel(level)}
            size="sm"
            showLabel={false}
            className={
              current.prestige == null && current.level === level
                ? "ring-2 ring-primary ring-offset-1 ring-offset-card rounded-md"
                : "opacity-60"
            }
          />
        ))}
      </div>

      <ol className="space-y-1.5">
        {PRESTIGE_RANKS.map((prestige) => {
          const reached = xp >= prestige.xp;
          return (
            <li
              key={prestige.key}
              className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
              style={{
                borderColor: reached ? `${prestige.color}66` : undefined,
                backgroundColor: reached ? `${prestige.color}12` : undefined,
                opacity: reached ? 1 : 0.55,
              }}
            >
              <div className="min-w-0">
                <p className="text-sm font-bold" style={{ color: prestige.color }}>
                  {prestige.label}
                </p>
                <p className="text-xs text-muted-foreground">{prestige.description}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                {prestige.xp.toLocaleString("pt-BR")} XP
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
