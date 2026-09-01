// Limites do upload de imagem de sorteio, num lugar só.
//
// O texto de ajuda no painel e a validação no servidor precisam concordar:
// quando divergem, a pessoa lê uma regra e leva erro por outra.

/** Quantas imagens uma campanha aceita. Aplicado no servidor. */
export const MAX_IMAGES_PER_RAFFLE = 8;

/**
 * Teto do que chega na server action. A Vercel corta o corpo de uma função
 * em 4,5 MB e o Next em `bodySizeLimit` (ver next.config.ts), este número
 * fica abaixo dos dois só para produzir uma mensagem clara quando o
 * navegador não conseguiu encolher o arquivo.
 */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * A MOLDURA DA CAMPANHA PRINCIPAL.
 *
 * O card grande do topo da vitrine não tem a mesma proporção dos outros: ele
 * é panorâmico. Uma arte de skin, que é 4:3, entra ali cortada em cima e
 * embaixo, e é a base que se perde primeiro, justamente onde a arte costuma
 * trazer o desgaste escrito.
 *
 * As classes moram aqui, e não soltas no card, porque o painel desenha a
 * MESMA moldura para mostrar o corte antes de a campanha ir ao ar. Duas
 * proporções escritas à mão em dois arquivos viram duas verdades no dia em
 * que uma delas mudar.
 */
export const MOLDURA_DO_DESTAQUE = "aspect-16/9 sm:aspect-2/1";

/** O tamanho que a capa do destaque deveria ter: 2 por 1. */
export const CAPA_DO_DESTAQUE = { largura: 1800, altura: 900 } as const;

/**
 * No celular a mesma capa é exibida em 16:9, que é mais alto que 2:1, então
 * ali o corte vira das LATERAIS. Enviando 2:1, cada lado perde isto:
 *
 *   1 - (16/9) / (2/1) = 11%, divididos entre os dois lados.
 *
 * Daí a única regra que a pessoa precisa lembrar: logo e texto no miolo.
 */
export const CORTE_LATERAL_NO_CELULAR = 0.055;
