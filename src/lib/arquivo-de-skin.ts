// O que dá para ler do NOME DE UM ARQUIVO de arte de skin.
//
// Quem prepara as artes salva o arquivo com o nome da skin e o desgaste
// dentro: "AK-47 | Redline (Field-Tested).png", "awp asiimov ft.jpg",
// "★ Karambit | Doppler (Factory New) (1).webp". Uma pasta inteira assim é
// um cadastro pronto, desde que alguém leia o nome do arquivo com o mesmo
// critério que a pessoa usou para escrevê-lo.
//
// Este arquivo faz só a leitura, e nada de banco: recebe o nome, devolve o
// que ele diz. A decisão de qual skin do catálogo é essa fica para quem
// chama, com `procurar` de cs2-catalogo.ts, e o casamento fraco vira uma
// linha de "não achei" no relatório, nunca um cadastro em silêncio.

import type { SkinWear } from "@prisma/client";

/** O que sobrou depois de tirar o desgaste e o resto do enfeite. */
export interface LeituraDoArquivo {
  /** O nome da skin, como ele aparece no arquivo, sem o desgaste. */
  nome: string;
  /** Null quando o arquivo não diz o desgaste, que é caso legítimo. */
  wear: SkinWear | null;
  statTrak: boolean;
  souvenir: boolean;
}

/**
 * Como cada desgaste pode estar escrito.
 *
 * A ordem importa: as formas longas são testadas antes das siglas, senão
 * "Field-Tested" casaria em "ft" no meio de outra palavra. As siglas só valem
 * como palavra inteira, e é por isso que elas entram na expressão com limite
 * de palavra e não como pedaço solto.
 */
const ESCRITAS: { wear: SkinWear; formas: string[] }[] = [
  {
    wear: "FACTORY_NEW",
    formas: ["factory new", "nova de fabrica", "fn"],
  },
  {
    wear: "MINIMAL_WEAR",
    formas: ["minimal wear", "pouco usada", "mw"],
  },
  {
    wear: "FIELD_TESTED",
    formas: ["field tested", "testada em campo", "ft"],
  },
  {
    wear: "WELL_WORN",
    formas: ["well worn", "bem desgastada", "ww"],
  },
  {
    wear: "BATTLE_SCARRED",
    formas: ["battle scarred", "veterana de guerra", "bs"],
  },
];

/** Extensões de imagem que a pasta costuma trazer. */
const EXTENSAO = /\.(png|jpe?g|webp|gif|avif|bmp)$/i;

/**
 * Reduz um pedaço de texto ao que dá para comparar, do mesmo jeito que
 * cs2-catalogo faz com o nome digitado: sem acento, sem caixa, com hífen e
 * pontuação virando espaço. "Field-Tested" e "field tested" viram iguais.
 */
function achatar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lê o nome de um arquivo de arte.
 *
 * A ordem das limpezas é a ordem em que o lixo aparece na vida real: primeiro
 * a extensão, depois o sufixo que o download em massa gruda no fim ("(1)",
 * "cópia"), depois a numeração que quem organiza a pasta põe na frente
 * ("01 - AWP Asiimov"), e só então o desgaste. Fazer o desgaste antes faria
 * "(1)" e "(Field-Tested)" disputarem o mesmo parêntese.
 */
export function lerArquivoDeSkin(nomeDoArquivo: string): LeituraDoArquivo {
  // Só o nome do arquivo, mesmo quando o navegador entrega o caminho inteiro
  // (é o que acontece quando a pessoa escolhe uma pasta em vez de arquivos).
  const base = nomeDoArquivo.split(/[/\\]/).pop() ?? nomeDoArquivo;

  let texto = base.replace(EXTENSAO, "");

  // "(1)", "(2)", " - Copia", " copy": o rastro de baixar a pasta duas vezes.
  texto = texto
    .replace(/\s*\((\d+)\)\s*$/, " ")
    .replace(/\s*[-–]?\s*(c[oó]pia|copy)\s*$/i, " ");

  // Numeração de ordenação na frente: "01 - ", "1. ", "003_".
  texto = texto.replace(/^\s*\d{1,3}\s*[-._)]\s*/, "");

  // Os dois selos que mudam o item sem mudar a pintura. Ficam só no relatório:
  // quem casa a skin é o nome, e `normalizar` de cs2-catalogo já os ignora.
  const achatado = achatar(texto);
  const statTrak = /\bstattrak\b/.test(achatado) || texto.includes("™");
  const souvenir = /\bsouvenir\b/.test(achatado);

  const { nome, wear } = separarDesgaste(texto);

  return {
    // O nome sai limpo de espaço dobrado e do enfeite que a Steam usa, mas
    // com a pontuação original: é ele que aparece no relatório, e "AK-47 |
    // Redline" é mais fácil de conferir do que "ak 47 redline".
    nome: nome
      .replace(/[_]+/g, " ")
      .replace(/\s*\|\s*/g, " | ")
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–|]+|[\s\-–|]+$/g, "")
      .trim(),
    wear,
    statTrak,
    souvenir,
  };
}

/**
 * Tira o desgaste do texto e diz qual era.
 *
 * Duas passadas, e não uma: primeiro o desgaste entre parênteses, que é como
 * a Steam escreve e é o caso sem ambiguidade nenhuma; só se não houver, a
 * sigla ou o nome solto no fim, que é como quem digita de cabeça escreve.
 * Procurar solto no meio do nome seria pedir para "MW" da coleção de alguma
 * arma virar Minimal Wear.
 */
function separarDesgaste(texto: string): { nome: string; wear: SkinWear | null } {
  for (const { wear, formas } of ESCRITAS) {
    for (const forma of formas) {
      // Entre parênteses, em qualquer lugar do nome.
      const entreParenteses = new RegExp(
        `\\(\\s*${forma.replace(/ /g, "[\\s._-]*")}\\s*\\)`,
        "i",
      );
      if (entreParenteses.test(achatarMantendoParenteses(texto))) {
        return {
          nome: removerPorAchatado(texto, entreParenteses),
          wear,
        };
      }
    }
  }

  // Sem parênteses: só no FIM do nome, que é onde o desgaste é escrito.
  for (const { wear, formas } of ESCRITAS) {
    for (const forma of formas) {
      const noFim = new RegExp(`[\\s._-]${forma.replace(/ /g, "[\\s._-]+")}$`, "i");
      if (noFim.test(achatarMantendoParenteses(texto))) {
        return { nome: removerPorAchatado(texto, noFim), wear };
      }
    }
  }

  return { nome: texto, wear: null };
}

/**
 * A versão comparável do texto que ainda preserva as posições dos caracteres.
 *
 * Trocar acento por letra simples mudaria o tamanho da string e o índice do
 * recorte não serviria mais. Por isso a troca é caractere a caractere, e o
 * único que muda é o acento composto, que é normalizado antes.
 */
function achatarMantendoParenteses(texto: string): string {
  return texto.normalize("NFC").toLowerCase();
}

/** Recorta do texto original o pedaço que a expressão achou no achatado. */
function removerPorAchatado(texto: string, expressao: RegExp): string {
  const achatado = achatarMantendoParenteses(texto);
  const achado = achatado.match(expressao);
  if (!achado || achado.index === undefined) return texto;
  return (
    texto.slice(0, achado.index) + " " + texto.slice(achado.index + achado[0].length)
  );
}
