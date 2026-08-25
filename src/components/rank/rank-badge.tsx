import { rankFromXp, type Rank } from "@/lib/rank";
import { cn } from "@/lib/utils";

/**
 * Selo do rank. A cor vem do nível/patente e entra por `style` porque é
 * calculada — mapear 21 níveis + 4 patentes em classes do Tailwind exigiria
 * gerar 25 variantes na mão.
 */
export function RankBadge({
  xp,
  rank,
  size = "md",
  showLabel = true,
  className,
}: {
  /** Passe `xp` OU um `rank` já calculado. */
  xp?: number;
  rank?: Rank;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}) {
  const resolved = rank ?? rankFromXp(xp ?? 0);
  const isPrestige = resolved.prestige != null;

  const sizes = {
    sm: { box: "h-5 min-w-5 text-[0.6rem]", gap: "gap-1", text: "text-[0.65rem]" },
    md: { box: "h-7 min-w-7 text-xs", gap: "gap-1.5", text: "text-xs" },
    lg: { box: "h-10 min-w-10 text-base", gap: "gap-2", text: "text-sm" },
  }[size];

  return (
    <span className={cn("inline-flex items-center", sizes.gap, className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-md px-1.5 font-extrabold tabular-nums",
          sizes.box,
        )}
        style={{
          color: resolved.color,
          backgroundColor: `${resolved.color}22`,
          border: `1px solid ${resolved.color}66`,
          // Patente ganha um brilho para se destacar dos níveis numéricos.
          boxShadow: isPrestige ? `0 0 12px -2px ${resolved.color}99` : undefined,
        }}
        title={resolved.label}
      >
        {resolved.shortLabel}
      </span>
      {showLabel && (
        <span className={cn("font-semibold", sizes.text)} style={{ color: resolved.color }}>
          {isPrestige ? resolved.label : `Nível ${resolved.level}`}
        </span>
      )}
    </span>
  );
}
