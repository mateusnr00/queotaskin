// A cota em dobro: quem compra durante a janela leva dois números por cada um
// que pagou.
//
// O preço não muda. Quem escolhe 10 paga 10 e recebe 20. É por isso que a
// promoção não mexe em `totalAmount` em lugar nenhum: ela mexe em quantos
// bilhetes saem, e só.
//
// Regras aqui dentro são puras, sem banco e sem relógio implícito: quem chama
// passa o instante. É o que permite testar a virada da janela sem esperar a
// hora chegar, e o que evita a divergência entre o servidor decidir uma coisa
// e a tela mostrar outra.

export interface JanelaDoDobro {
  ativa: boolean;
  inicio: Date | null;
  fim: Date | null;
}

/**
 * A promoção vale agora?
 *
 * Sem datas, vale enquanto o interruptor estiver ligado. Com datas, respeita a
 * janela. O caso comum é só a data de fim: começa quando você liga e tem hora
 * marcada para acabar, que é de onde vem a pressa.
 */
export function dobroAtivo(janela: JanelaDoDobro, agora: Date): boolean {
  if (!janela.ativa) return false;
  if (janela.inicio && agora < janela.inicio) return false;
  if (janela.fim && agora >= janela.fim) return false;
  return true;
}

/**
 * A promoção ainda vai começar? Usado para anunciar antes da hora, que é o que
 * faz a pessoa voltar.
 */
export function dobroAgendado(janela: JanelaDoDobro, agora: Date): boolean {
  return Boolean(janela.ativa && janela.inicio && agora < janela.inicio);
}

/** Quantos bilhetes saem para uma quantidade escolhida. */
export function bilhetesDe(quantidade: number, comDobro: boolean): number {
  return comDobro ? quantidade * 2 : quantidade;
}

export interface Contagem {
  horas: number;
  minutos: number;
  segundos: number;
  /** Total em segundos, para quem precisa decidir se ainda há tempo. */
  total: number;
}

/**
 * O tempo que falta, já quebrado.
 *
 * Horas não viram dias de propósito: "encerra em 32:10:05" pressiona mais do
 * que "1 dia e 8 horas", que soa como se desse para deixar para depois. E
 * nunca devolve negativo, porque contador que passa do zero e continua
 * contando para trás é o tipo de detalhe que faz a página parecer quebrada.
 */
export function contagemRegressiva(fim: Date, agora: Date): Contagem {
  const total = Math.max(0, Math.floor((fim.getTime() - agora.getTime()) / 1000));
  return {
    horas: Math.floor(total / 3600),
    minutos: Math.floor((total % 3600) / 60),
    segundos: total % 60,
    total,
  };
}

/** "24:48:29", com dois dígitos em cada parte. */
export function formatarContagem(c: Contagem): string {
  const dd = (n: number) => String(n).padStart(2, "0");
  return `${dd(c.horas)}:${dd(c.minutos)}:${dd(c.segundos)}`;
}

/**
 * A mesma contagem em palavras, para quem ouve a página.
 *
 * O relógio que pisca é `aria-hidden`: um número que muda a cada segundo dentro
 * de uma região viva faria o leitor de tela interromper a leitura sessenta
 * vezes por minuto. Aqui a frase é dita uma vez, com a granularidade que basta
 * para decidir.
 */
export function contagemEmPalavras(c: Contagem): string {
  if (c.total <= 0) return "A promoção terminou.";
  if (c.horas > 0) {
    const h = `${c.horas} hora${c.horas === 1 ? "" : "s"}`;
    if (c.minutos === 0) return `A promoção termina em cerca de ${h}.`;
    return `A promoção termina em cerca de ${h} e ${c.minutos} minuto${
      c.minutos === 1 ? "" : "s"
    }.`;
  }
  if (c.minutos > 0) {
    return `A promoção termina em cerca de ${c.minutos} minuto${
      c.minutos === 1 ? "" : "s"
    }.`;
  }
  return "A promoção termina em menos de um minuto.";
}

/**
 * Quanto da janela ainda resta, de 0 a 100.
 *
 * A barra precisa dos dois extremos para dizer a verdade: sem o começo, não
 * existe "quanto já passou", só "quanto falta", e qualquer barra desenhada aí
 * seria chute. Por isso o painel grava o instante em que a promoção foi ligada
 * quando ninguém informa uma data de início.
 *
 * Devolve null quando não dá para saber, e aí a faixa mostra só o relógio.
 */
export function percentualRestante(
  inicio: Date | null,
  fim: Date | null,
  agora: Date,
): number | null {
  if (!inicio || !fim) return null;
  const total = fim.getTime() - inicio.getTime();
  if (total <= 0) return null;
  const restante = fim.getTime() - agora.getTime();
  const pct = (restante / total) * 100;
  return Math.min(100, Math.max(0, pct));
}
