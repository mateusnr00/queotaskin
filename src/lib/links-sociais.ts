// Os links do site que levam para fora, num lugar só.
//
// O convite do grupo de WhatsApp é digitado no painel e vira `href` numa
// página pública. Isso faz dele conteúdo de terceiro dentro de um atributo
// que o navegador executa: `javascript:` num href roda script na sessão de
// quem clicou, e um endereço qualquer transforma a chamada do grupo em um
// desvio para onde quem digitou quiser.
//
// Por isso o valor não vai para a tela do jeito que veio. Ele passa por
// `linkDeGrupoDeWhatsapp`, que só devolve endereço quando ele é https E o
// domínio é do WhatsApp. Qualquer outra coisa vira nulo, e a chamada não
// aparece: sem chamada é melhor que chamada que leva para outro lugar.

import { cache } from "react";

import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";

/**
 * Os domínios que de fato abrem um convite de grupo.
 *
 * `chat.whatsapp.com` é o convite em si. Os outros dois aparecem em link
 * encurtado pelo próprio WhatsApp e continuam sendo o aplicativo.
 */
const DOMINIOS = new Set([
  "chat.whatsapp.com",
  "whatsapp.com",
  "www.whatsapp.com",
  "wa.me",
]);

/**
 * Devolve o convite quando ele é um endereço de WhatsApp servível, e nulo
 * em qualquer outro caso.
 *
 * Só https: `http` levaria o clique para uma conexão aberta, e nenhum
 * convite real do WhatsApp é servido assim.
 */
export function linkDeGrupoDeWhatsapp(
  valor: string | null | undefined,
): string | null {
  const limpo = (valor ?? "").trim();
  if (!limpo) return null;

  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!DOMINIOS.has(url.hostname.toLowerCase())) return null;
  // Domínio sozinho não é convite: `chat.whatsapp.com` sem código abre a
  // página institucional, e o botão prometeria um grupo que não existe.
  if (url.pathname === "/" || url.pathname === "") return null;

  return url.toString();
}

/**
 * O convite do grupo deste painel, já validado.
 *
 * `cache` do React: várias chamadas no mesmo render dão uma consulta só, do
 * mesmo jeito que a marca.
 */
export const getLinkDoGrupoDeWhatsapp = cache(async (): Promise<string | null> => {
  try {
    const tenant = await getCurrentTenant();
    if (!tenant) return null;
    const t = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { whatsappGroupUrl: true },
    });
    return linkDeGrupoDeWhatsapp(t?.whatsappGroupUrl);
  } catch {
    // Uma consulta que falha não pode derrubar a página do sorteio por causa
    // de uma chamada opcional.
    return null;
  }
});
