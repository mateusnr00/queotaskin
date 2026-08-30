/**
 * Texto pronto para comparar: sem acento, sem caixa, sem espaço nas pontas.
 *
 * Existe porque busca que exige acento certo é busca que não funciona. Quem
 * procura o time digita "sao paulo" e "SÃO PAULO", e as duas têm que achar a
 * mesma coisa. No celular, então, cobrar o acento é cobrar um caminho a mais
 * no teclado para cada tentativa.
 *
 * NFD separa a letra do acento e o intervalo ̀-ͯ apaga só os
 * acentos, preservando a letra. É a forma padrão de fazer isso sem tabela de
 * substituição escrita à mão, que sempre esquece um caractere.
 */
export function semAcento(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
