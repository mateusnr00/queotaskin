// QUANDO cada prêmio instantâneo sai.
//
// O QUE MUDA
//
// Antes o prêmio era escolhido só na hora da abertura: sorteio por chance ou
// uniforme entre os disponíveis. Ninguém, nem quem cadastrou, sabia quando um
// prêmio ia aparecer, e um item grande podia sair na primeira caixa ou não
// sair nunca.
//
// Agora cada prêmio nasce com um PONTO DE SAÍDA, medido em títulos vendidos, e
// esse ponto é uma promessa: o prêmio vai para a PRIMEIRA caixa aberta a
// partir dali. A tela mostra o ponto em porcentagem e deixa editar.
//
// POR QUE EM TÍTULOS E NÃO EM PORCENTAGEM
//
// Porcentagem é leitura, não dado. Guardada como número, ela quebraria no dia
// em que a campanha mudasse o total de números: "40%" viraria outro ponto de
// venda sem ninguém ter mexido no prêmio. Guardando o título, o ponto é o
// mesmo sempre, e a porcentagem se recalcula sozinha.

/** Como o prêmio decide a hora de sair. */
export type TipoDeSaida =
  /** Por andamento da venda: sai ao alcançar um título. */
  | "PROGRESSO"
  /** Por condição da compra: quantidade, data, DDD. */
  | "PERSONALIZADO";

export interface Saida {
  tipo: TipoDeSaida;
  /** O título em que sai. Só em PROGRESSO. */
  emTitulos: number | null;
  /** Faixa de tamanho da COMPRA que pode levar. Só em PERSONALIZADO. */
  titulosDe: number | null;
  titulosAte: number | null;
  dataDe: Date | null;
  dataAte: Date | null;
  /** DDDs que podem levar. Vazio = qualquer um. */
  ddds: string[];
}

/**
 * A fatia do que falta vender em que o novo prêmio pode cair.
 *
 * Com a campanha em 0%, quinze por cento de cem títulos são os quinze
 * primeiros: o prêmio sai cedo, que é o pedido. Com ela em 80%, quinze por
 * cento do que resta são três títulos: sai logo adiante, proporcional ao que
 * ainda há para vender, e não lá no fim.
 */
const JANELA = 0.15;

/**
 * Onde agendar um prêmio novo.
 *
 * Nunca atrás da venda atual, senão ele já nasceria vencido e sairia na
 * primeira caixa sem nenhum critério. E nunca antes de um prêmio já agendado:
 * é isso que faz eles saírem um atrás do outro, na ordem em que foram
 * cadastrados, em vez de dois caírem no mesmo ponto.
 *
 * @param sorteio  Um número de 0 a 1, para o teste conseguir fixar o acaso.
 */
export function agendarSaida(
  {
    vendidos,
    total,
    ultimoAgendado,
  }: { vendidos: number; total: number; ultimoAgendado: number | null },
  sorteio: number = Math.random(),
): number {
  const teto = Math.max(1, Math.floor(total));
  const base = Math.max(0, Math.floor(vendidos), ultimoAgendado ?? 0);

  // Campanha esgotada, ou prêmio cadastrado depois de tudo vendido: o único
  // ponto que sobra é o último. Ele sai na próxima caixa que abrir.
  if (base >= teto) return teto;

  const restante = teto - base;
  const janela = Math.max(1, Math.floor(restante * JANELA));
  const passo = Math.floor(Math.min(Math.max(sorteio, 0), 0.999999) * janela);
  return Math.min(teto, base + 1 + passo);
}

/** O ponto de saída em porcentagem, que é como a tela mostra. */
export function porcentagemDaSaida(
  emTitulos: number | null,
  total: number,
): number | null {
  if (emTitulos == null || total <= 0) return null;
  return Math.min(100, Math.max(0, (emTitulos / total) * 100));
}

export interface CompraQueAbre {
  /** Quantos títulos essa compra levou. */
  titulos: number;
  /** Quando ela foi paga. */
  quando: Date;
  /** DDD do comprador, sem máscara. Nulo quando não há telefone. */
  ddd: string | null;
}

/**
 * A compra casa com as condições de um prêmio personalizado?
 *
 * Faixa aberta dos dois lados: campo em branco não filtra nada. Um
 * personalizado sem nenhuma condição vale para qualquer compra, o que é
 * diferente de não valer para nenhuma.
 */
export function compraCasaComSaida(
  saida: Saida,
  compra: CompraQueAbre,
): boolean {
  if (saida.titulosDe != null && compra.titulos < saida.titulosDe) return false;
  if (saida.titulosAte != null && compra.titulos > saida.titulosAte)
    return false;
  if (saida.dataDe != null && compra.quando < saida.dataDe) return false;
  if (saida.dataAte != null && compra.quando > saida.dataAte) return false;
  if (saida.ddds.length > 0) {
    if (!compra.ddd || !saida.ddds.includes(compra.ddd)) return false;
  }
  return true;
}

export interface PremioAgendado {
  id: string;
  saida: Saida;
}

/**
 * Qual prêmio a caixa que está abrindo agora deve levar.
 *
 * A ORDEM IMPORTA, e ela é a decisão do produto:
 *
 * 1. PROGRESSO já vencido. O ponto de saída é promessa, então ele vem antes de
 *    qualquer sorteio. Entre vários vencidos, o de ponto MAIS BAIXO primeiro:
 *    é o que garante "um atrás do outro" mesmo quando a venda pula vários
 *    pontos de uma vez, numa compra grande.
 *
 * 2. PERSONALIZADO que casa com esta compra. Vem depois porque é condicional:
 *    se ninguém comprar do jeito pedido, ele espera, e não pode segurar a fila
 *    de quem tem hora marcada.
 *
 * 3. Nada agendado para agora: devolve nulo, e quem chamou cai no sorteio por
 *    chance de sempre. A saída agendada manda; a chance é a reserva.
 */
export function premioDaVez(
  premios: readonly PremioAgendado[],
  { vendidos, compra }: { vendidos: number; compra: CompraQueAbre },
): string | null {
  const vencidos = premios
    .filter(
      (p) =>
        p.saida.tipo === "PROGRESSO" &&
        p.saida.emTitulos != null &&
        p.saida.emTitulos <= vendidos,
    )
    .sort((a, b) => a.saida.emTitulos! - b.saida.emTitulos!);
  if (vencidos.length > 0) return vencidos[0]!.id;

  const casando = premios.filter(
    (p) =>
      p.saida.tipo === "PERSONALIZADO" && compraCasaComSaida(p.saida, compra),
  );
  if (casando.length > 0) return casando[0]!.id;

  return null;
}
