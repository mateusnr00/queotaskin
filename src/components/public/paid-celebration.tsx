import type { ReactNode } from "react";
// Tela exibida quando o pagamento Pix é confirmado.
//
// Os textos (título, descrição, label do botão primário) e a imagem podem
// ser personalizados por tenant em Admin → Configurações → Mensagens.
// Quando o admin não preencheu nada, caímos pros defaults abaixo.
//
// O que mudou nesta versão:
//
// O quadro verde era o dobro do que precisava ser: borda de 2px, dois
// borrões desfocados nos cantos e 32px de padding, e sobrava tão pouco
// espaço para o resto que os números, que são o motivo de a pessoa abrir
// esta página, ficavam abaixo da dobra no celular. Agora o aviso é uma
// faixa e os números vêm logo em seguida.
//
// O ícone de festa saiu de dentro de um flex com o texto. Como a frase
// quebra em três linhas e o flex centraliza pelo eixo, ele acabava
// flutuando sozinho na margem esquerda, a meia altura do parágrafo, e
// parecia elemento perdido. Foi para junto do título, onde a linha é uma só.

import Link from "next/link";
import { CheckCircle2, Trophy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";

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
  /** Renderizado entre o comprovante e os botões. */
  children?: ReactNode;
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
  children,
}: Props) {
  const title = customTitle?.trim() || DEFAULT_TITLE;
  const description = customDescription?.trim() || DEFAULT_DESCRIPTION;
  const buttonLabel = customButtonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  const imageUrl = customImageUrl?.trim() || null;
  const primeiroNome = participantName.trim().split(/\s+/)[0];

  return (
    <div className="space-y-4">
      {/* Aviso de confirmação. O ícone ao lado do título, e não sobre ele:
          empilhado, empurrava tudo para baixo sem dizer mais nada. */}
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-5 text-center md:p-6">
        <div className="flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500">
            <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={2.5} />
          </span>
          <h2 className="whitespace-pre-line text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 md:text-2xl">
            {title}
          </h2>
        </div>

        <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-sm leading-relaxed text-emerald-800/80 dark:text-emerald-200/70">
          {description}
        </p>

        {primeiroNome && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Trophy className="h-3.5 w-3.5" />
            Boa sorte, {primeiroNome}!
          </p>
        )}
      </section>

      {/* Os números primeiro. É o que a pessoa veio ver, e o que ela vai
          conferir de novo no dia do sorteio. */}
      <section className="rounded-2xl border bg-card p-4 md:p-5">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Seus números
          </h3>
          <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {numbers.length} título{numbers.length === 1 ? "" : "s"}
          </span>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {numbers.map((n) => (
            <li
              key={n}
              className="inline-flex h-9 min-w-11 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300"
            >
              {n.toString().padStart(2, "0")}
            </li>
          ))}
        </ul>
      </section>

      {/* Comprovante em linhas rótulo/valor, e não numa grade de duas
          colunas: em grade, "Pago em" ficava numa faixa própria embaixo e as
          três informações pareciam de blocos diferentes. */}
      <section className="rounded-2xl border bg-card px-4 py-1 text-sm md:px-5">
        <Linha rotulo="Sorteio">{raffleTitle}</Linha>
        <Linha rotulo="Valor pago">
          <span className="font-semibold tabular-nums">
            {formatBRL(totalAmount)}
          </span>
        </Linha>
        {paidAt && (
          <Linha rotulo="Pago em">
            <span className="tabular-nums">
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
                timeZone: "America/Sao_Paulo",
              }).format(paidAt)}
            </span>
          </Linha>
        )}
      </section>

      {imageUrl && (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Obrigado pela participação"
            className="max-h-72 w-full object-cover"
          />
        </div>
      )}

      {/* Espaço para o que vier entre o comprovante e os botões, hoje as
          caixas surpresas e o bloco de XP. Fica aqui e não depois dos botões
          porque quem clica em "Ver mais campanhas" sai da página, e nunca
          veria o que estivesse embaixo deles. */}
      {children}

      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href={`/s/${raffleSlug}`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Ver sorteio
        </Link>
        <Link href="/" className={buttonVariants({ size: "lg" })}>
          {buttonLabel}
        </Link>
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3 last:border-b-0">
      <span className="shrink-0 text-xs text-muted-foreground">{rotulo}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}
