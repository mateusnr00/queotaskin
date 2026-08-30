// O botão que leva o ganhador ao suporte, com a mensagem pronta.
//
// Ganhar e não saber o que fazer em seguida é o pior momento possível para
// deixar a pessoa sozinha: ela acabou de pagar, acabou de ganhar, e a tela
// dizia o prêmio sem dizer como recebê-lo. Quem sabia procurava o WhatsApp
// da marca por fora; quem não sabia ficava esperando.
//
// A mensagem já vai escrita com quem é, o que ganhou e o link de troca, que é
// para onde a skin vai. Sem ela o atendimento começava perguntando as três
// coisas antes de conseguir entregar qualquer coisa.
//
// Sem número de suporte cadastrado o botão não aparece. Um botão que abre
// conversa com ninguém é pior do que botão nenhum: promete atendimento e não
// entrega. O número sai de Configurações → Telefone de suporte.

import { IconeDoWhatsapp } from "@/components/icones/whatsapp";
import { linkDoWhatsapp, mensagemDeReivindicacao } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export function BotaoReivindicar({
  telefoneDoSuporte,
  nome,
  premio,
  tradeUrl,
  className,
  variante = "solido",
}: {
  telefoneDoSuporte: string | null;
  nome: string;
  premio: string;
  /** Link de troca da Steam. Nulo quando a pessoa ainda não cadastrou. */
  tradeUrl: string | null;
  className?: string;
  /**
   * "claro" para quando o botão fica sobre a faixa laranja da caixa.
   * "marca" para a página do sorteio, que é vermelha inteira: o verde do
   * WhatsApp ali não é escolha de design, é herança, e destoa da tela toda.
   */
  variante?: "solido" | "claro" | "marca";
}) {
  const link = linkDoWhatsapp(
    telefoneDoSuporte,
    mensagemDeReivindicacao({ nome, premio, tradeUrl }),
  );
  if (!link) return null;

  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 text-sm font-bold",
        variante === "marca"
          ? // Pílula, como os outros botões da transmissão, e o mesmo
            // amortecimento no toque.
            "rounded-full bg-primary px-7 text-primary-foreground transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:opacity-95 active:scale-[0.98]"
          : variante === "claro"
            ? "rounded-lg bg-white/95 px-4 text-emerald-700 transition-colors hover:bg-white"
            : "rounded-lg bg-emerald-600 px-4 text-white transition-colors hover:bg-emerald-500",
        className,
      )}
    >
      <IconeDoWhatsapp className="h-4 w-4 shrink-0" />
      Reivindicar prêmio
    </a>
  );
}
