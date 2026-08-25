import { rankFromXp, type BadgeShape, type Rank } from "@/lib/rank";
import { cn } from "@/lib/utils";

/**
 * Polígono regular (ou roseta) em coordenadas de `clip-path`.
 *
 * O primeiro vértice fica no topo — todos os selos apontam para cima, o que
 * dá o mesmo sentido de ascensão à escada inteira. `inset` encolhe o traçado
 * para dentro; é assim que o mesmo polígono vira anel, corpo e miolo sem
 * empilhar máscaras. `notch` puxa os vértices ímpares para dentro e
 * transforma o polígono numa roseta.
 */
function polygon(sides: number, inset = 0, notch = 0): string {
  const points: string[] = [];
  const count = notch ? sides * 2 : sides;

  for (let i = 0; i < count; i++) {
    const radius = (notch && i % 2 ? notch : 1) * (0.5 - inset);
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const x = 50 + radius * 100 * Math.cos(angle);
    const y = 50 + radius * 100 * Math.sin(angle);
    points.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
  }

  return `polygon(${points.join(",")})`;
}

const SIZES = {
  xs: 22,
  sm: 26,
  md: 38,
  lg: 64,
} as const;

/** Espessura do anel colorido, proporcional ao lado do selo. */
function ringWidth(size: number): number {
  return size <= SIZES.sm ? 0.16 : 0.14;
}

/**
 * Selo do rank.
 *
 * A silhueta sobe junto com a faixa — losango na Prata, pentágono na Prata
 * Elite, e assim por diante até o decágono com anel duplo do Global Elite.
 * O prestígio usa roseta com brilho, claramente acima da escada. Anel
 * colorido por fora, miolo escuro, número branco: a leitura funciona à
 * distância e não depende de distinguir matiz.
 */
export function RankBadge({
  xp,
  rank,
  size = "md",
  muted = false,
  className,
}: {
  /** Passe `xp` OU um `rank` já calculado. */
  xp?: number;
  rank?: Rank;
  size?: keyof typeof SIZES;
  /** Faixa ainda não alcançada: apaga o selo sem escondê-lo. */
  muted?: boolean;
  className?: string;
}) {
  const resolved = rank ?? rankFromXp(xp ?? 0);
  const px = SIZES[size];
  const { color } = resolved;
  const shape = shapeForSize(resolved.shape, px);
  const ring = ringWidth(px);

  // Corpo começa depois do anel externo quando a faixa tem anel duplo.
  const bodyInset = shape.doubleRing ? 0.1 : 0;

  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center",
        muted && "opacity-40 saturate-50",
        className,
      )}
      style={{ width: px, height: px }}
      title={resolved.label}
    >
      {shape.doubleRing && (
        <>
          <span
            aria-hidden
            className="absolute inset-0"
            style={{ clipPath: polygon(shape.sides, 0, shape.notch), background: color }}
          />
          <span
            aria-hidden
            className="absolute inset-0"
            style={{
              clipPath: polygon(shape.sides, 0.055, shape.notch),
              background: "var(--background)",
            }}
          />
        </>
      )}

      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          clipPath: polygon(shape.sides, bodyInset, shape.notch),
          background: `linear-gradient(145deg, color-mix(in srgb, ${color} 78%, #fff), ${color} 46%, color-mix(in srgb, ${color} 72%, #000))`,
          filter: shape.notch
            ? `drop-shadow(0 0 ${Math.round(px * 0.14)}px color-mix(in srgb, ${color} 55%, transparent))`
            : undefined,
        }}
      />

      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          clipPath: polygon(shape.sides, bodyInset + ring, shape.notch),
          background: `linear-gradient(160deg, color-mix(in srgb, ${color} 14%, #14161c), color-mix(in srgb, ${color} 5%, #0e1015))`,
        }}
      />

      <span
        className="relative leading-none font-extrabold text-white"
        style={{
          fontSize: px * shape.fontScale,
          letterSpacing: "-0.05em",
          textShadow: "0 1px 2px rgba(0,0,0,.55)",
        }}
      >
        {resolved.numeral}
      </span>
    </span>
  );
}

/**
 * Ajusta a geometria ao tamanho: a roseta de 10 pontas empasta abaixo de
 * ~30px, então nos selos pequenos ela perde duas pontas e ganha reentrância
 * mais funda para continuar legível.
 */
function shapeForSize(shape: BadgeShape, px: number): BadgeShape {
  if (!shape.notch || px > SIZES.sm) return shape;
  return { ...shape, sides: 8, notch: 0.76 };
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
