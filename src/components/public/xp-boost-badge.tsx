// A insígnia do XP Boost. UM componente, três tamanhos, cor vinda do drop.
//
// A GEOMETRIA É A APROVADA E NÃO MUDA.
//
// Contorno de rank com topo pontudo, laterais verticais e abertura embaixo;
// UMA seta grande apontando para cima; o multiplicador logo abaixo dela; e
// "XP" na base. Nada de segunda seta, faixa preta, raio, estrela, círculo,
// medalha ou moldura extra. Os dois caminhos do SVG são os do desenho
// aprovado, sem um ponto alterado.
//
// O QUE MELHOROU, SEM DESCARACTERIZAR
//
// O texto saiu do HTML posicionado por porcentagem e foi para DENTRO do SVG.
// Era a única forma de o número escalar junto com o desenho: com o texto
// fora, mudar de tamanho descolava o multiplicador da seta, e em 320px de
// largura o "XP" saía do contorno. Dentro do viewBox, os três tamanhos são o
// mesmo desenho em escalas diferentes, e não três ajustes à mão.
//
// A fonte é a do projeto, com os mesmos pesos pesados do desenho original.
// "Arial Black" não existe em Linux nem em boa parte dos Androids, e o
// navegador caía numa fonte qualquer: o peso 900 da fonte do site mantém a
// intenção e é o que o resto do painel já usa.
//
// A COR VEM DE FORA
//
// Uma variável CSS alimenta traço, preenchimento e texto. Quem manda é o
// drop configurado no painel: pintar por raridade obrigaria a mexer em código
// para trocar a paleta.

import { cn } from "@/lib/utils";

export type TamanhoDoBadge = "sm" | "md" | "lg";

/** A largura de cada tamanho. A altura sai da proporção do viewBox. */
const LARGURA: Record<TamanhoDoBadge, number> = {
  sm: 84,
  md: 132,
  lg: 260,
};

export interface XpBoostBadgeProps {
  multiplier: number;
  /** Hexadecimal vindo do drop. */
  color: string;
  size?: TamanhoDoBadge;
  className?: string;
  /** Some do leitor de tela quando o texto já aparece ao lado. */
  decorativo?: boolean;
}

/**
 * O número como a insígnia escreve: "1.5", "2", "3.5".
 *
 * Sem casa decimal à toa. 2.00 vira "2", porque o desenho tem espaço para
 * poucos dígitos e um zero pendurado só rouba largura do número que importa.
 */
function numeroDoMultiplicador(m: number): string {
  const arredondado = Math.round(m * 100) / 100;
  return Number.isInteger(arredondado)
    ? String(arredondado)
    : String(arredondado).replace(/0$/, "");
}

export function XpBoostBadge({
  multiplier,
  color,
  size = "md",
  className,
  decorativo,
}: XpBoostBadgeProps) {
  const largura = LARGURA[size];
  const numero = numeroDoMultiplicador(multiplier);
  // AS PROPORÇÕES SÃO AS DO DESENHO APROVADO.
  //
  // Lá o número era 67px num badge de 300 de largura, o "x" 38 e o "XP" 69.
  // Convertidos para o viewBox de 320: 71, 40 e 74. A primeira versão daqui
  // chutou 80 e 96, e num badge de 44px o "XP" estourava o contorno e o
  // número encostava nele. Proporção do desenho, e não número redondo.
  //
  // Número de três caracteres ("3.5") ainda pede um corpo um pouco menor que
  // o de um ("2"), senão ele toca as laterais.
  const corpoDoNumero = numero.length > 1 ? 71 : 88;

  return (
    <svg
      viewBox="0 0 320 360"
      width={largura}
      height={(largura * 360) / 320}
      // `h-auto` no componente, e não em cada uso: os atributos width e
      // height do SVG dão a proporção, mas quem escreve `className="w-9"` de
      // fora sobrescreve só a largura e a altura continua a do atributo. O
      // badge saía 36 de largura por 94 de altura e inflava a linha inteira.
      // Com a altura automática, qualquer largura vinda de fora mantém a
      // proporção do desenho.
      className={cn("block h-auto shrink-0 overflow-visible", className)}
      style={{
        // A cor entra por variável para traço, preenchimento e texto lerem a
        // mesma fonte, e para o halo ser derivado dela em vez de fixo.
        ["--xp-color" as string]: color,
        filter: `drop-shadow(0 6px 18px color-mix(in srgb, ${color} 22%, transparent))`,
      }}
      role={decorativo ? "presentation" : "img"}
      aria-hidden={decorativo ? true : undefined}
      aria-label={decorativo ? undefined : `Boost de ${numero}x XP`}
    >
      {/* O contorno de rank: topo pontudo, laterais verticais, aberto embaixo. */}
      <path
        d="M55 309 L26 287 L26 116 L160 15 L294 116 L294 287 L265 309"
        fill="none"
        stroke="var(--xp-color)"
        strokeWidth={10}
        strokeLinecap="square"
        strokeLinejoin="miter"
      />

      {/* A seta única, apontando para cima. */}
      <path
        d="M72 158 L160 92 L248 158 L248 207 L160 142 L72 207 Z"
        fill="var(--xp-color)"
      />

      {/* O multiplicador, no vão abaixo da seta. Dentro do SVG para escalar
          junto: com o texto em HTML por cima, mudar de tamanho descolava o
          número da seta. */}
      <text
        x={158}
        y={258}
        textAnchor="middle"
        fill="var(--xp-color)"
        style={{
          fontSize: corpoDoNumero,
          fontWeight: 900,
          letterSpacing: "-0.055em",
          fontFamily: "inherit",
        }}
      >
        {numero}
        <tspan
          style={{ fontSize: corpoDoNumero * 0.56, letterSpacing: "-0.03em" }}
          dx={4}
        >
          x
        </tspan>
      </text>

      {/* "XP" na base, encostado na abertura do contorno, como no desenho. */}
      <text
        x={162}
        y={346}
        textAnchor="middle"
        fill="var(--xp-color)"
        style={{
          fontSize: 74,
          fontWeight: 900,
          letterSpacing: "-0.085em",
          fontFamily: "inherit",
        }}
      >
        XP
      </text>
    </svg>
  );
}
