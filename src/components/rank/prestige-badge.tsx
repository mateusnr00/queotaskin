// Selos das patentes de prestígio, acima do nível 21.
//
// Ao contrário dos níveis, que se distinguem por número, aqui a patente é
// escrita no próprio selo — e cada uma tem estrutura própria: Pro Player e
// Legend usam octógono de três camadas com traços nos cantos; o GOAT herda a
// borda arco-íris e ganha coroa.
//
// Todos os IDs de gradiente e filtro entram por parâmetro. Numa lista de
// ranking há vários selos na mesma página, e o SVG resolve url(#id) pelo
// documento inteiro: IDs repetidos fariam todos herdarem a pintura do
// primeiro.

import type { PrestigeKey } from "@/lib/rank";
import { LADOS_DO_OCTOGONO } from "@/lib/rank-badges";

const OCTOGONO = {
  externo: "61,5 139,5 195,61 195,139 139,195 61,195 5,139 5,61",
  bordaInterna: "65,15 135,15 185,65 185,135 135,185 65,185 15,135 15,65",
  centro: "69,25 131,25 175,69 175,131 131,175 69,175 25,131 25,69",
};

/** Traços decorativos nos quatro cantos — o par de cima usa o tom claro. */
interface Tracos {
  cima: [string, string];
  baixo: [string, string];
  corCima: string;
  corBaixo: string;
}

interface DesignDePatente {
  /** Miolo em degradê radial, do topo iluminado para a base escura. */
  fundo: [string, string, string];
  /** Borda externa, de cima para baixo. */
  borda: string[];
  /** Borda intermediária, na diagonal. */
  bordaInterna: string[];
  /** Degradê do texto. */
  texto: string[];
  rotulo: string;
  tamanhoDoTexto: number;
  espacamento: number;
  tracos: Tracos;
}

const DESIGNS: Partial<Record<PrestigeKey, DesignDePatente>> = {
  PRO_PLAYER: {
    fundo: ["#16283D", "#0C1724", "#050A10"],
    borda: ["#66E8FF", "#18BFFF", "#1677FF", "#0A3B9E"],
    bordaInterna: ["#1AE6FF", "#178DFF", "#384BFF"],
    texto: ["#FFFFFF", "#A9EFFF"],
    rotulo: "PRO",
    tamanhoDoTexto: 55,
    espacamento: -2,
    tracos: {
      cima: ["M56 54 L72 38", "M144 54 L128 38"],
      baixo: ["M56 146 L72 162", "M144 146 L128 162"],
      corCima: "#42DFFF",
      corBaixo: "#1677FF",
    },
  },
  LEGEND: {
    fundo: ["#2A173A", "#160D20", "#08050D"],
    borda: ["#E678FF", "#B735E8", "#7A19C5", "#3D0A74"],
    bordaInterna: ["#F2B5FF", "#B34DDB", "#7040A0"],
    texto: ["#FFFFFF", "#E7DDF0", "#A58EB4"],
    rotulo: "LEGEND",
    tamanhoDoTexto: 36,
    espacamento: -1,
    tracos: {
      cima: ["M61 52 L75 38", "M139 52 L125 38"],
      baixo: ["M61 148 L75 162", "M139 148 L125 162"],
      corCima: "#E98CFF",
      corBaixo: "#7B38C7",
    },
  },
};

/** Paleta da borda do GOAT — um degradê por lado, fechando a volta. */
const ARCO_IRIS_GOAT: string[][] = [
  ["#FF004C", "#FF00B8", "#A900FF"],
  ["#A900FF", "#4B47FF"],
  ["#4B47FF", "#00CFFF"],
  ["#00CFFF", "#00F0A8"],
  ["#00F0A8", "#EFFF3D"],
  ["#EFFF3D", "#FFC400"],
  ["#FFC400", "#FF6A00"],
  ["#FF6A00", "#FF004C"],
];

const GOAT_FUNDO: [string, string, string] = ["#301B36", "#17101D", "#08070A"];
const GOAT_OURO = ["#FFF4A8", "#FFD54A", "#E6A817", "#9A6505"];

/** Coroa sobre o texto: cinco pontas, o que separa o GOAT das demais. */
const COROA =
  "M72 72 L82 60 L94 70 L100 55 L106 70 L118 60 L128 72 L124 84 L76 84 Z";

function paradas(cores: string[]) {
  return cores.map((cor, i) => (
    <stop
      key={i}
      offset={`${(i / (cores.length - 1)) * 100}%`}
      stopColor={cor}
    />
  ));
}

export function PrestigeBadge({
  chave,
  uid,
}: {
  chave: PrestigeKey;
  /** Prefixo único desta instância para IDs de gradiente e filtro. */
  uid: string;
}) {
  if (chave === "GOAT") {
    return (
      <>
        <defs>
          <radialGradient id={`${uid}-fundo`} cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor={GOAT_FUNDO[0]} />
            <stop offset="55%" stopColor={GOAT_FUNDO[1]} />
            <stop offset="100%" stopColor={GOAT_FUNDO[2]} />
          </radialGradient>
          <linearGradient id={`${uid}-ouro`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={GOAT_OURO[0]} />
            <stop offset="35%" stopColor={GOAT_OURO[1]} />
            <stop offset="70%" stopColor={GOAT_OURO[2]} />
            <stop offset="100%" stopColor={GOAT_OURO[3]} />
          </linearGradient>
          {LADOS_DO_OCTOGONO.map((lado, i) => (
            <linearGradient
              key={i}
              id={`${uid}-arco${i}`}
              x1={lado.de[0]}
              y1={lado.de[1]}
              x2={lado.para[0]}
              y2={lado.para[1]}
            >
              {paradas(ARCO_IRIS_GOAT[i]!)}
            </linearGradient>
          ))}
          <filter
            id={`${uid}-brilho`}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter={`url(#${uid}-brilho)`}>
          {LADOS_DO_OCTOGONO.map((lado, i) => (
            <polygon key={i} points={lado.pontos} fill={`url(#${uid}-arco${i})`} />
          ))}
        </g>

        <polygon points={OCTOGONO.centro} fill={`url(#${uid}-fundo)`} />
        <path d={COROA} fill={`url(#${uid}-ouro)`} />
        <text
          x="100"
          y="118"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={`url(#${uid}-ouro)`}
          fontFamily="Arial, Helvetica, sans-serif"
          fontSize="43"
          fontWeight="900"
          letterSpacing="-2"
        >
          GOAT
        </text>
      </>
    );
  }

  const d = DESIGNS[chave];
  if (!d) return null;

  return (
    <>
      <defs>
        <radialGradient id={`${uid}-fundo`} cx="50%" cy="35%" r="75%">
          <stop offset="0%" stopColor={d.fundo[0]} />
          <stop offset="55%" stopColor={d.fundo[1]} />
          <stop offset="100%" stopColor={d.fundo[2]} />
        </radialGradient>
        <linearGradient id={`${uid}-borda`} x1="0" y1="0" x2="0" y2="1">
          {paradas(d.borda)}
        </linearGradient>
        <linearGradient id={`${uid}-bordaInterna`} x1="0" y1="0" x2="1" y2="1">
          {paradas(d.bordaInterna)}
        </linearGradient>
        <linearGradient id={`${uid}-texto`} x1="0" y1="0" x2="0" y2="1">
          {paradas(d.texto)}
        </linearGradient>
        <filter
          id={`${uid}-brilho`}
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
        >
          <feGaussianBlur stdDeviation="2.8" result="blur" />
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
        fill={`url(#${uid}-bordaInterna)`}
      />
      <polygon points={OCTOGONO.centro} fill={`url(#${uid}-fundo)`} />

      {d.tracos.cima.map((traco, i) => (
        <path
          key={`c${i}`}
          d={traco}
          stroke={d.tracos.corCima}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}
      {d.tracos.baixo.map((traco, i) => (
        <path
          key={`b${i}`}
          d={traco}
          stroke={d.tracos.corBaixo}
          strokeWidth="3"
          strokeLinecap="round"
        />
      ))}

      <text
        x="100"
        y="104"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={`url(#${uid}-texto)`}
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize={d.tamanhoDoTexto}
        fontWeight="900"
        letterSpacing={d.espacamento}
      >
        {d.rotulo}
      </text>
    </>
  );
}
