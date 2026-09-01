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

/**
 * Quanto UMA pessoa indicada precisa pagar para liberar o cupom dela.
 *
 * Por pessoa, e não por afiliado: dois indicados gastando R$ 5 cada não
 * liberam nada, e o mesmo indicado gastando R$ 1.000 libera um só.
 */
export const LIMIAR_DA_ENTRADA_EM_CENTAVOS = 1000;

/**
 * O valor de face do Cupom de Entrada.
 *
 * Ele cobre UMA cota até esse valor, é consumido por inteiro e não deixa
 * troco: cota de R$ 7 gasta o cupom e os R$ 3 somem; cota de R$ 12 recusa o
 * cupom, porque não existe pagamento complementar.
 */
export const VALOR_DO_CUPOM_EM_CENTAVOS = 1000;

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

export interface Qualificacao {
  /** A pessoa alcançou o limiar e o cupom pode ser concedido agora. */
  qualificou: boolean;
  /** Quanto ainda falta, em centavos. Zero quando já alcançou. */
  faltaEmCentavos: number;
}

/**
 * Esta pessoa indicada já libera o cupom dela?
 *
 * NÃO É PROGRESSIVO, e essa é a regra inteira. A conta não é "quantos blocos
 * de R$ 10 cabem no que ela gastou": é um sim ou não, uma vez na vida.
 * R$ 10, R$ 20, R$ 100 ou R$ 1.000 do mesmo indicado dão o mesmo resultado,
 * um cupom, e depois dele nada mais.
 *
 * `jaQualificou` entra porque quem já recebeu não recebe de novo nem quando o
 * total continua subindo. Quem decide isso no banco é a linha de qualificação,
 * única por pessoa; aqui é só a aritmética.
 */
export function avaliarQualificacao({
  pagoEmCentavos,
  jaQualificou,
  limiar = LIMIAR_DA_ENTRADA_EM_CENTAVOS,
}: {
  pagoEmCentavos: number;
  jaQualificou: boolean;
  limiar?: number;
}): Qualificacao {
  if (limiar <= 0) {
    throw new Error("O limiar da qualificação precisa ser maior que zero");
  }
  if (jaQualificou) return { qualificou: false, faltaEmCentavos: 0 };

  const pago = Math.max(0, pagoEmCentavos);
  return {
    qualificou: pago >= limiar,
    faltaEmCentavos: Math.max(0, limiar - pago),
  };
}

/**
 * Quanto o cupom abate desta compra, e se ele pode ser usado.
 *
 * O cupom cobre UMA cota, até o valor de face. Acima disso ele é recusado
 * inteiro: não existe usar R$ 10 do cupom e completar R$ 2 no Pix, porque
 * "cupom que cobre parte da cota" é outro produto, com outra conversa na hora
 * de explicar o que a pessoa ganhou.
 */
export function descontoDoCupom({
  precoDaCotaEmCentavos,
  valorDoCupomEmCentavos = VALOR_DO_CUPOM_EM_CENTAVOS,
}: {
  precoDaCotaEmCentavos: number;
  valorDoCupomEmCentavos?: number;
}): { aceita: boolean; descontoEmCentavos: number } {
  if (precoDaCotaEmCentavos <= 0) {
    return { aceita: false, descontoEmCentavos: 0 };
  }
  if (precoDaCotaEmCentavos > valorDoCupomEmCentavos) {
    return { aceita: false, descontoEmCentavos: 0 };
  }
  // Cobre a cota inteira e o que sobrar do cupom se perde: sem troco, sem
  // saldo, sem segunda cota.
  return { aceita: true, descontoEmCentavos: precoDaCotaEmCentavos };
}

/** Reais (o que o banco guarda como Decimal) para centavos inteiros. */
export function emCentavos(valorEmReais: number): number {
  return Math.round(valorEmReais * 100);
}

/** Centavos para reais, para formatar na tela. */
export function emReais(centavos: number): number {
  return centavos / 100;
}

/** O link que o afiliado compartilha. */
export function linkDeIndicacao(origem: string, codigo: string): string {
  const base = origem.replace(/\/+$/, "");
  return `${base}/?ref=${codigo}`;
}
