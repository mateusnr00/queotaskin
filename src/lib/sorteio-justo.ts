// Sorteio verificável: o participante confere o resultado sem precisar
// acreditar em nós.
//
// O motor anterior usava `crypto.randomInt`. É um sorteador honesto e
// imprevisível, mas tem um defeito que nenhuma qualidade criptográfica
// conserta: ninguém de fora consegue verificar. O número saía, a gente
// publicava, e a pessoa acreditava ou não. Numa plataforma onde o prêmio é uma
// skin de mil reais, "confie em nós" é a parte fraca.
//
// COMO FUNCIONA (compromisso e revelação)
//
// 1. Quando a campanha é criada, o sistema sorteia uma SEMENTE secreta de 32
//    bytes e publica só o SHA-256 dela. Esse hash é o compromisso: ele fica
//    visível enquanto as cotas são vendidas.
// 2. Quando a campanha encerra, a lista de títulos elegíveis vira o
//    MANIFESTO, e o SHA-256 do manifesto é a semente pública. Qualquer um
//    recalcula a partir dos números vendidos.
// 3. O índice vencedor é HMAC-SHA256(semente secreta, "sementePública:nonce"),
//    lido como número inteiro de 256 bits, módulo a quantidade de títulos.
// 4. Na revelação, a semente secreta é publicada. Aí dá para conferir três
//    coisas: que o hash bate com o compromisso publicado antes, que o
//    manifesto bate com os títulos, e que o HMAC leva exatamente ao número
//    sorteado.
//
// A ORDEM É O QUE IMPORTA. O compromisso sai ANTES de existir manifesto. Se a
// semente fosse escolhida depois do encerramento, quem opera o site já saberia
// quem está no bolo e poderia gerar mil sementes até achar a que faz ganhar
// quem ele quer. Publicando o hash antes da primeira venda, essa escolha deixa
// de existir: a semente está travada antes de haver alguém para favorecer.
//
// TUDO AQUI RODA NOS DOIS LADOS
//
// Web Crypto, e não `node:crypto`, de propósito: a mesma função que sorteia no
// servidor é a que confere no navegador do participante. Uma implementação só,
// então não existe a possibilidade de o verificador e o sorteador discordarem
// por causa de duas versões da mesma conta.

/** Prova completa de um sorteio. `serverSeed` só é pública após a revelação. */
export interface ProvaDoSorteio {
  /** SHA-256 da semente secreta. O compromisso, publicado antes de tudo. */
  serverSeedHash: string;
  /** A semente secreta. Nula enquanto o resultado não pode ser mostrado. */
  serverSeed: string | null;
  /** SHA-256 do manifesto: recalculável a partir dos títulos elegíveis. */
  clientSeed: string;
  /** Contador do sorteio. Um por campanha, hoje sempre 1. */
  nonce: number;
  /** Quantos títulos disputaram. */
  ticketCount: number;
  /** Posição sorteada dentro do manifesto, de 0 a ticketCount-1. */
  winnerIndex: number;
  /** O título vencedor: o que está nessa posição. */
  winningNumber: number;
  /** O HMAC inteiro, em hexadecimal. */
  hmacHex: string;
}

const texto = new TextEncoder();

function paraHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A semente secreta: 32 bytes aleatórios. Só o servidor gera. */
export function gerarSemente(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return paraHex(bytes.buffer);
}

/** SHA-256 em hexadecimal. */
export async function sha256(valor: string): Promise<string> {
  return paraHex(await crypto.subtle.digest("SHA-256", texto.encode(valor)));
}

/** O compromisso publicado antes do sorteio. */
export function hashDaSemente(semente: string): Promise<string> {
  return sha256(semente);
}

/**
 * O manifesto canônico: os títulos elegíveis, em ordem crescente, um por
 * linha.
 *
 * "Canônico" é a palavra que faz a verificação existir. Quem confere precisa
 * chegar exatamente ao mesmo texto que o servidor usou, byte por byte, ou o
 * hash não bate e a prova falha sem nada de errado ter acontecido. Ordem
 * crescente e uma linha por título é a regra, e ela não muda.
 *
 * Números repetidos são descartados: o mesmo título não pode ocupar duas
 * posições no bolo. Na prática o banco já impede pelo índice único
 * (raffleId, number), e a limpeza aqui é o que garante que o verificador
 * chegue ao mesmo resultado mesmo recebendo a lista suja.
 */
export function manifestoCanonico(numeros: readonly number[]): string {
  return titulosCanonicos(numeros).join("\n");
}

/** A mesma lista do manifesto, como números. É o bolo do sorteio. */
export function titulosCanonicos(numeros: readonly number[]): number[] {
  return [...new Set(numeros)].sort((a, b) => a - b);
}

/** A semente pública: SHA-256 do manifesto. */
export function sementeDoManifesto(numeros: readonly number[]): Promise<string> {
  return sha256(manifestoCanonico(numeros));
}

/**
 * O índice sorteado.
 *
 * HMAC-SHA256 com a semente secreta como chave, lido como inteiro de 256 bits
 * e reduzido pelo tamanho do bolo.
 *
 * O módulo aqui tem viés, e vale dizer qual: com 2^256 possibilidades
 * repartidas entre N títulos, as primeiras posições ficam com uma fatia maior
 * na proporção de N/2^256. Para dez milhões de títulos isso é uma diferença na
 * casa decimal 70. Não existe amostragem por rejeição que melhore isso de
 * forma perceptível, e ela custaria a propriedade que importa: com um HMAC só,
 * qualquer pessoa refaz a conta com uma linha de código.
 */
export async function indiceVencedor(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  ticketCount: number,
): Promise<{ winnerIndex: number; hmacHex: string }> {
  if (ticketCount <= 0) throw new Error("Sorteio sem títulos elegíveis");
  const chave = await crypto.subtle.importKey(
    "raw",
    texto.encode(serverSeed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinatura = await crypto.subtle.sign(
    "HMAC",
    chave,
    texto.encode(`${clientSeed}:${nonce}`),
  );
  const hmacHex = paraHex(assinatura);
  const winnerIndex = Number(BigInt(`0x${hmacHex}`) % BigInt(ticketCount));
  return { winnerIndex, hmacHex };
}

/** Roda o sorteio inteiro a partir da semente secreta e dos títulos. */
export async function sortearComProva(
  numeros: readonly number[],
  serverSeed: string,
  nonce = 1,
): Promise<ProvaDoSorteio> {
  const titulos = titulosCanonicos(numeros);
  if (titulos.length === 0) throw new Error("Sorteio sem títulos elegíveis");
  const clientSeed = await sementeDoManifesto(titulos);
  const { winnerIndex, hmacHex } = await indiceVencedor(
    serverSeed,
    clientSeed,
    nonce,
    titulos.length,
  );
  return {
    serverSeedHash: await hashDaSemente(serverSeed),
    serverSeed,
    clientSeed,
    nonce,
    ticketCount: titulos.length,
    winnerIndex,
    winningNumber: titulos[winnerIndex],
    hmacHex,
  };
}

/** O resultado de cada checagem da conferência. */
export interface Conferencia {
  /** A semente secreta já foi publicada? Sem ela não há o que conferir. */
  sementeRevelada: boolean;
  /** O hash da semente publicada bate com o compromisso feito antes? */
  compromissoConfere: boolean;
  /** O manifesto recalculado bate com o que foi usado no sorteio? */
  manifestoConfere: boolean;
  /** A quantidade de títulos bate? */
  quantidadeConfere: boolean;
  /** O HMAC recalculado é o mesmo? */
  hmacConfere: boolean;
  /** O índice sorteado é o mesmo? */
  indiceConfere: boolean;
  /** O título nessa posição é o que foi anunciado? */
  vencedorConfere: boolean;
}

/**
 * Refaz o sorteio a partir dos dados públicos e compara com o que foi
 * anunciado.
 *
 * Roda igual no servidor e no navegador de quem está conferindo. Devolve cada
 * checagem separada de propósito: "não confere" sem dizer o quê não serve para
 * ninguém, e cada linha aponta para uma coisa diferente que poderia estar
 * errada.
 */
export async function conferirProva(
  prova: ProvaDoSorteio,
  numeros: readonly number[],
): Promise<{ ok: boolean; checagens: Conferencia }> {
  const titulos = titulosCanonicos(numeros);
  const clientSeedLocal = await sementeDoManifesto(titulos);

  const checagens: Conferencia = {
    sementeRevelada: prova.serverSeed != null,
    compromissoConfere:
      prova.serverSeed != null &&
      (await hashDaSemente(prova.serverSeed)) === prova.serverSeedHash,
    manifestoConfere: clientSeedLocal === prova.clientSeed,
    quantidadeConfere: titulos.length === prova.ticketCount,
    hmacConfere: false,
    indiceConfere: false,
    vencedorConfere: false,
  };

  if (prova.serverSeed != null && titulos.length > 0) {
    const { winnerIndex, hmacHex } = await indiceVencedor(
      prova.serverSeed,
      clientSeedLocal,
      prova.nonce,
      titulos.length,
    );
    checagens.hmacConfere = hmacHex === prova.hmacHex;
    checagens.indiceConfere = winnerIndex === prova.winnerIndex;
    checagens.vencedorConfere =
      titulos[prova.winnerIndex] === prova.winningNumber;
  }

  return {
    ok: Object.values(checagens).every(Boolean),
    checagens,
  };
}

/** Rótulos em português de cada checagem, para a página de conferência. */
export const ROTULO_DA_CHECAGEM: Record<keyof Conferencia, string> = {
  sementeRevelada: "A chave secreta do sorteio foi publicada",
  compromissoConfere: "A chave publicada é a mesma que foi travada antes",
  manifestoConfere: "A lista de títulos é a mesma que disputou",
  quantidadeConfere: "A quantidade de títulos confere",
  hmacConfere: "O cálculo do sorteio confere",
  indiceConfere: "A posição sorteada confere",
  vencedorConfere: "O título vencedor é o que está nessa posição",
};

/** Como o método é escrito no comprovante. */
export const METODO_VERIFICAVEL = "hmac-sha256 (compromisso e revelação)";
