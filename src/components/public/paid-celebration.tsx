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
import { CalendarDays, Check, Trophy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

const DEFAULT_TITLE = "Pagamento confirmado!";
const DEFAULT_BUTTON_LABEL = "Ver mais campanhas";

interface Props {
  raffleTitle: string;
  raffleSlug: string;
  numbers: number[];
  participantName: string;
  totalAmount: number;
  paidAt: Date | null;
  /** Quando o sorteio acontece. Nem toda campanha tem data marcada. */
  drawDate?: Date | null;
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
  drawDate,
  customTitle,
  customDescription,
  customButtonLabel,
  customImageUrl,
  children,
}: Props) {
  const title = customTitle?.trim() || DEFAULT_TITLE;
  const description = customDescription?.trim() || null;
  const buttonLabel = customButtonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  const imageUrl = customImageUrl?.trim() || null;
  const primeiroNome = participantName.trim().split(/\s+/)[0];

  return (
    <div className="space-y-4">
      {/* O selo de confirmação.
          
          Era um quadro com check pequeno ao lado do título, três frases
          centralizadas e uma pílula repetindo "boa sorte", que a frase logo
          acima já dizia. Nada ali respondia à pergunta que vem depois de
          "deu certo?", que é "e agora, quando eu descubro?".
          
          Agora o selo tem presença e entra crescendo, a frase é uma só e
          traz o nome e a contagem, e as duas linhas de baixo dizem o que
          acontece a seguir. A regra de UX pedida na busca é justamente
          "mensagem de sucesso breve": três frases de agradecimento eram o
          contrário disso. */}
      <section className="overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07]">
        <div className="px-5 py-6 text-center md:px-6 md:py-7">
          <div className="relative mx-auto h-14 w-14">
            {/* Anel que abre depois do selo e se dissipa. Fica atrás e sem
                eventos: é enfeite, não pode capturar clique. */}
            <span
              aria-hidden
              className="confirmacao-anel pointer-events-none absolute inset-0 rounded-full border-2 border-emerald-400"
            />
            <span className="confirmacao-entra relative flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
              <Check className="h-7 w-7 text-white" strokeWidth={3} />
            </span>
          </div>

          <h2 className="mt-4 whitespace-pre-line text-xl font-bold tracking-tight text-emerald-700 dark:text-emerald-300 md:text-2xl">
            {title}
          </h2>

          {/* Uma frase, com nome e contagem. Personalizada e concreta vale
              mais que agradecimento genérico, e ela sozinha diz o que as
              três anteriores diziam somadas. */}
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-emerald-800/80 dark:text-emerald-200/70">
            {primeiroNome ? `Pronto, ${primeiroNome}. ` : ""}
            {numbers.length === 1
              ? "Seu número está garantido"
              : `Seus ${numbers.length} números estão garantidos`}{" "}
            neste sorteio.
          </p>

          {/* O texto do painel, quando o dono escreveu um. Fica embaixo e
              menor: é recado da casa, não a confirmação. */}
          {description && (
            <p className="mx-auto mt-2 max-w-sm whitespace-pre-line text-xs leading-relaxed text-emerald-800/60 dark:text-emerald-200/50">
              {description}
            </p>
          )}
        </div>

        {/* O que acontece a seguir. Só entram fatos que o sistema cumpre:
            a data do sorteio quando ela existe, e onde o resultado sai.
            Não há aviso automático por mensagem em lugar nenhum do código,
            então prometer "avisamos você" seria promessa que ninguém
            cumpre. */}
        {/* Duas colunas só quando há duas coisas a dizer. Sem data de
            sorteio, o grid de duas deixava metade da faixa vazia com o fundo
            esverdeado aparecendo, e a tela parecia ter perdido um pedaço. */}
        <dl
          className={cn(
            "grid gap-px border-t border-emerald-500/20 bg-emerald-500/10 text-left",
            drawDate && "sm:grid-cols-2",
          )}
        >
          {drawDate && (
            <div className="flex items-center gap-2.5 bg-card px-4 py-3">
              <CalendarDays className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Sorteio
                </dt>
                <dd className="truncate text-sm font-semibold">
                  {new Intl.DateTimeFormat("pt-BR", {
                    day: "2-digit",
                    month: "long",
                    timeZone: "America/Sao_Paulo",
                  }).format(drawDate)}
                </dd>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2.5 bg-card px-4 py-3">
            <Trophy className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="min-w-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Resultado
              </dt>
              <dd className="truncate text-sm font-semibold">
                Na página da campanha
              </dd>
            </div>
          </div>
        </dl>
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

      {/* Espaço para o que vier entre o comprovante e os botões, hoje as
          caixas surpresas e o bloco de XP. Fica aqui e não depois dos botões
          porque quem clica em "Ver mais campanhas" sai da página, e ela nunca
          veria o que estivesse embaixo deles. */}
      {children}

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

      {/* O extrato por último, e de propósito. Ele é conferência, não
          notícia: quem ganhou uma skin quer ver a skin, e ter valor pago e
          hora do pagamento na frente empurrava a caixa premiada para baixo da
          dobra no celular.

          Em linhas rótulo/valor e não em grade de duas colunas: em grade,
          "Pago em" ficava numa faixa própria embaixo e as três informações
          pareciam de blocos diferentes. */}
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

      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href={`/${raffleSlug}`}
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
