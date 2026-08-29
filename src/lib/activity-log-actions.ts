// Catálogo das ações que o sistema registra.
//
// É união de strings, e não string livre, por dois motivos. O TypeScript
// recusa ação inventada na hora de chamar registrarLog, então uma action nova
// não entra no banco com chave torta. E a tela monta a frase a partir daqui,
// então o texto vive num lugar só, em vez de espalhado por vinte chamadas.
//
// A granularidade é desigual de propósito. raffle-content.ts exporta quatorze
// actions (capa, imagens, prêmios, promoções, títulos premiados, combos e
// prêmios de caixa surpresa, provedor de pagamento). Todas entram como
// sorteio.conteudo_alterado, com detalhes.o_que nomeando a parte que mudou:
// uma chave por action encheria o catálogo e o filtro sem responder nada que
// o_que não responda.
//
// Declarar e remover ganhador são a exceção, porque decidem quem recebe uma
// skin.

export const ACOES = {
  "painel.login": "entrou no painel",
  "painel.login_recusado": "teve a entrada recusada",
  "usuario.criado": "criou a conta",
  "usuario.editado": "editou os dados de",
  "usuario.papel_alterado": "mudou o papel de",
  "usuario.senha_gerada": "gerou senha de painel para",
  "usuario.trade_url_alterada": "trocou o link de troca da Steam",
  "sorteio.criado": "criou o sorteio",
  "sorteio.editado": "editou o sorteio",
  "sorteio.duplicado": "duplicou o sorteio",
  "sorteio.status_alterado": "mudou o status do sorteio",
  "sorteio.conteudo_alterado": "mudou o conteúdo do sorteio",
  "sorteio.excluido": "excluiu o sorteio",
  "sorteio.ganhador_definido": "declarou o ganhador de",
  "sorteio.ganhador_removido": "removeu o ganhador de",
  // O sorteio ao vivo. Cada linha destas é decisão de máquina, não de gente,
  // e é justamente por isso que precisa ficar registrada: quando o ganhador
  // sai de um sorteio automático, o histórico é a única testemunha.
  "sorteio.agendado": "agendou o sorteio ao vivo de",
  "sorteio.numero_gerado": "sorteou o número de",
  "sorteio.finalizado": "encerrou o sorteio ao vivo de",
  "config.pagamento_alterada": "alterou as credenciais de pagamento",
  "config.site_alterada": "alterou as configurações do site",
  "config.mensagens_alterada": "alterou as mensagens automáticas",
  "skin.alterada": "alterou o catálogo de skins",
  "reserva.criada": "reservou números",
  "pix.gerado": "gerou o Pix",
  "pagamento.aprovado": "confirmou o pagamento",
  "pagamento.recusado": "recusou o pagamento",
  "reservas.expiradas": "expirou reservas pendentes",
} as const;

export type AcaoDeLog = keyof typeof ACOES;

/// Entidades que um registro pode apontar. Fechada, não string livre: a tela
/// precisa saber para onde linkar o alvo.
export type TipoDeAlvo =
  | "User"
  | "Raffle"
  | "Reservation"
  | "Payment"
  | "SkinTemplate"
  | "Tenant";

/**
 * Texto da ação para a tela.
 *
 * Aceita string qualquer, não só AcaoDeLog: o que vem do banco é `acao
 * String`, e registro antigo de ação renomeada precisa continuar aparecendo.
 */
export function textoDaAcao(acao: string): string {
  return (ACOES as Record<string, string>)[acao] ?? acao;
}
