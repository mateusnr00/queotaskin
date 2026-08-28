// Tela exibida quando a reserva expirou (ou foi cancelada): o tempo
// limite acabou antes do pagamento, os tickets foram liberados e o
// usuário precisa escolher números novamente se ainda houver disponíveis.
//
// Os textos (título, descrição, label do botão) e a imagem podem ser
// personalizados por tenant em Admin → Configurações → Mensagens. Quando
// o admin não preencheu nada, caímos pros defaults abaixo.
//
// Deixou de ser âmbar. Âmbar é a cor da tela de aguardar pagamento, e as
// duas ficavam parecidas justamente onde a diferença mais importa: uma diz
// "ainda dá tempo", a outra diz "acabou". Aqui a cor é neutra, e o que
// chama atenção é o botão de tentar de novo, que é a única coisa que ainda
// pode ser feita.
//
// A carinha triste saiu junto: ela ocupava 80px de altura para repetir o
// que o título já dizia, e num aviso de má notícia o desenho grande soa
// como deboche.

import Link from "next/link";
import { TimerOff } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const DEFAULT_TITLE = "Sua reserva expirou";
const DEFAULT_TITLE_CANCELLED = "Reserva cancelada";
const DEFAULT_DESCRIPTION =
  "O tempo para pagamento acabou e seus números voltaram para venda. Se ainda estiverem disponíveis, você pode escolhê-los de novo.";
const DEFAULT_DESCRIPTION_CANCELLED =
  "Os números foram liberados e voltaram para venda.";
const DEFAULT_BUTTON_LABEL = "Escolher números de novo";

interface Props {
  raffleTitle: string;
  raffleSlug: string;
  cancelled?: boolean;
  customTitle?: string | null;
  customDescription?: string | null;
  customButtonLabel?: string | null;
  customImageUrl?: string | null;
}

export function ExpiredReservation({
  raffleSlug,
  cancelled = false,
  customTitle,
  customDescription,
  customButtonLabel,
  customImageUrl,
}: Props) {
  const title =
    customTitle?.trim() ||
    (cancelled ? DEFAULT_TITLE_CANCELLED : DEFAULT_TITLE);
  const description =
    customDescription?.trim() ||
    (cancelled ? DEFAULT_DESCRIPTION_CANCELLED : DEFAULT_DESCRIPTION);
  const buttonLabel = customButtonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  const imageUrl = customImageUrl?.trim() || null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-card p-5 text-center md:p-6">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <TimerOff className="h-5 w-5" />
        </span>
        <h2 className="mt-3 whitespace-pre-line text-xl font-bold tracking-tight md:text-2xl">
          {title}
        </h2>
        <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </section>

      {imageUrl && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="max-h-72 w-full object-cover"
          />
        </div>
      )}

      {/* O nome da campanha já está no cabeçalho da página, então o cartão
          que só repetia "Sorteio: X" saiu. O que sobra aqui é a saída. */}
      <Link
        href={`/${raffleSlug}`}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        {buttonLabel}
      </Link>
    </div>
  );
}
