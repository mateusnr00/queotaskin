// Geração de CSV para abrir no Excel em português.
//
// Três decisões que parecem detalhe e definem se o arquivo abre certo ou
// vira lixo na tela de quem recebeu.

/**
 * Ponto e vírgula, não vírgula.
 *
 * O Excel em português usa a vírgula como separador decimal, então ele lê um
 * arquivo separado por vírgula como uma coluna só, e "R$ 1,50" quebraria a
 * linha ao meio. Ponto e vírgula é o que o Excel pt-BR espera.
 */
const SEPARADOR = ";";

/**
 * Marca de ordem de bytes no começo do arquivo.
 *
 * Sem ela o Excel assume a codificação do sistema e "João" chega como
 * "JoÃ£o". Três bytes que evitam a base inteira parecer corrompida.
 */
const BOM = "﻿";

/**
 * Caracteres que fazem o Excel tratar a célula como fórmula.
 *
 * Um cliente que se cadastra com o nome "=1+1" viraria uma conta na planilha;
 * pior, "=HYPERLINK(...)" ou comandos de sistema viram ataque contra quem
 * abrir o arquivo, e o nome vem de campo público do site. Prefixar com aspa
 * simples faz o Excel mostrar o texto e não executar nada.
 */
const INICIO_DE_FORMULA = /^[=+\-@\t\r]/;

function celula(valor: unknown): string {
  if (valor === null || valor === undefined) return "";

  let texto = String(valor);
  if (INICIO_DE_FORMULA.test(texto)) texto = `'${texto}`;

  // Aspas, separador ou quebra de linha exigem envolver em aspas, e aspas
  // internas viram duplas. É o que o formato manda; sem isso um endereço com
  // ponto e vírgula desloca todas as colunas seguintes.
  if (
    texto.includes('"') ||
    texto.includes(SEPARADOR) ||
    texto.includes("\n") ||
    texto.includes("\r")
  ) {
    return `"${texto.replace(/"/g, '""')}"`;
  }
  return texto;
}

/**
 * Monta o arquivo a partir do cabeçalho e das linhas.
 *
 * Quebra de linha CRLF porque é o que a especificação do CSV define e o que
 * o Excel no Windows espera.
 */
export function gerarCsv(
  cabecalho: readonly string[],
  linhas: readonly (readonly unknown[])[],
): string {
  const tudo = [cabecalho, ...linhas].map((linha) =>
    linha.map(celula).join(SEPARADOR),
  );
  return BOM + tudo.join("\r\n") + "\r\n";
}

/** Data no formato que o Excel pt-BR entende sem precisar converter. */
export function dataParaCsv(data: Date | null): string {
  if (!data) return "";
  return data.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Valor monetário com vírgula decimal.
 *
 * Recebe reais, não centavos: Reservation.totalAmount é Decimal(10,2) e
 * formatBRL o usa direto, sem dividir. Dividir aqui mostraria a base inteira
 * cem vezes menor, e o erro passaria despercebido porque continuaria
 * parecendo dinheiro.
 *
 * Sem o "R$" de propósito: com o símbolo o Excel trata a célula como texto e
 * a soma da coluna não funciona, que é a primeira coisa que alguém faz com
 * uma coluna de dinheiro.
 */
export function dinheiroParaCsv(reais: number): string {
  return reais.toFixed(2).replace(".", ",");
}
