// Como um número de título é escrito, e como uma lista deixa de seguir a
// ordem de cadastro.
//
// As duas coisas moram juntas porque as duas nasceram do mesmo tipo de
// defeito: uma regra de apresentação escrita à mão em cada tela, cada uma com
// uma resposta diferente para a mesma pergunta.

/**
 * O número do título, com a quantidade de casas da campanha.
 *
 * O mesmo título aparecia de três jeitos: "30" na página da campanha, "030" na
 * transmissão e "0030" na home, que cravava quatro casas na mão. Numa campanha
 * de cem cotas, "0030" inventa um dígito que não existe: ela vai até 100, não
 * até 9999. Agora a largura vem do tamanho da campanha, num lugar só.
 *
 * Duas casas no mínimo, porque "7" sozinho não se parece com um título.
 */
export function numeroDoTitulo(numero: number, totalNumbers: number): string {
  return String(numero).padStart(casasDoTitulo(totalNumbers), "0");
}

/** Quantos dígitos os títulos desta campanha têm. */
export function casasDoTitulo(totalNumbers: number): number {
  return Math.max(2, String(Math.max(1, Math.floor(totalNumbers))).length);
}

/**
 * Uma bagunça estável a partir de um texto.
 *
 * Existe porque a ordem "aleatória" das caixas surpresas não era aleatória: ela
 * ordenava pelo `id`, e o cuid do Prisma começa com o instante da criação. Ou
 * seja, ordenava por data de cadastro, com outro nome. Conferido no banco de
 * produção: a ordem por id saiu idêntica à ordem de cadastro nas sete linhas,
 * então o prêmio cadastrado primeiro ficava sempre no topo, e a lista fechada
 * mostra só os cinco primeiros.
 *
 * Precisa ser ESTÁVEL, e não sorteada a cada visita: a página é renderizada no
 * servidor, e uma lista que troca de posição a cada atualização parece
 * defeito. FNV-1a resolve as duas coisas: mesma entrada dá sempre a mesma
 * saída, e saídas de entradas parecidas não têm nada a ver uma com a outra.
 */
export function embaralhamentoEstavel(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    // O multiplicador do FNV-1a, em partes, para não estourar a precisão de
    // ponto flutuante que o JavaScript usa em números comuns.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Ordena por uma bagunça estável, sem seguir a ordem de cadastro.
 *
 * Empate desfeito pela própria chave, para a ordenação ser determinística
 * mesmo na chance remota de dois textos caírem no mesmo hash.
 */
export function ordemEmbaralhada<T>(
  itens: readonly T[],
  chave: (item: T) => string,
): T[] {
  return [...itens].sort((a, b) => {
    const ha = embaralhamentoEstavel(chave(a));
    const hb = embaralhamentoEstavel(chave(b));
    return ha === hb ? chave(a).localeCompare(chave(b)) : ha - hb;
  });
}
