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
