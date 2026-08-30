// O prazo de entrega da skin: 72 horas a partir do sorteio.
//
// É promessa feita ao ganhador, então a tela de operação precisa dizer, de
// relance, quais entregas ainda cabem no prazo e quais já não cabem. Uma fila
// ordenada por data não responde isso: sorteios de horas diferentes do mesmo
// dia têm prazos diferentes, e a conta de cabeça é onde o atraso passa batido.

/** O que é prometido ao ganhador. Mudar aqui muda a tela inteira. */
export const PRAZO_DE_ENTREGA_HORAS = 72;

const HORA = 3_600_000;

export type EstadoDoPrazo =
  /** Ainda não saiu, e sobra tempo. */
  | "no_prazo"
  /** Ainda não saiu, e falta pouco. */
  | "perto"
  /** Ainda não saiu, e o prazo já venceu. */
  | "atrasada"
  /** Saiu dentro do prazo. */
  | "cumprida"
  /** Saiu, mas depois do prazo. */
  | "estourada";

export interface SituacaoDoPrazo {
  estado: EstadoDoPrazo;
  /** Horas que faltam, ou horas de atraso, ou horas que a entrega levou. */
  horas: number;
  rotulo: string;
}

/** Abaixo disto o aviso muda de cor: é quando ainda dá para correr. */
const HORAS_DE_ALERTA = 12;

/**
 * Onde esta entrega está em relação ao prazo.
 *
 * `enviadoEm` nulo é "ainda não saiu". Com data, a conta deixa de ser sobre o
 * futuro e passa a ser sobre o que aconteceu: entregou dentro ou fora.
 */
export function situacaoDoPrazo(
  sorteadoEm: Date | null,
  enviadoEm: Date | null,
  agora: Date,
): SituacaoDoPrazo | null {
  // Sem a data do sorteio não há de onde contar. Devolve nulo em vez de
  // inventar um começo, que produziria um prazo falso com cara de verdadeiro.
  if (!sorteadoEm) return null;

  const limite = sorteadoEm.getTime() + PRAZO_DE_ENTREGA_HORAS * HORA;

  if (enviadoEm) {
    const levou = Math.max(0, enviadoEm.getTime() - sorteadoEm.getTime());
    const horas = Math.round(levou / HORA);
    return enviadoEm.getTime() <= limite
      ? { estado: "cumprida", horas, rotulo: `enviada em ${horas}h` }
      : { estado: "estourada", horas, rotulo: `enviada em ${horas}h` };
  }

  const faltam = limite - agora.getTime();
  if (faltam < 0) {
    // Arredonda para cima: uma hora e meia de atraso é "2h" e não "1h". Para
    // menos, o aviso ficaria mais brando do que a realidade.
    const horas = Math.ceil(-faltam / HORA);
    return { estado: "atrasada", horas, rotulo: `atrasada ${horas}h` };
  }

  const horas = Math.floor(faltam / HORA);
  return {
    estado: horas <= HORAS_DE_ALERTA ? "perto" : "no_prazo",
    horas,
    rotulo: `faltam ${horas}h`,
  };
}
