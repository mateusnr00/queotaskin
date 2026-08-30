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

/**
 * O título que a fita do carretel mostra numa dada posição.
 *
 * Determinístico de propósito, e isso é questão de confiança, não de estilo.
 *
 * A fita sorteava cada número com `Math.random()`, então a mesma transmissão,
 * reaberta, mostrava uma sequência diferente. O resultado era sempre o mesmo,
 * mas quem assistia duas vezes via os números do meio mudarem, e a leitura
 * natural disso é que a coisa toda é improvisada na hora. Foi exatamente essa
 * a reclamação, e ela é justa: numa página cujo argumento é "confira você
 * mesmo", nada pode mudar entre uma visita e outra.
 *
 * Agora a posição e o código do sorteio decidem o número. Mesmo sorteio, mesma
 * fita, para todo mundo e em toda visita. O replay é idêntico ao ao vivo.
 *
 * Isso também conserta dois defeitos silenciosos: `Math.random()` durante a
 * renderização faz o servidor e o navegador desenharem números diferentes, e a
 * hidratação briga; e é impuro, o que o compilador do React recusa.
 *
 * @param bolo   Os títulos que disputaram. Vazio cai no intervalo da campanha.
 */
export function tituloDaFita(
  semente: string,
  posicao: number,
  bolo: readonly number[],
  totalNumbers: number,
): number {
  const h = embaralhamentoEstavel(`${semente}:${posicao}`);
  if (bolo.length > 0) return bolo[h % bolo.length];
  return 1 + (h % Math.max(1, Math.floor(totalNumbers)));
}

/**
 * Onde a cauda da fita mora.
 *
 * Índice alto de propósito: o giro anda de um em um a partir do 3, e mesmo uma
 * espera de horas não chega perto daqui. Assim os índices da cauda nunca
 * colidem com os do giro, e o fim da fita não depende de quanto ela girou.
 */
export const INICIO_DA_CAUDA = 1_000_000;

/**
 * O título de um passo da cauda.
 *
 * `evitar` é o vencedor: nos dois passos que sobram VISÍVEIS no quadro final,
 * repetir o número do meio faria a tela mostrar o mesmo título duas vezes, que
 * parece defeito. Procura em índices vizinhos até achar outro, e desiste
 * depois de algumas tentativas, porque numa campanha de um número só não
 * existe outro para achar.
 */
export function tituloDaCauda(
  semente: string,
  passo: number,
  amostra: readonly number[],
  totalNumbers: number,
  evitar?: number | null,
): number {
  const base = INICIO_DA_CAUDA + passo * 16;
  let escolhido = tituloDaFita(semente, base, amostra, totalNumbers);
  for (let i = 1; i < 12 && evitar != null && escolhido === evitar; i++) {
    escolhido = tituloDaFita(semente, base + i, amostra, totalNumbers);
  }
  return escolhido;
}
