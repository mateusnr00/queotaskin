// Os times de CS2 para quem a pessoa torce.
//
// Mora em código, e não no banco, pelo mesmo motivo que os nomes das patentes:
// é uma lista curta, estável, que ninguém cadastra pelo painel. Um `Time` no
// banco custaria uma tabela, uma tela de admin e uma migration por time novo,
// para resolver algo que uma constante resolve. O que vai para o banco é só o
// `id` escolhido, uma string.
//
// SOBRE O ESCUDO
//
// O campo `escudo` nasce vazio de propósito. Escudo de organização é marca
// registrada, e este site vende cotas: publicar o brasão da FURIA ou da NAVI
// numa página comercial pode ser lido como patrocínio ou endosso delas. A
// decisão é de quem opera o site, não deste arquivo.
//
// Enquanto `escudo` estiver vazio, o emblema desenha a TAG do time sobre a cor
// dele, e a tela funciona inteira. Quando houver arquivo, com direito de uso,
// basta preencher a URL aqui: nada mais muda, nem o banco, nem o componente.
//
// SOBRE AS CORES
//
// São aproximações, e servem só ao emblema de reserva, aquele que some assim
// que existir imagem de verdade. Não são reprodução de identidade visual de
// ninguém. Corrigir uma cor é trocar um hex nesta linha.

export type RegiaoDoTime = "BR" | "INTER";

export interface TimeDeCS2 {
  /** Slug estável. É o único pedaço disto que chega ao banco. */
  id: string;
  nome: string;
  /** Duas a quatro letras. É o que o emblema mostra quando não há imagem. */
  tag: string;
  /** Acento do emblema de reserva. Ver a nota sobre cores no topo. */
  cor: string;
  regiao: RegiaoDoTime;
  /** URL do escudo. Vazio até existir arquivo com direito de uso. */
  escudo?: string;
}

export const TIMES_DE_CS2: readonly TimeDeCS2[] = [
  // Brasil primeiro: é o público desta plataforma, e a lista é lida de cima.
  { id: "furia", nome: "FURIA", tag: "FUR", cor: "#111827", regiao: "BR" },
  { id: "mibr", nome: "MIBR", tag: "MIBR", cor: "#1f2937", regiao: "BR" },
  { id: "pain", nome: "paiN Gaming", tag: "paiN", cor: "#e11d48", regiao: "BR" },
  { id: "imperial", nome: "Imperial", tag: "IMP", cor: "#a16207", regiao: "BR" },
  { id: "legacy", nome: "Legacy", tag: "LEG", cor: "#7c3aed", regiao: "BR" },
  { id: "fluxo", nome: "Fluxo", tag: "FLX", cor: "#0891b2", regiao: "BR" },
  { id: "red-canids", nome: "Red Canids", tag: "RED", cor: "#dc2626", regiao: "BR" },
  { id: "sharks", nome: "Sharks Esports", tag: "SHK", cor: "#0279b7", regiao: "BR" },
  { id: "oddik", nome: "ODDIK", tag: "ODK", cor: "#16a34a", regiao: "BR" },
  { id: "case", nome: "Case Esports", tag: "CASE", cor: "#0f766e", regiao: "BR" },

  { id: "navi", nome: "Natus Vincere", tag: "NAVI", cor: "#facc15", regiao: "INTER" },
  { id: "faze", nome: "FaZe Clan", tag: "FaZe", cor: "#dc2626", regiao: "INTER" },
  { id: "vitality", nome: "Team Vitality", tag: "VIT", cor: "#eab308", regiao: "INTER" },
  { id: "g2", nome: "G2 Esports", tag: "G2", cor: "#374151", regiao: "INTER" },
  { id: "spirit", nome: "Team Spirit", tag: "TS", cor: "#1f2937", regiao: "INTER" },
  { id: "astralis", nome: "Astralis", tag: "AST", cor: "#e11d48", regiao: "INTER" },
  { id: "liquid", nome: "Team Liquid", tag: "TL", cor: "#1d4ed8", regiao: "INTER" },
  { id: "mouz", nome: "MOUZ", tag: "MOUZ", cor: "#dc2626", regiao: "INTER" },
  { id: "heroic", nome: "Heroic", tag: "HER", cor: "#0f766e", regiao: "INTER" },
  { id: "cloud9", nome: "Cloud9", tag: "C9", cor: "#38bdf8", regiao: "INTER" },
  { id: "complexity", nome: "Complexity", tag: "COL", cor: "#334155", regiao: "INTER" },
  { id: "falcons", nome: "Team Falcons", tag: "FLC", cor: "#15803d", regiao: "INTER" },
  { id: "mongolz", nome: "The MongolZ", tag: "TMZ", cor: "#b91c1c", regiao: "INTER" },
  { id: "eternal-fire", nome: "Eternal Fire", tag: "EF", cor: "#ea580c", regiao: "INTER" },
  { id: "virtus-pro", nome: "Virtus.pro", tag: "VP", cor: "#f97316", regiao: "INTER" },
  { id: "nip", nome: "Ninjas in Pyjamas", tag: "NIP", cor: "#facc15", regiao: "INTER" },
  { id: "big", nome: "BIG", tag: "BIG", cor: "#1e3a8a", regiao: "INTER" },
  { id: "ence", nome: "ENCE", tag: "ENCE", cor: "#0d9488", regiao: "INTER" },
  { id: "gamerlegion", nome: "GamerLegion", tag: "GL", cor: "#4f46e5", regiao: "INTER" },
  { id: "aurora", nome: "Aurora Gaming", tag: "AUR", cor: "#7e22ce", regiao: "INTER" },
];

const POR_ID = new Map(TIMES_DE_CS2.map((t) => [t.id, t]));

/**
 * O time de um id guardado no banco.
 *
 * Devolve nulo para id desconhecido em vez de quebrar. O banco guarda texto
 * livre, sem chave estrangeira, então um id pode sobrar aqui depois de um time
 * sair desta lista. Quando isso acontece a pessoa simplesmente deixa de exibir
 * time, que é bem melhor do que uma página de erro.
 */
export function timePorId(id: string | null | undefined): TimeDeCS2 | null {
  if (!id) return null;
  return POR_ID.get(id) ?? null;
}

/** Se o id existe. É o que a validação do formulário pergunta. */
export function timeExiste(id: string): boolean {
  return POR_ID.has(id);
}

/** A lista partida em duas, que é como o seletor desenha. */
export function timesPorRegiao(): {
  br: readonly TimeDeCS2[];
  inter: readonly TimeDeCS2[];
} {
  return {
    br: TIMES_DE_CS2.filter((t) => t.regiao === "BR"),
    inter: TIMES_DE_CS2.filter((t) => t.regiao === "INTER"),
  };
}

/**
 * Preto ou branco sobre a cor do time, o que enxergar melhor.
 *
 * Fixar branco quebrava nos amarelos: "NAVI" em branco sobre #facc15 dá menos
 * de 2:1, ilegível a um palmo da tela.
 *
 * A primeira tentativa de conserto foi um corte de luminância ("acima de 0,45
 * usa preto"), e ela errava no meio da escala: para o ciano do Fluxo o corte
 * mandava branco, quando preto rendia mais contraste ali. Corte fixo é um
 * palpite sobre onde a virada acontece. Comparar as duas razões não é palpite
 * nenhum, e é a mesma conta, feita duas vezes.
 */
export function textoSobreACor(hex: string): "#ffffff" | "#111827" {
  return contraste(hex, "#111827") > contraste(hex, "#ffffff")
    ? "#111827"
    : "#ffffff";
}

/** Razão de contraste da WCAG entre duas cores em hex de seis dígitos. */
export function contraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const canal = (i: number) => {
      const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
  };
  const [x, y] = [luz(a), luz(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
