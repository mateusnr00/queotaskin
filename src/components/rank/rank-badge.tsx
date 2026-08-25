import { rankFromXp, type Rank } from "@/lib/rank";
import { cn } from "@/lib/utils";

/** Hexágono do selo — mesma silhueta das patentes do competitivo. */
const HEX = "polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%)";

/**
 * Contorno hexagonal desenhado como um "anel": o mesmo polígono percorrido
 * duas vezes, por fora e por dentro, deixa só a borda pintada. Evita
 * empilhar dois elementos só para conseguir uma borda em clip-path.
 */
function hexRing(width: number): string {
  const w = `${width}px`;
  return (
    `polygon(50% 0, 100% 26%, 100% 74%, 50% 100%, 0 74%, 0 26%, 50% 0, ` +
    `50% ${w}, ${w} 27%, ${w} 73%, 50% calc(100% - ${w}), ` +
    `calc(100% - ${w}) 73%, calc(100% - ${w}) 27%, 50% ${w})`
  );
}

const SIZES = {
  sm: { w: 26, h: 29, font: 10.5, ring: 1.2 },
  md: { w: 34, h: 38, font: 13, ring: 1.5 },
  lg: { w: 54, h: 60, font: 21, ring: 2 },
} as const;

/**
 * Selo do rank: hexágono com o nível ("07") ou o numeral romano da patente
 * ("III"). Prestígio usa sempre a variante chapada — a diferença de
 * tratamento distingue patente de nível sem depender só da cor.
 */
export function RankBadge({
  xp,
  rank,
  size = "md",
  variant,
  className,
}: {
  /** Passe `xp` OU um `rank` já calculado. */
  xp?: number;
  rank?: Rank;
  size?: keyof typeof SIZES;
  /** Padrão: chapado no prestígio, vazado nos níveis. */
  variant?: "solid" | "outline";
  className?: string;
}) {
  const resolved = rank ?? rankFromXp(xp ?? 0);
  const dims = SIZES[size];
  const solid = variant ? variant === "solid" : resolved.prestige != null;

  return (
    <span
      className={cn("relative grid shrink-0 place-items-center", className)}
      style={{
        width: dims.w,
        height: dims.h,
        clipPath: HEX,
        backgroundColor: solid
          ? resolved.color
          : `color-mix(in srgb, ${resolved.color} 16%, #101216)`,
      }}
      title={resolved.label}
    >
      {!solid && (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundColor: resolved.color,
            opacity: 0.55,
            clipPath: hexRing(dims.ring),
          }}
        />
      )}
      <span
        className="relative font-mono leading-none font-bold"
        style={{
          fontSize: dims.font,
          letterSpacing: "-0.04em",
          color: solid ? "#0b0c0e" : resolved.color,
        }}
      >
        {resolved.numeral}
      </span>
    </span>
  );
}

/** Barra fina de progresso, com o brilho tênue do acento na ponta. */
export function RankMeter({
  percent,
  color,
  className,
  height = 4,
  label,
}: {
  percent: number;
  color: string;
  className?: string;
  height?: number;
  label?: string;
}) {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <div
      className={cn("relative overflow-hidden rounded-full bg-[#20242b]", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
        style={{
          width: `${value}%`,
          backgroundColor: color,
          boxShadow: `0 0 8px -1px color-mix(in srgb, ${color} 70%, transparent)`,
        }}
      />
    </div>
  );
}
