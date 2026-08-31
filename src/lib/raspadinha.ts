// O jeito de escrever o número do bilhete, num lugar só.
//
// Mora aqui, e não no serviço, porque o serviço importa o Prisma: a tabela de
// ganhadores do painel roda no navegador, e importar de lá arrastaria o cliente
// de banco inteiro para o pacote que chega no telefone de quem abre a página.

/** O número como aparece impresso no bilhete: seis dígitos, com zeros. */
export function numeroDoBilhete(numero: number): string {
  return numero.toString().padStart(6, "0");
}
