// Os 21 selos de nível, como dados.
//
// A silhueta sobe em quatro degraus — hexágono (1–5), losango (6–11),
// heptágono (12–18) e octógono (19–21) — e a cor percorre roxo, azul, verde,
// amarelo e vermelho até o arco-íris do topo. Assim dá para saber a faixa de
// alguém pela forma, mesmo de longe ou sem distinguir matiz.
//
// Cada nível traz três tons: o claro e o escuro formam o degradê da borda
// (claro em cima, escuro embaixo) e o miolo vai da cor cheia a um fundo
// quase preto, que é o que deixa o número branco legível.

export type FormaDoSelo = "hexagono" | "losango" | "heptagono" | "octogono";

export interface DesignDeNivel {
  forma: FormaDoSelo;
  /** Degradê da borda: claro (topo) → principal (meio) → escuro (base). */
  borda: [string, string, string];
  /** Degradê do miolo: principal (topo) → quase preto (base). */
  miolo: [string, string];
  /** Só o nível 21: a borda vira arco-íris em oito segmentos. */
  arcoIris?: true;
}

export const DESIGN_POR_NIVEL: Record<number, DesignDeNivel> = {
  1:  { forma: "hexagono",  borda: ["#C84BEB", "#A51FCC", "#671080"], miolo: ["#A51FCC", "#32103D"] },
  2:  { forma: "hexagono",  borda: ["#9B45F2", "#711DCA", "#45117E"], miolo: ["#711DCA", "#25103A"] },
  3:  { forma: "hexagono",  borda: ["#8439DB", "#5B18B3", "#370D70"], miolo: ["#5B18B3", "#201033"] },
  4:  { forma: "hexagono",  borda: ["#702AC1", "#461291", "#290958"], miolo: ["#461291", "#190C2B"] },
  5:  { forma: "hexagono",  borda: ["#5C269A", "#340F6C", "#1F083F"], miolo: ["#340F6C", "#15091F"] },
  6:  { forma: "losango",   borda: ["#1A58B1", "#082D74", "#041A43"], miolo: ["#082D74", "#06152E"] },
  7:  { forma: "losango",   borda: ["#3372E0", "#0F44AC", "#082866"], miolo: ["#0F44AC", "#071A3D"] },
  8:  { forma: "losango",   borda: ["#3B7BE8", "#1355C6", "#0A337A"], miolo: ["#1355C6", "#081E47"] },
  9:  { forma: "losango",   borda: ["#64A2EC", "#377DD5", "#1D5196"], miolo: ["#377DD5", "#102B4E"] },
  10: { forma: "losango",   borda: ["#6BB3FF", "#3891F5", "#1D5EA8"], miolo: ["#3891F5", "#123862"] },
  11: { forma: "losango",   borda: ["#73C7E8", "#3EA3CF", "#236A8A"], miolo: ["#3EA3CF", "#163E52"] },
  12: { forma: "heptagono", borda: ["#82E0C7", "#53C4A6", "#287762"], miolo: ["#53C4A6", "#163E35"] },
  13: { forma: "heptagono", borda: ["#70DB82", "#3DBA54", "#237331"], miolo: ["#3DBA54", "#163D1D"] },
  14: { forma: "heptagono", borda: ["#70E660", "#3CC82B", "#217817"], miolo: ["#3CC82B", "#173E11"] },
  15: { forma: "heptagono", borda: ["#6BFF57", "#32ED1A", "#188D0B"], miolo: ["#32ED1A", "#16480E"] },
  16: { forma: "heptagono", borda: ["#FFF37A", "#EADC45", "#92861D"], miolo: ["#EADC45", "#4B4514"] },
  17: { forma: "heptagono", borda: ["#FFE26A", "#EAC135", "#947616"], miolo: ["#EAC135", "#4B3B10"] },
  18: { forma: "heptagono", borda: ["#FFCA61", "#FFA926", "#A9630D"], miolo: ["#FFA926", "#56350C"] },
  19: { forma: "octogono",  borda: ["#FFA557", "#FC7A1C", "#9A4208"], miolo: ["#FC7A1C", "#542708"] },
  20: { forma: "octogono",  borda: ["#FF4A48", "#FC0200", "#970100"], miolo: ["#FC0200", "#500706"] },
  21: { forma: "octogono",  borda: ["#FF1744", "#FF006E", "#FFC400"], miolo: ["#351B29", "#1B1018"], arcoIris: true },
};

// Nível 0 não veio no conjunto — é o estado de quem acabou de criar conta e
// ainda não gastou nada. Repete o desenho do nível 1 em vez de inventar uma
// cor fora da escala: a diferença que importa ali é o número.
export const DESIGN_NIVEL_ZERO: DesignDeNivel = DESIGN_POR_NIVEL[1]!;

// Contornos em viewBox 200x200. Externo é a borda; interno é o miolo.
export const CONTORNOS: Record<
  FormaDoSelo,
  { externo: string; interno: string }
> = {
  hexagono: {
    externo: "100,5 182.27,52.5 182.27,147.5 100,195 17.73,147.5 17.73,52.5",
    interno: "100,24 165.82,62 165.82,138 100,176 34.18,138 34.18,62",
  },
  heptagono: {
    externo:
      "100,5 174.27,40.77 192.62,121.14 141.22,185.60 58.78,185.60 7.38,121.14 25.73,40.77",
    interno:
      "100,28 156.29,55.11 170.19,116.02 131.24,164.87 68.76,164.87 29.81,116.02 43.71,55.11",
  },
  octogono: {
    externo: "61,5 139,5 195,61 195,139 139,195 61,195 5,139 5,61",
    interno: "67,27 133,27 173,67 173,133 133,173 67,173 27,133 27,67",
  },
  // O losango é um quadrado arredondado girado 45°, não um polígono: as
  // pontas arredondadas não sairiam de uma lista de vértices.
  losango: { externo: "", interno: "" },
};

/**
 * Os oito lados do octógono, cada um com a direção do próprio degradê.
 *
 * A geometria vem separada das cores porque duas peças a usam: a borda
 * arco-íris do nível 21 e a do selo do GOAT. Repetir os polígonos nas duas
 * seria convidá-las a sair de sincronia na primeira correção.
 */
export const LADOS_DO_OCTOGONO: {
  pontos: string;
  de: [number, number];
  para: [number, number];
}[] = [
  { pontos: "61,5 139,5 133,27 67,27",         de: [0, 0], para: [1, 0] },
  { pontos: "139,5 195,61 173,67 133,27",      de: [0, 0], para: [1, 1] },
  { pontos: "195,61 195,139 173,133 173,67",   de: [0, 0], para: [0, 1] },
  { pontos: "195,139 139,195 133,173 173,133", de: [1, 0], para: [0, 1] },
  { pontos: "139,195 61,195 67,173 133,173",   de: [1, 0], para: [0, 0] },
  { pontos: "61,195 5,139 27,133 67,173",      de: [1, 1], para: [0, 0] },
  { pontos: "5,139 5,61 27,67 27,133",         de: [0, 1], para: [0, 0] },
  { pontos: "5,61 61,5 67,27 27,67",           de: [0, 1], para: [1, 0] },
];

/** Paleta do nível 21, um degradê por lado, fechando a volta. */
export const ARCO_IRIS_NIVEL_21: string[][] = [
  ["#FF1744", "#E600A9"],
  ["#E600A9", "#FF006E"],
  ["#FF006E", "#FF3D00"],
  ["#FF3D00", "#FFC400"],
  ["#FFC400", "#64E6B3"],
  ["#64E6B3", "#24C9E8"],
  ["#24C9E8", "#69D4C5"],
  ["#69D4C5", "#FFB51B", "#FF1744"],
];
