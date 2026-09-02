import type { ReactNode } from "react";
// Tela exibida quando o pagamento Pix é confirmado.
//
// Os textos (título, descrição, label do botão primário) e a imagem podem
// ser personalizados por tenant em Admin, Configurações, Mensagens. Quando o
// admin não preencheu nada, caímos pros defaults abaixo.
//
// O VERDE ERA A PÁGINA INTEIRA, E AGORA É UM SINAL
//
// A versão anterior tinha oito coisas verdes acima da dobra: a pílula do
// estado, os três traços da trilha, a moldura do quadro, o fundo do quadro, o
// selo, o título, a contagem de títulos e cada número. O site é laranja sobre
// quase preto, então essa tela parecia ter vindo de outro produto, e dentro
// dela nada se destacava: quando tudo é da cor do sucesso, o sucesso não tem
// cor. Agora o verde aparece em três lugares e por um motivo cada: o selo do
// visto, os números (que são o que a pessoa levou) e a palavra que confirma.
// O resto é o cartão escuro do site, e o dinheiro é laranja, como no preço da
// campanha.
//
// O QUADRO VAZIO VIROU O CONTEÚDO
//
// O selo ficava sozinho no meio de um quadro de 180px de altura, e os
// números, que são o motivo de a página existir, apareciam depois num cartão
// separado com uma fileira de fichas pequenas. O peso estava no aviso e não
// no que foi comprado. Agora é um cartão só: o visto e a frase numa linha
// horizontal compacta, e os números logo abaixo, grandes, numa caixa
// aninhada com o raio menor que o de fora.
//
// AS QUATRO INFORMAÇÕES VIRARAM UMA FAIXA
//
// Data do sorteio e "onde sai o resultado" moravam num rodapé do quadro
// verde; valor e hora do pagamento, numa tabela de três linhas lá embaixo,
// que ainda repetia o nome da campanha já escrito no cabeçalho da página.
// Eram três blocos para quatro fatos curtos. Viraram uma faixa de células com
// fio de um pixel entre elas, que é a densidade que o resto do site usa.

import Link from "next/link";
import { CalendarDays, Check, Clock, Receipt, Trophy } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SeloDeDobro } from "@/components/public/selo-de-dobro";

const DEFAULT_TITLE = "Pagamento confirmado!";
const DEFAULT_BUTTON_LABEL = "Ver mais campanhas";

interface Props {
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
  /** O pedido saiu com a promoção em dobro. */
  dobroAplicado?: boolean;
  /** Renderizado entre o comprovante e os botões. */
  children?: ReactNode;
}

export function PaidCelebration({
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
  dobroAplicado = false,
  children,
}: Props) {
  const title = customTitle?.trim() || DEFAULT_TITLE;
  const description = customDescription?.trim() || null;
  const buttonLabel = customButtonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  const imageUrl = customImageUrl?.trim() || null;
  const primeiroNome = participantName.trim().split(/\s+/)[0];

  // Só entram fatos que o sistema cumpre. Não existe aviso automático por
  // mensagem em lugar nenhum do código, então prometer "avisamos você" seria
  // promessa que ninguém cumpre.
  const celulas = [
    drawDate && {
      icone: CalendarDays,
      rotulo: "Sorteio",
      valor: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        timeZone: "America/Sao_Paulo",
      }).format(drawDate),
    },
    { icone: Trophy, rotulo: "Resultado", valor: "Na campanha" },
    {
      icone: Receipt,
      rotulo: "Valor pago",
      valor: formatBRL(totalAmount),
      // O dinheiro é laranja em todo o site, do preço da campanha ao botão
      // de comprar. Aqui fecha o ciclo: é o mesmo número, na mesma cor.
      destaque: true,
    },
    paidAt && {
      icone: Clock,
      rotulo: "Pago em",
      valor: new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(paidAt),
    },
  ].filter(Boolean) as {
    icone: typeof Trophy;
    rotulo: string;
    valor: string;
    destaque?: boolean;
  }[];

  return (
    <div className="space-y-3.5">
      {/* O CARTÃO DA CONFIRMAÇÃO.

          Um só, com o aviso em cima e os números dentro, e não dois
          empilhados: são a mesma notícia vista de dois ângulos, "deu certo" e
          "o que é seu". O clarão verde no topo é o que sobrou do quadro
          inteiro pintado, e ele morre antes da metade do cartão, então o
          fundo continua sendo o do site. */}
      <section className="relative overflow-hidden rounded-2xl border bg-card">
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 h-48 w-64 rounded-full bg-emerald-500/15 blur-3xl"
        />

        <div className="relative p-4 md:p-5">
          {/* Em linha, e não centralizado. Centralizado, o selo precisava de
              uma faixa de 180px só para ele e a frase quebrava em três
              linhas; em linha, o mesmo conteúdo cabe em duas e o olho lê da
              esquerda para a direita como no resto do site. */}
          <div className="flex items-center gap-3.5">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center">
              {/* Anel que abre depois do selo e se dissipa. Fica atrás e sem
                  eventos: é enfeite, não pode capturar clique. */}
              <span
                aria-hidden
                className="confirmacao-anel pointer-events-none absolute inset-0 rounded-full border-2 border-emerald-400"
              />
              <span className="confirmacao-entra flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/25">
                <Check className="h-6 w-6 text-white" strokeWidth={3} />
              </span>
            </span>

            <div className="min-w-0">
              <h2 className="whitespace-pre-line text-lg font-bold leading-tight tracking-tight text-balance md:text-xl">
                {title}
              </h2>
              {/* Uma frase, com nome e contagem. Personalizada e concreta
                  vale mais que agradecimento genérico. */}
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
                {primeiroNome ? `Pronto, ${primeiroNome}. ` : ""}
                {numbers.length === 1
                  ? "Seu número está garantido."
                  : `Seus ${numbers.length} números estão garantidos.`}
              </p>
            </div>
          </div>

          {/* O texto do painel, quando o dono escreveu um. Fica embaixo e
              menor: é recado da casa, não a confirmação. */}
          {description && (
            <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}

          {dobroAplicado && (
            <SeloDeDobro total={numbers.length} className="mt-3.5" />
          )}

          {/* OS NÚMEROS.

              Caixa aninhada com raio menor que o de fora, para as curvas
              ficarem concêntricas em vez de duas bordas brigando. É aqui que
              o verde tem função: estes números são o que a pessoa vai
              conferir de novo no dia do sorteio. */}
          <div className="mt-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
            <div className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Seus números
              </h3>
              <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                {numbers.length} título{numbers.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {numbers.map((n) => (
                <li
                  key={n}
                  className="inline-flex h-11 min-w-14 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 font-mono text-lg font-bold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300"
                >
                  {n.toString().padStart(2, "0")}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* A FAIXA DE FATOS.

          Fio de um pixel entre as células: o fundo é a cor da borda e cada
          célula tem o fundo do cartão por cima. Grade de duas no telefone e
          de tantas quantas houver no computador, porque com três células numa
          grade de quatro sobraria um buraco do tamanho de uma célula. */}
      <section
        className={cn(
          "grid gap-px overflow-hidden rounded-2xl border bg-border/70",
          "grid-cols-2",
          celulas.length === 4
            ? "sm:grid-cols-4"
            : celulas.length === 3
              ? "sm:grid-cols-3"
              : "sm:grid-cols-2",
        )}
      >
        {celulas.map((c, i) => (
          <div
            key={c.rotulo}
            className={cn(
              "flex items-center gap-2.5 bg-card px-3.5 py-3",
              // Célula ímpar sozinha na última linha do telefone ocupa a
              // linha inteira, em vez de deixar metade vazia.
              celulas.length % 2 === 1 &&
                i === celulas.length - 1 &&
                "col-span-2 sm:col-span-1",
            )}
          >
            <c.icone
              aria-hidden
              className={cn(
                "h-4 w-4 shrink-0",
                c.destaque ? "text-primary" : "text-muted-foreground",
              )}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {c.rotulo}
              </p>
              <p
                className={cn(
                  "truncate text-sm font-semibold tabular-nums",
                  c.destaque && "text-primary",
                )}
              >
                {c.valor}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* Espaço para o que vier entre o comprovante e os botões, hoje as
          raspadinhas, as caixas surpresas e o bloco de XP. Fica aqui e não
          depois dos botões porque quem clica em "Ver mais campanhas" sai da
          página, e nunca veria o que estivesse embaixo deles. */}
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
