// Selo de moderador.
//
// Fica fora da escada de níveis de propósito: nível se ganha comprando, e
// isso é cargo. Por isso o desenho não reaproveita a paleta das raridades,
// que vai do roxo ao vermelho, e usa o verde-água, que não aparece em nenhum
// nível nem em nenhuma patente. De relance dá para saber que aquele selo não
// se compra.
//
// A forma é o mesmo octógono das patentes, para o selo sentar do mesmo jeito
// ao lado do nome numa lista onde os dois aparecem.
//
// Todos os IDs de gradiente e filtro entram por parâmetro, como nos outros
// selos: o SVG resolve url(#id) pelo documento inteiro, e numa lista com
// vários selos os IDs repetidos fariam todos herdarem a pintura do primeiro.

const OCTOGONO = {
  externo: "61,5 139,5 195,61 195,139 139,195 61,195 5,139 5,61",
  bordaInterna: "65,15 135,15 185,65 185,135 135,185 65,185 15,135 15,65",
  centro: "69,25 131,25 175,69 175,131 131,175 69,175 25,131 25,69",
};

export function ModBadge({
  size = 40,
  uid,
  className,
}: {
  size?: number;
  /** Precisa ser único na página. Use useId() de quem renderiza. */
  uid: string;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Moderador"
    >
      <defs>
        <radialGradient id={`${uid}-fundo`} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor="#12352F" />
          <stop offset="55%" stopColor="#0B211D" />
          <stop offset="100%" stopColor="#050D0C" />
        </radialGradient>

        <linearGradient id={`${uid}-borda`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#65FFD1" />
          <stop offset="35%" stopColor="#20DFA5" />
          <stop offset="70%" stopColor="#0BA978" />
          <stop offset="100%" stopColor="#056044" />
        </linearGradient>

        <linearGradient id={`${uid}-borda-interna`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#9AFFDF" />
          <stop offset="50%" stopColor="#29DFA9" />
          <stop offset="100%" stopColor="#078C65" />
        </linearGradient>

        <linearGradient id={`${uid}-texto`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#A7FFE4" />
        </linearGradient>

        <filter
          id={`${uid}-brilho`}
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
        >
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <polygon
        points={OCTOGONO.externo}
        fill={`url(#${uid}-borda)`}
        filter={`url(#${uid}-brilho)`}
      />
      <polygon
        points={OCTOGONO.bordaInterna}
        fill={`url(#${uid}-borda-interna)`}
      />
      <polygon points={OCTOGONO.centro} fill={`url(#${uid}-fundo)`} />

      {/* Escudo com o visto: a leitura funciona mesmo quando o selo está
          pequeno demais para a palavra MOD se distinguir. */}
      <path
        d="M100 45 L119 52 V67 C119 79 111 87 100 92 C89 87 81 79 81 67 V52 Z"
        fill="none"
        stroke="#58FFD0"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M91 67 L98 74 L110 60"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <text
        x="100"
        y="125"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={`url(#${uid}-texto)`}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="48"
        fontWeight="900"
        letterSpacing="-1"
      >
        MOD
      </text>
    </svg>
  );
}
