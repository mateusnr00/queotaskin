// Tela exibida quando a reserva expirou (ou foi cancelada): o tempo
// limite acabou antes do pagamento, os tickets foram liberados e o
// usuário precisa escolher números novamente se ainda houver disponíveis.
//
// Os textos (título, descrição, label do botão) e a imagem podem ser
// personalizados por tenant em Admin → Configurações → Mensagens. Quando
// o admin não preencheu nada, caímos pros defaults abaixo.

import Link from "next/link";
import { Frown } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const DEFAULT_TITLE = "Que pena, sua reserva expirou";
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
  raffleTitle,
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
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-500/10 p-8 text-center">
        <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-orange-500/20 blur-3xl" />

        <div className="relative">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-amber-500 shadow-lg shadow-amber-500/40">
            <Frown className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>

          <h2 className="text-2xl font-bold text-amber-900 dark:text-amber-100 whitespace-pre-line">
            {title}
          </h2>

          <p className="mt-2 text-sm text-amber-800 dark:text-amber-200 whitespace-pre-line">
            {description}
          </p>
        </div>
      </div>

      {imageUrl && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="w-full max-h-80 object-cover"
          />
        </div>
      )}

      <div className="rounded-xl border bg-muted/30 p-4 text-sm">
        <p className="text-xs text-muted-foreground">Sorteio</p>
        <p className="font-medium">{raffleTitle}</p>
      </div>

      <Link
        href={`/s/${raffleSlug}`}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        {buttonLabel}
      </Link>
    </div>
  );
}
