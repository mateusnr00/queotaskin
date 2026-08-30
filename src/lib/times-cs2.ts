// O time de CS2 para quem a pessoa torce: o TIPO e as regras de desenho.
//
// A LISTA NÃO MORA MAIS AQUI.
//
// Ela era uma constante neste arquivo, e isso estava certo enquanto ninguém
// precisava mexer nela. Passou a estar errado quando o pedido virou "quero
// enviar o escudo e adicionar times novos": isso é cadastro, e cadastro não
// pode depender de deploy.
//
// Os trinta times viraram linhas da tabela Team, levados pela migration
// 20260830100000_times_no_banco com os MESMOS ids, que é o que impede alguém
// de perder o time que já tinha escolhido. Quem lê é
// src/server/services/times.ts.
//
// O que sobrou aqui é o que não depende de banco: o formato de um time, e a
// conta que decide a cor do texto sobre o escudo de reserva.

export type RegiaoDoTime = "BR" | "INTER";

export interface TimeDeCS2 {
  /** Slug. É o que User.favoriteTeamId guarda. */
  id: string;
  nome: string;
  /** Duas a quatro letras. É o que o emblema mostra quando não há imagem. */
  tag: string;
  /** Acento do emblema de reserva. Ver a nota sobre cores no topo. */
  cor: string;
  regiao: RegiaoDoTime;
  /** URL do escudo no Storage. Vazio cai no emblema de iniciais. */
  escudo?: string | null;
}

/** Aceita hex de seis dígitos em minúsculas. É o que o emblema sabe desenhar. */
export const COR_VALIDA = /^#[0-9a-f]{6}$/;

/**
 * A tag cabe no emblema, que corta em quatro.
 * Menos de duas letras não identifica time nenhum.
 */
export const TAG_VALIDA = /^.{2,4}$/;

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
