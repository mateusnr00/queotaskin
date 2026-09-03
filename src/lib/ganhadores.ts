// Quem entra na lista de ganhadores da home.
//
// Duas origens viram uma lista só: o sorteio da campanha (Draw, com o número
// sorteado) e o título premiado (AwardedTicket, o prêmio instantâneo).
//
// A REGRA QUE ESTA FUNÇÃO EXISTE PARA GUARDAR
//
// Número premiado sem dono NÃO É GANHADOR.
//
// Título premiado é configuração: quem opera escolhe quais números pagam
// prêmio ANTES de vender. Enquanto ninguém compra aquele número, não existe
// ganhador nenhum. A home chegou a resolver isso com um `?? "Ganhador"`, e o
// efeito foi anunciar prêmio que ninguém levou, com nome genérico, telefone
// vazio e premiação em branco. Num site de sorteio isso não é cartão feio, é
// informação falsa, e é o tipo de coisa que volta sozinha quando mora solta
// no meio de uma página.

export interface CandidatoAGanhador {
  chave: string;
  drawDate: Date | null;
  /** Nulo quando ninguém segurava o número. */
  winnerName: string | null;
}

export type Ganhador<T extends CandidatoAGanhador> = T & { winnerName: string };

/**
 * Filtra quem tem ganhador de verdade e ordena do mais recente ao mais antigo.
 *
 * O corte acontece aqui, e não na consulta, porque o ganhador só se conhece
 * depois de cruzar o número premiado com o título pago.
 */
export function apenasComGanhador<T extends CandidatoAGanhador>(
  candidatos: T[],
  maximo: number,
): Ganhador<T>[] {
  return candidatos
    .filter((g): g is Ganhador<T> => g.winnerName !== null)
    // Sem data vai para o fim, e não para o topo: `null` comparado com número
    // daria NaN e embaralharia a lista inteira.
    .sort((a, b) => (b.drawDate?.getTime() ?? 0) - (a.drawDate?.getTime() ?? 0))
    .slice(0, maximo);
}
