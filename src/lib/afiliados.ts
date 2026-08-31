// As regras do programa de afiliados que não precisam de banco.
//
// Ficam aqui, puras e testadas, pelo mesmo motivo que a distribuição de
// prêmios ficou em lib/distribuicao.ts: dinheiro e recompensa não podem
// depender de rodar uma compra de verdade para saber se estão certos. O que
// precisa de banco (cadeado, transação, corrida entre duas abas) mora em
// server/services/afiliados.ts.
//
// TUDO EM CENTAVOS, INTEIRO.
//
// R$ 10,00 é 1000. Somar 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004,
// e num programa que acumula centavo a centavo até fechar dez reais isso vira
// entrada a mais ou a menos no fim do mês. O banco guarda Int pela mesma
// razão.

/** Quanto os indicados precisam pagar para o afiliado ganhar uma entrada. */
export const LIMIAR_DA_ENTRADA_EM_CENTAVOS = 1000;

/** Quanto tempo o código de quem indicou sobrevive até o cadastro. */
export const DIAS_DO_COOKIE_DE_INDICACAO = 30;

/** O cookie que carrega o código entre a chegada pelo link e o cadastro. */
export const COOKIE_DE_INDICACAO = "qos_ref";

/** O maior código aceito. Cabe na tela e no boca a boca. */
export const TAMANHO_MAXIMO_DO_CODIGO = 20;
const TAMANHO_MINIMO_DO_CODIGO = 4;

/**
 * O código como ele é guardado e comparado.
 *
 * Maiúsculas, sem acento, sem espaço, só A-Z, 0-9 e _. Quem digita
 * "mateus 7k" no campo e quem recebe "MATEUS7K" no WhatsApp precisam chegar
 * no mesmo afiliado: comparar o que veio cru faria o primeiro não achar
 * ninguém e o cadastro sair sem vínculo, em silêncio.
 *
 * Devolve string vazia quando não sobrou nada aproveitável.
 */
export function normalizarCodigo(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, TAMANHO_MAXIMO_DO_CODIGO);
}

/** Um código digitado serve? Vale para o campo do cadastro e para o painel. */
export function codigoValido(bruto: string): boolean {
  const limpo = normalizarCodigo(bruto);
  return limpo.length >= TAMANHO_MINIMO_DO_CODIGO;
}

/**
 * Um código a partir do nome da pessoa, para quando o admin não escolhe um.
 *
 * "Mateus Nascimento" vira "MATEUS" mais um sufixo curto. O sufixo não é
 * enfeite: dois "Lucas Silva" no mesmo tenant colidiriam no índice unique, e
 * o cadastro do segundo afiliado falharia sem explicação.
 */
export function codigoSugerido(nome: string, sufixo: string): string {
  const base = normalizarCodigo(nome.split(/\s+/)[0] ?? "").slice(0, 10);
  const limpo = normalizarCodigo(sufixo).slice(0, 4);
  const junto = `${base || "AFILIADO"}${limpo}`;
  return junto.slice(0, TAMANHO_MAXIMO_DO_CODIGO);
}

export interface Recompensa {
  /** Quantas entradas esta compra liberou. */
  entradas: number;
  /** O que sobra para a próxima, em centavos. */
  progressoRestante: number;
}

/**
 * Quantas entradas uma compra libera, e o que sobra para a próxima.
 *
 * O progresso é acumulativo e não perde centavo: R$ 27,50 de compras dão duas
 * entradas e deixam R$ 7,50 guardados; a compra seguinte de R$ 4,00 leva o
 * acumulado a R$ 11,50, libera a terceira entrada e deixa R$ 1,50.
 *
 * Valor negativo é aceito de propósito: é assim que o estorno desfaz o que a
 * compra tinha somado. O progresso nunca fica abaixo de zero, e entradas já
 * concedidas não são retiradas aqui (quem decide isso é o serviço, que sabe
 * se a entrada já foi gasta).
 */
export function calcularRecompensa({
  progressoAnterior,
  valorEmCentavos,
  limiar = LIMIAR_DA_ENTRADA_EM_CENTAVOS,
}: {
  progressoAnterior: number;
  valorEmCentavos: number;
  limiar?: number;
}): Recompensa {
  if (limiar <= 0) {
    throw new Error("O limiar da entrada precisa ser maior que zero");
  }

  const total = progressoAnterior + valorEmCentavos;
  if (total <= 0) {
    return { entradas: 0, progressoRestante: 0 };
  }

  return {
    entradas: Math.floor(total / limiar),
    progressoRestante: total % limiar,
  };
}

/** Reais (o que o banco guarda como Decimal) para centavos inteiros. */
export function emCentavos(valorEmReais: number): number {
  return Math.round(valorEmReais * 100);
}

/** Centavos para reais, para formatar na tela. */
export function emReais(centavos: number): number {
  return centavos / 100;
}

/** Quanto falta para a próxima entrada, em centavos. */
export function faltaParaProximaEntrada(
  progressoEmCentavos: number,
  limiar = LIMIAR_DA_ENTRADA_EM_CENTAVOS,
): number {
  const dentro = ((progressoEmCentavos % limiar) + limiar) % limiar;
  return limiar - dentro;
}

/** O link que o afiliado compartilha. */
export function linkDeIndicacao(origem: string, codigo: string): string {
  const base = origem.replace(/\/+$/, "");
  return `${base}/?ref=${codigo}`;
}
