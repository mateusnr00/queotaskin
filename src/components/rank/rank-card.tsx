import { RankBadge, RankMeter } from "@/components/rank/rank-badge";
import { MAX_LEVEL, PRESTIGE_RANKS, TIERS, rankProgress, xpForLevel } from "@/lib/rank";

/** Painel com aresta de acento à esquerda — a marca visual do rank. */
function Panel({
  color,
  children,
  className = "",
}: {
  color: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`relative overflow-hidden rounded-r-lg border border-l-0 border-[#232730] bg-[#141619] ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: color }}
      />
      {children}
    </section>
  );
}

/**
 * Cartão de progresso do participante.
 *
 * O "faltam R$ X" é o que puxa a recorrência — número redondo e acionável,
 * bem melhor do que exibir só o XP cru.
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
    <Panel color={rank.color}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(420px 120px at 0% 0%, color-mix(in srgb, ${rank.color} 11%, transparent), transparent 70%)`,
        }}
      />

      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <RankBadge rank={rank} size="lg" />

          <div className="min-w-0">
            <h2 className="text-xl leading-tight font-bold tracking-tight sm:text-2xl">
              {rank.label}
            </h2>
            <p
              className="text-[11px] font-bold tracking-[0.12em] uppercase"
              style={{ color: rank.color }}
            >
              {/* No prestígio o nome já é o título — repetir a faixa embaixo
                  seria eco. Ali cabe melhor o que a patente significa. */}
              {rank.prestige ? rank.prestige.description : rank.tierName}
            </p>
          </div>

          <div className="ml-auto text-right">
            <p className="text-[9.5px] font-bold tracking-[0.16em] text-muted-foreground uppercase">
              XP acumulado
            </p>
            <p className="font-mono text-lg font-bold tracking-tight tabular-nums sm:text-xl">
              {xp.toLocaleString("pt-BR")}
            </p>
            {position != null && (
              <p className="font-mono text-[11px] text-muted-foreground">
                {position}º no ranking
              </p>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {progress.atMax ? (
                "Patente máxima atingida"
              ) : (
                <>
                  Próximo:{" "}
                  <b className="font-semibold text-foreground">{progress.nextLabel}</b>
                </>
              )}
            </span>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {progress.atMax ? "MÁX" : `${progress.percent}%`}
            </span>
          </div>

          <RankMeter
            percent={progress.percent}
            color={rank.color}
            height={6}
            label={progress.nextLabel ?? "Patente máxima"}
          />
        </div>

        {!progress.atMax && (
          <p className="mt-3 border-t border-[#232730] pt-3 text-xs text-muted-foreground">
            Faltam{" "}
            <b className="font-semibold text-foreground">
              {progress.xpToNext.toLocaleString("pt-BR")} XP
            </b>{" "}
            — cerca de{" "}
            <b className="font-semibold text-foreground">
              R$ {progress.brlToNext.toLocaleString("pt-BR")}
            </b>{" "}
            em números.
          </p>
        )}
      </div>
    </Panel>
  );
}

/** A escada completa: as faixas de nível e as patentes acima delas. */
export function RankLadder({ xp }: { xp: number }) {
  const current = rankProgress(xp).rank;

  return (
    <section className="rounded-lg border border-[#232730] bg-[#141619] p-5">
      <h2 className="text-sm font-bold">A escada</h2>
      <p className="mt-0.5 mb-4 text-xs text-muted-foreground">
        Vinte e dois níveis, sete patentes. Acima do 21, o prestígio.
      </p>

      <ol className="space-y-2.5">
        {TIERS.map((tier, index) => {
          const last = TIERS[index + 1] ? TIERS[index + 1].from - 1 : MAX_LEVEL;
          const active =
            current.prestige == null &&
            current.level >= tier.from &&
            current.level <= last;

          return (
            <li key={tier.name} className="flex items-center gap-3">
              <span
                className="w-32 shrink-0 text-[11px] font-bold tracking-[0.08em] uppercase"
                style={{ color: active ? tier.color : undefined }}
                data-active={active}
              >
                <span className={active ? "" : "text-muted-foreground"}>{tier.name}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: last - tier.from + 1 }, (_, i) => {
                  const level = tier.from + i;
                  // Apaga só o que ainda não foi conquistado. Quem chegou ao
                  // prestígio passou por toda a escada — apagá-la inteira
                  // faria a conquista parecer o contrário do que é.
                  const reached = xp >= xpForLevel(level);
                  const isCurrent = active && current.level === level;
                  return (
                    <span
                      key={level}
                      className={
                        isCurrent
                          ? "rounded-full ring-2 ring-offset-2 ring-offset-[#141619]"
                          : undefined
                      }
                      style={
                        isCurrent ? { ["--tw-ring-color" as string]: current.color } : undefined
                      }
                    >
                      <RankBadge xp={xpForLevel(level)} size="md" muted={!reached} />
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>

      <ol className="mt-4 space-y-1.5 border-t border-[#232730] pt-4">
        {PRESTIGE_RANKS.map((prestige) => {
          const reached = xp >= prestige.xp;
          return (
            <li
              key={prestige.key}
              className="flex items-center gap-3 rounded-md border px-3 py-2"
              style={{
                borderColor: reached ? `${prestige.color}55` : "#232730",
                backgroundColor: reached ? `${prestige.color}0f` : undefined,
              }}
            >
              <RankBadge xp={prestige.xp} size="md" muted={!reached} />
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-bold"
                  style={{ color: reached ? prestige.color : undefined }}
                >
                  <span className={reached ? "" : "text-muted-foreground"}>
                    {prestige.label}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">{prestige.description}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
                {prestige.xp.toLocaleString("pt-BR")}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
