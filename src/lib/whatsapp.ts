// O link que abre a conversa no WhatsApp com a mensagem já escrita.
//
// wa.me quer o número em dígitos puros, com o código do país na frente e sem
// sinal, parêntese ou traço. O que está gravado é o número nacional, do jeito
// que a pessoa digitou, então o DDI entra aqui a partir do país do cadastro.
//
// Sem país, assume Brasil. É o padrão do cadastro e do público da plataforma,
// e um link com DDI errado abre uma conversa com o número de outra pessoa, o
// que é pior do que não abrir.

import { PAIS_PADRAO, paisPorIso } from "@/lib/telefone";

/** Só os dígitos, com o DDI na frente. Vazio quando não dá para montar. */
export function numeroInternacional(
  numero: string | null | undefined,
  iso?: string | null,
): string {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  const pais = paisPorIso(iso ?? PAIS_PADRAO);
  // Número já gravado com o DDI na frente não ganha outro: "5511988887777"
  // viraria "555511988887777" e não abriria conversa nenhuma.
  if (digitos.startsWith(pais.ddi) && digitos.length > pais.digitos[1]) {
    return digitos;
  }
  return `${pais.ddi}${digitos}`;
}

/**
 * O link da conversa. Devolve null quando não há número: é o que permite a
 * interface esconder o botão em vez de oferecer um link que não leva a lugar
 * nenhum.
 */
export function linkDoWhatsapp(
  numero: string | null | undefined,
  mensagem: string,
  iso?: string | null,
): string | null {
  const destino = numeroInternacional(numero, iso);
  if (!destino) return null;
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensagem)}`;
}

/**
 * A mensagem de parabéns pelo prêmio da caixa surpresa.
 *
 * Primeiro nome, e não o nome completo: mensagem que começa com o nome
 * inteiro do cadastro soa como cobrança de banco, não como parabéns.
 *
 * Sem citar a campanha. As campanhas aqui se chamam como skins, então o texto
 * saía "ganhou a AK-47 | Asiimov na campanha AK-47 | Redline", com dois nomes
 * de skin na mesma frase, e o prêmio, que é o que importa, se perdia.
 *
 * O texto vai pronto, mas o WhatsApp abre com ele editável antes de enviar,
 * então continua sendo um rascunho, e não um envio automático.
 */
export function mensagemDeParabens({
  nome,
  premio,
}: {
  nome: string;
  premio: string;
}): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  const abertura = primeiro ? `Parabéns, ${primeiro}! ` : "Parabéns! ";
  return (
    `${abertura}Você ganhou a ${premio} na sua Caixa Surpresa. ` +
    `Me manda o seu link de troca da Steam para eu enviar o item.`
  );
}

/**
 * A mensagem que o ganhador manda ao suporte.
 *
 * Três informações, e nada além: quem é, o que ganhou, e para onde mandar.
 *
 * A versão anterior tinha cinco e duas sobravam. Ela dizia o prêmio E a
 * campanha, e como as campanhas aqui se chamam como skins, saía "ganhei
 * 'Two Times' McCoy | TACP Cavalry na campanha 'Two Times' McCoy | TACP
 * Cavalry", o mesmo nome duas vezes na mesma frase. E terminava com o id do
 * pedido, um cuid de 25 caracteres que não diz nada a quem lê e que o suporte
 * acha pelo nome de qualquer jeito.
 *
 * No lugar deles entrou o que realmente faltava: o LINK DE TROCA. É por ele
 * que a skin sai, e sem ele o atendimento começava pedindo justamente isso.
 */
export function mensagemDeReivindicacao({
  nome,
  premio,
  tradeUrl,
}: {
  nome: string;
  premio: string;
  /** O link de troca da Steam. Nulo quando a pessoa ainda não cadastrou. */
  tradeUrl: string | null;
}): string {
  const abertura = `Olá, sou ${nome.trim()}. Ganhei ${premio}.`;
  // Sem link, dizer isso é mais útil do que omitir: o suporte já abre a
  // conversa sabendo qual é o primeiro passo, em vez de perguntar e esperar.
  return tradeUrl
    ? `${abertura} Meu trade link: ${tradeUrl}`
    : `${abertura} Ainda não cadastrei meu trade link.`;
}
