// Tela exibida quando o pagamento Pix é confirmado. Visual celebratório
// com check verde, mensagem de boa sorte e CTAs pra próxima ação.
//
// Os textos (título, descrição, label do botão primário) e a imagem podem
// ser personalizados por tenant em Admin → Configurações → Mensagens.
// Quando o admin não preencheu nada, caímos pros defaults abaixo.

import Link from "next/link";
import { CheckCircle2, PartyPopper, Trophy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

const DEFAULT_TITLE = "Pagamento confirmado!";
const DEFAULT_DESCRIPTION =
  "Obrigado pela sua participação. Seus números estão garantidos. Boa sorte no sorteio!";
const DEFAULT_BUTTON_LABEL = "Ver mais campanhas";

interface Props {
  raffleTitle: string;
  raffleSlug: string;
  numbers: number[];
  participantName: string;
  totalAmount: number;
  paidAt: Date | null;
  customTitle?: string | null;
  customDescription?: string | null;
  customButtonLabel?: string | null;
  customImageUrl?: string | null;
}

export function PaidCelebration({
  raffleTitle,
  raffleSlug,
  numbers,
  participantName,
  totalAmount,
  paidAt,
  customTitle,
  customDescription,
  customButtonLabel,
  customImageUrl,
}: Props) {
  const title = (customTitle?.trim() || DEFAULT_TITLE);
  const description = (customDescription?.trim() || DEFAULT_DESCRIPTION);
  const buttonLabel = (customButtonLabel?.trim() || DEFAULT_BUTTON_LABEL);
  const imageUrl = customImageUrl?.trim() || null;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-green-500/5 to-emerald-500/10 p-8 text-center">
        <div className="pointer-events-none absolute -top-10 -left-10 h-40 w-40 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -right-10 h-40 w-40 rounded-full bg-green-500/20 blur-3xl" />

        <div className="relative">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/40">
            <CheckCircle2 className="h-12 w-12 text-white" strokeWidth={2.5} />
          </div>

          <h2 className="text-2xl font-bold text-emerald-900 dark:text-emerald-100 whitespace-pre-line">
            {title}
          </h2>

          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-emerald-800 dark:text-emerald-200 whitespace-pre-line">
            <PartyPopper className="h-4 w-4 shrink-0" />
            <span>{description}</span>
          </p>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-medium text-emerald-900 dark:text-emerald-100">
            <Trophy className="h-3.5 w-3.5" />
            Olá, {participantName.split(" ")[0]}!
          </div>
        </div>
      </div>

      {imageUrl && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Obrigado pela participação"
            className="w-full max-h-80 object-cover"
          />
        </div>
      )}

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Seus números
          </h3>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {numbers.length} título{numbers.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {numbers.map((n) => (
            <span
              key={n}
              className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 font-mono text-sm font-semibold text-emerald-900 dark:text-emerald-100"
            >
              {n.toString().padStart(2, "0")}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Sorteio</p>
          <p className="font-medium">{raffleTitle}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Valor pago</p>
          <p className="font-semibold">
            R$ {totalAmount.toFixed(2).replace(".", ",")}
          </p>
        </div>
        {paidAt && (
          <div className="col-span-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Pago em</p>
            <p className="font-medium">
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(paidAt)}
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href={`/s/${raffleSlug}`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Ver sorteio
        </Link>
        <Link
          href="/"
          className={buttonVariants({ size: "lg" })}
        >
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}
