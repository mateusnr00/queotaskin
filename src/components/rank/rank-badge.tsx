"use client";

import { useId } from "react";

import { rankFromXp, type Rank } from "@/lib/rank";
import {
  ARCO_IRIS_NIVEL_21,
  CONTORNOS,
  DESIGN_NIVEL_ZERO,
  DESIGN_POR_NIVEL,
  LADOS_DO_OCTOGONO,
  type DesignDeNivel,
} from "@/lib/rank-badges";
import { PrestigeBadge } from "@/components/rank/prestige-badge";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: 22,
  sm: 26,
  md: 38,
  lg: 64,
  /** Só o selo herói do portão de campanha exclusiva. */
  xl: 92,
} as const;

// Os desenhos vêm em viewBox 200x200; o tamanho em tela é só escala.
const VIEW = 200;

/** Um dígito ocupa mais espaço que dois, 21 não pode transbordar a borda. */
function tamanhoDaFonte(numeral: string): number {
  return numeral.length > 1 ? 74 : 82;
}

/**
 * Selo do rank.
 *
 * A silhueta sobe em quatro degraus, hexágono, losango, heptágono e
 * octógono, e a cor percorre roxo, azul, verde, amarelo e vermelho até o
 * arco-íris do nível 21. Dá para ler a faixa de alguém pela forma, de longe,
 * sem depender de distinguir matiz. Os desenhos vivem em lib/rank-badges.
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

  // IDs precisam ser únicos por selo. Numa lista de ranking há dezenas na
  // mesma página, e IDs repetidos fazem todos herdarem o gradiente do
  // primeiro, o SVG resolve a referência pelo documento inteiro.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const moldura = (conteudo: React.ReactNode) => (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={px}
      height={px}
      role="img"
      aria-label={resolved.label}
      className={cn("shrink-0", muted && "opacity-40 saturate-50", className)}
    >
      {conteudo}
    </svg>
  );

  // Patente tem desenho próprio, texto escrito, coroa, brilho, que não cabe
  // na tabela dos níveis.
  if (resolved.prestige) {
    return moldura(<PrestigeBadge chave={resolved.prestige.key} uid={uid} />);
  }

  const design = designoDoRank(resolved);
  const contorno = CONTORNOS[design.forma];

  return moldura(
    <>
      <defs>
        <linearGradient id={`${uid}-borda`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={design.borda[0]} />
          <stop offset="50%" stopColor={design.borda[1]} />
          <stop offset="100%" stopColor={design.borda[2]} />
        </linearGradient>
        <linearGradient id={`${uid}-miolo`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={design.miolo[0]} />
          <stop offset="100%" stopColor={design.miolo[1]} />
        </linearGradient>
        {design.arcoIris &&
          LADOS_DO_OCTOGONO.map((lado, i) => {
            const cores = ARCO_IRIS_NIVEL_21[i]!;
            return (
              <linearGradient
                key={i}
                id={`${uid}-arco${i}`}
                x1={lado.de[0]}
                y1={lado.de[1]}
                x2={lado.para[0]}
                y2={lado.para[1]}
              >
                {cores.map((cor, j) => (
                  <stop
                    key={j}
                    offset={`${(j / (cores.length - 1)) * 100}%`}
                    stopColor={cor}
                  />
                ))}
              </linearGradient>
            );
          })}
      </defs>

      {design.arcoIris ? (
        // Cada lado do octógono ganha o próprio degradê; juntos fecham a
        // volta do arco-íris.
        LADOS_DO_OCTOGONO.map((lado, i) => (
          <polygon key={i} points={lado.pontos} fill={`url(#${uid}-arco${i})`} />
        ))
      ) : design.forma === "losango" ? (
        <rect
          x="31"
          y="31"
          width="138"
          height="138"
          rx="16"
          fill={`url(#${uid}-borda)`}
          transform="rotate(45 100 100)"
        />
      ) : (
        <polygon points={contorno.externo} fill={`url(#${uid}-borda)`} />
      )}

      {design.forma === "losango" ? (
        <rect
          x="47"
          y="47"
          width="106"
          height="106"
          rx="6"
          fill={`url(#${uid}-miolo)`}
          transform="rotate(45 100 100)"
        />
      ) : (
        <polygon points={contorno.interno} fill={`url(#${uid}-miolo)`} />
      )}

      <text
        x="100"
        y="105"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#FFFFFF"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={tamanhoDaFonte(resolved.numeral)}
        fontWeight="800"
      >
        {resolved.numeral}
      </text>
    </>
  );
}

/** Desenho do nível. Patente não passa por aqui: tem componente próprio. */
function designoDoRank(rank: Rank): DesignDeNivel {
  if (rank.level <= 0) return DESIGN_NIVEL_ZERO;
  return DESIGN_POR_NIVEL[Math.min(21, rank.level)] ?? DESIGN_NIVEL_ZERO;
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
