import { RankBadge } from "@/components/rank/rank-badge";
import { rankFromXp } from "@/lib/rank";
import { cn } from "@/lib/utils";

/**
 * Linha do ranking.
 *
 * Sem barra de progresso de propósito: numa lista, uma barra "até o próximo
 * nível" mente para o olho — o GOAT apareceria cheio e o Campeão de Major
 * quase vazio, logo abaixo dele. Aqui o que ordena é XP e posição, então é
 * isso que a linha mostra.
 */
export function RankRow({
  position,
  name,
  xp,
  isMe = false,
}: {
  position: number;
  name: string;
  xp: number;
  isMe?: boolean;
}) {
  const rank = rankFromXp(xp);

  return (
    <li
      className={cn(
        "relative flex items-center gap-3.5 overflow-hidden rounded-r-md border border-l-0 border-[#232730] px-4 py-2.5",
        isMe ? "bg-[#181b1f]" : "bg-[#141619]",
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ backgroundColor: rank.color }}
      />
      {isMe && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, ${rank.color} 9%, transparent), transparent 42%)`,
          }}
        />
      )}

      <span className="relative w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
        {position}
      </span>

      <RankBadge rank={rank} size="md" className="relative" />

      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm leading-tight font-semibold">{name}</p>
        <p className="text-[10.5px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {rank.tierName}
        </p>
      </div>

      <span className="relative shrink-0 text-right">
        <span className="block font-mono text-sm font-bold tabular-nums">
          {xp.toLocaleString("pt-BR")}
        </span>
        <span className="block font-mono text-[10px] text-muted-foreground">XP</span>
      </span>
    </li>
  );
}
