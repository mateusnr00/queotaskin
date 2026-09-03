// Quando o formulário consulta a Steam sozinho, e quando ele ignora a
// resposta que chegou.
//
// As duas regras vivem fora do componente porque são as duas que erram em
// silêncio: consultar demais só aparece como lentidão e como limite de
// requisição estourado lá na frente, e aplicar resposta atrasada aparece como
// "o preço mudou sozinho" numa campanha publicada com o valor de outra skin.
// Fora do React, elas se provam com teste.

import { precoAindaVale } from "@/lib/steam-market";

export interface SkinParaDecidir {
  /** O último preço guardado no catálogo, em reais. */
  skinValueBrl: number | null;
  /** Quando esse preço veio da Steam. Nulo se foi digitado ou nunca veio. */
  precoAtualizadoEm: string | Date | null;
}

/**
 * A escolha de uma skin merece uma consulta à Steam?
 *
 * Não merece quando:
 *
 * - a tela é de edição. A descrição de uma campanha publicada não muda
 *   porque alguém abriu a tela, e o preço dela também não.
 * - a skin já foi consultada neste formulário. Ir e voltar entre duas skins
 *   não pode render uma consulta por clique.
 * - o catálogo já tem preço da Steam dentro da janela em que ele vale. Esse
 *   valor já está na tela e já entrou na descrição: perguntar de novo seria
 *   gastar limite de requisição para receber o mesmo número.
 *
 * Merece em todo o resto, inclusive quando há preço sem data: preço sem
 * procedência pode ter sido digitado à mão, e publicar campanha dizendo que
 * é o preço da Steam seria afirmar o que a Steam nunca disse.
 */
export function deveConsultarPreco({
  skin,
  ehEdicao,
  jaConsultada,
  agora,
}: {
  skin: SkinParaDecidir | null | undefined;
  ehEdicao: boolean;
  jaConsultada: boolean;
  agora?: Date;
}): boolean {
  if (ehEdicao) return false;
  if (!skin) return false;
  if (jaConsultada) return false;

  const temPreco =
    typeof skin.skinValueBrl === "number" &&
    Number.isFinite(skin.skinValueBrl) &&
    skin.skinValueBrl > 0;
  if (!temPreco) return true;

  return !precoAindaVale(skin.precoAtualizadoEm, agora);
}

/**
 * A resposta que acabou de chegar ainda vale?
 *
 * Cada consulta leva um número. Escolher a AWP e logo em seguida a AK dispara
 * duas, e a da AWP pode voltar depois: sem esta comparação, o preço e a
 * descrição da AK são sobrescritos pelos da skin que ninguém escolheu mais.
 * A regra é a mais simples que resolve, e é justamente por ser uma linha que
 * ela precisa de nome e de teste, senão some no próximo refactor.
 */
export function respostaAindaVale(
  meuPedido: number,
  pedidoAtual: number,
): boolean {
  return meuPedido === pedidoAtual;
}
