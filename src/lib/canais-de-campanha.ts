// Os canais de divulgação de um sorteio.
//
// Cada um vira um link próprio, com o canal em utm_content. É o que separa
// "veio do anúncio" de "veio da bio do Instagram" quando os dois apontam para
// o mesmo sorteio: sem essa marca, tudo chega como tráfego direto e não há
// como saber onde o dinheiro rendeu.
//
// A lista é fixa, e não cadastrável, de propósito. Canal que só existe num
// sorteio não se compara com nada; com a lista fixa, "o anúncio rende mais
// que a bio" é uma frase que atravessa todas as campanhas.

export interface CanalDeCampanha {
  /** Vai em utm_content. Minúsculo e com hífen, para caber na URL. */
  id: string;
  rotulo: string;
}

export const CANAIS: CanalDeCampanha[] = [
  { id: "ads", rotulo: "Anúncio" },
  { id: "comunidade", rotulo: "Comunidade" },
  { id: "facebook-grupo", rotulo: "Facebook Grupo" },
  { id: "horario-premiado", rotulo: "Horário Premiado" },
  { id: "instagram-bio", rotulo: "Instagram Bio" },
  { id: "instagram-stories", rotulo: "Instagram Stories" },
  { id: "live", rotulo: "Live Comunidade" },
  { id: "ranking", rotulo: "Ranking" },
  { id: "whatsapp", rotulo: "WhatsApp" },
];

/** O canal existe na lista? O contador não guarda o que ninguém cadastrou. */
export function canalConhecido(id: string): boolean {
  return CANAIS.some((c) => c.id === id);
}

/**
 * O link de um canal.
 *
 * utm_source fixo em "campaign" porque a origem verdadeira já está no canal:
 * o que muda entre um link e outro é o utm_content, e repetir a mesma
 * informação em dois campos só cria divergência quando um deles é editado.
 */
export function linkDoCanal(base: string, slug: string, canal: string): string {
  const raiz = base.replace(/\/$/, "");
  return `${raiz}/${slug}?utm_source=campaign&utm_content=${encodeURIComponent(canal)}`;
}
