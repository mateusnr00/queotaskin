// O botão que leva o ganhador ao suporte, com a mensagem pronta.
//
// Ganhar e não saber o que fazer em seguida é o pior momento possível para
// deixar a pessoa sozinha: ela acabou de pagar, acabou de ganhar, e a tela
// dizia o prêmio sem dizer como recebê-lo. Quem sabia procurava o WhatsApp
// da marca por fora; quem não sabia ficava esperando.
//
// A mensagem já vai escrita e leva a referência do pedido, então o suporte
// abre a conversa sabendo quem é, o que ganhou e em qual campanha, sem a ida
// e volta de perguntas antes de conseguir entregar.
//
// Sem número de suporte cadastrado o botão não aparece. Um botão que abre
// conversa com ninguém é pior do que botão nenhum: promete atendimento e não
// entrega. O número sai de Configurações → Telefone de suporte.

import { MessageCircle } from "lucide-react";

import { linkDoWhatsapp, mensagemDeReivindicacao } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export function BotaoReivindicar({
  telefoneDoSuporte,
  nome,
  premio,
  campanha,
  referencia,
  className,
  variante = "solido",
}: {
  telefoneDoSuporte: string | null;
  nome: string;
  premio: string;
  campanha: string;
  referencia: string;
  className?: string;
  /** "claro" para quando o botão fica sobre a faixa laranja da caixa. */
  variante?: "solido" | "claro";
}) {
  const link = linkDoWhatsapp(
    telefoneDoSuporte,
    mensagemDeReivindicacao({ nome, premio, campanha, referencia }),
  );
  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors",
        variante === "claro"
          ? "bg-white/95 text-emerald-700 hover:bg-white"
          : "bg-emerald-600 text-white hover:bg-emerald-500",
        className,
      )}
    >
      <MessageCircle aria-hidden className="h-4 w-4 shrink-0" />
      Reivindicar prêmio
    </a>
  );
}
