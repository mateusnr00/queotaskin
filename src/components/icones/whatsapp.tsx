// O glifo do WhatsApp, num lugar só.
//
// O lucide, que é a fonte de ícones do resto do site, tirou as marcas do
// pacote: não existe WhatsApp lá. Já o `@remixicon/react`, que o projeto usa
// nos gráficos, traz o conjunto de marcas, e é de lá que sai o desenho
// oficial: o balão com o telefone dentro, nas proporções da marca.
//
// POR QUE ELE VIVE AQUI EM VEZ DE CADA BOTÃO IMPORTAR O SEU
//
// São oito telas com botão de WhatsApp. Com cada uma escolhendo o próprio
// ícone, um dia uma delas escolhe o balão genérico do lucide, e o site passa
// a prometer "chat" numa tela e WhatsApp na outra. Trocar o desenho aqui
// troca em todas de uma vez, que foi exatamente o que aconteceu quando o
// traço desenhado à mão deu lugar ao glifo da marca.

import { RiWhatsappFill } from "@remixicon/react";

import { cn } from "@/lib/utils";

export function IconeDoWhatsapp({
  className,
  "aria-hidden": ariaHidden = true,
}: {
  className?: string;
  /**
   * Escondido do leitor de tela por padrão: em todo botão do site o rótulo
   * acessível vem do texto ou do `aria-label` do próprio botão, e o ícone
   * anunciado de novo viraria "WhatsApp WhatsApp".
   */
  "aria-hidden"?: boolean;
}) {
  return (
    <RiWhatsappFill
      aria-hidden={ariaHidden}
      className={cn("h-4 w-4 shrink-0", className)}
    />
  );
}
