// O nome que cada campo do sorteio tem NA TELA.
//
// Existe porque "Dados inválidos" não diz nada a quem está com o formulário
// aberto: a pessoa vê a frase, olha para uma tela com quarenta campos em sete
// abas e não sabe por onde começar. Com esta tabela, a mensagem passa a
// nomear o que está errado.
//
// Só os campos que o formulário pede entram aqui. Campo que a tela não mostra
// (id, tenant) não precisa de nome: se ele estiver inválido, o problema não é
// de quem preencheu.

const NOMES: Record<string, string> = {
  title: "Título",
  slug: "URL amigável",
  shortDescription: "Breve descrição",
  description: "Descrição",
  totalNumbers: "Quantidade de cotas",
  pricePerNumber: "Preço da cota",
  feeAmount: "Valor da taxa",
  drawDate: "Data do sorteio",
  salesStart: "Início das vendas",
  minPurchase: "Quantidade mínima por reserva",
  maxPurchase: "Quantidade máxima por reserva",
  maxPerBuyer: "Cotas por comprador",
  initialQuantity: "Quantidade inicial",
  reservationTimeoutMinutes: "Tempo da reserva",
  statusText: "Texto do status",
  freeLabel: "Texto da campanha gratuita",
  category: "Categoria",
  selectionCards: "Cards de seleção rápida",
  minRank: "Rank mínimo",
};

/**
 * A frase que a tela mostra quando a validação recusa o formulário.
 *
 * Nomeia até três campos: a lista inteira numa campanha meio preenchida vira
 * um parágrafo que ninguém lê, e os três primeiros já dizem para onde ir.
 */
export function mensagemDeCamposInvalidos(
  fieldErrors: Record<string, string[] | undefined>,
): string {
  const nomes = Object.keys(fieldErrors)
    .filter((campo) => (fieldErrors[campo]?.length ?? 0) > 0)
    .map((campo) => NOMES[campo] ?? campo);

  if (nomes.length === 0) return "Dados inválidos. Confira os campos do sorteio.";
  const mostrados = nomes.slice(0, 3).join(", ");
  const resto = nomes.length - 3;
  return resto > 0
    ? `Confira estes campos: ${mostrados} e mais ${resto}.`
    : `Confira ${nomes.length > 1 ? "estes campos" : "este campo"}: ${mostrados}.`;
}
