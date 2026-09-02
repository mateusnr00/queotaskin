import type { ReactNode } from "react";
// Tela exibida quando o pagamento Pix é confirmado.
//
// Os textos (título, descrição, label do botão primário) e a imagem podem ser
// personalizados por tenant em Admin, Configurações, Mensagens. Quando o admin
// não preencheu nada, caímos pros defaults abaixo.
//
// A TELA TEM TRÊS ANDARES, E CADA UM RESPONDE UMA PERGUNTA
//
// "Deu certo?" é o cartão de cima: o visto, a frase e o número comprado, tudo
// junto, porque a confirmação e o que foi comprado são a mesma notícia. "E
// agora?" é o que vem no meio: o XP, as raspadinhas, as caixas, o que a compra
// rendeu. "Quanto foi mesmo?" é o extrato, e ele fica por último de propósito:
// é conferência, não notícia. Quem ganhou uma skin quer ver a skin, e ter
// valor pago e hora do pagamento na frente empurrava a caixa premiada para
// baixo da dobra no telefone.
//
// O VERDE É SINAL, NÃO FUNDO
//
// Uma versão anterior tinha oito coisas verdes acima da dobra: a pílula do
// estado, os traços da trilha, a moldura do quadro, o fundo do quadro, o selo,
// o título, a contagem e cada número. O site é laranja sobre quase preto,
// então a tela parecia vir de outro produto, e dentro dela nada se destacava:
// quando tudo é da cor do sucesso, o sucesso não tem cor. Hoje o verde aparece
// no visto, no rótulo dos números e nos números, que é onde ele significa
// alguma coisa; o resto é o cartão escuro do site.
//
// O NÚMERO É DO TAMANHO DA NOTÍCIA
//
// Com poucos números, cada um vira uma placa grande: quem comprou um título
// tem UM número para guardar, e ele merece o tamanho de um troféu. A partir de
// meia dúzia as placas encolhem, porque aí a pergunta deixa de ser "qual é o
// meu número?" e passa a ser "quais são os meus números?", que se responde
// varrendo uma lista.

import Link from "next/link";
import { Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SeloDeDobro } from "@/components/public/selo-de-dobro";

const DEFAULT_TITLE = "Pagamento confirmado!";
const DEFAULT_BUTTON_LABEL = "Ver mais campanhas";

/** Até quantos números as placas ficam grandes. */
const PLACAS_GRANDES_ATE = 6;

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
  /** O pedido saiu com a promoção em dobro. */
  dobroAplicado?: boolean;
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
  dobroAplicado = false,
  children,
}: Props) {
  const title = customTitle?.trim() || DEFAULT_TITLE;
  const description = customDescription?.trim() || null;
  const buttonLabel = customButtonLabel?.trim() || DEFAULT_BUTTON_LABEL;
  const imageUrl = customImageUrl?.trim() || null;
  const primeiroNome = participantName.trim().split(/\s+/)[0];
  const umSo = numbers.length === 1;
  const grandes = numbers.length <= PLACAS_GRANDES_ATE;

  return (
    <div className="space-y-3.5">
      {/* O CARTÃO DA CONFIRMAÇÃO */}
      <section className="relative overflow-hidden rounded-2xl border bg-card">
        {/* O clarão nasce ATRÁS DO VISTO e morre antes da metade do cartão.
            Centralizado no topo ele acendia o lado direito, onde não há nada,
            e o cartão voltava a parecer um quadro verde; ancorado no selo, ele
            lê como a luz do próprio selo. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-16 h-48 w-64 rounded-full bg-emerald-500/15 blur-3xl"
        />
        {/* A malha de pontos no canto. É o único enfeite da tela, e existe
            para o cartão não ser um retângulo liso: dá textura sem competir
            com nada, porque some antes de chegar no texto. */}
        <span
          aria-hidden
          className="pontos-do-canto pointer-events-none absolute top-0 right-0 h-28 w-28"
        />

        <div className="relative p-4 md:p-5">
          <div className="flex items-center gap-3.5 md:gap-4">
            <span className="relative flex h-14 w-14 shrink-0 items-center justify-center">
              {/* Anel que abre depois do selo e se dissipa. Fica atrás e sem
                  eventos: é enfeite, não pode capturar clique. */}
              <span
                aria-hidden
                className="confirmacao-anel pointer-events-none absolute inset-0 rounded-full border-2 border-emerald-400"
              />
              <span className="confirmacao-entra flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 shadow-[0_0_24px_-2px_var(--color-emerald-500)]">
                <Check className="h-7 w-7 text-white" strokeWidth={3} />
              </span>
            </span>

            <div className="min-w-0">
              <h2 className="text-lg font-extrabold leading-tight tracking-tight whitespace-pre-line text-balance md:text-xl">
                {title}
              </h2>
              {/* Uma frase, e ela fala do que foi comprado. "Obrigado pela
                  participação" não diz nada que a pessoa não saiba. */}
              <p className="mt-1 text-sm leading-snug text-muted-foreground">
                {primeiroNome ? `${primeiroNome}, ` : ""}
                {umSo
                  ? "seu título já está garantido."
                  : `seus ${numbers.length} títulos já estão garantidos.`}{" "}
                Boa sorte!
              </p>
            </div>
          </div>

          {/* O texto do painel, quando o dono escreveu um. Fica embaixo e
              menor: é recado da casa, não a confirmação. */}
          {description && (
            <p className="mt-3 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
              {description}
            </p>
          )}

          {dobroAplicado && (
            <SeloDeDobro total={numbers.length} className="mt-4" />
          )}

          <div className="mt-4 mb-2.5 flex items-center justify-between gap-3">
            <h3 className="text-[11px] font-bold tracking-wider text-emerald-600 uppercase dark:text-emerald-400">
              {umSo ? "Seu número" : "Seus números"}
            </h3>
            <span className="shrink-0 rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-semibold tabular-nums">
              {numbers.length} título{umSo ? "" : "s"}
            </span>
          </div>

          <ul className="flex flex-wrap gap-2">
            {numbers.map((n) => (
              <li
                key={n}
                className={cn(
                  "inline-flex items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 font-mono font-extrabold tracking-tight tabular-nums text-emerald-700 dark:text-emerald-300",
                  grandes
                    ? "h-14 min-w-[4.25rem] px-3 text-2xl"
                    : "h-11 min-w-14 px-2.5 text-lg",
                )}
              >
                {n.toString().padStart(2, "0")}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* O que a compra rendeu: o XP, as raspadinhas, as caixas. Fica antes
          dos botões porque quem clica em "Ver mais campanhas" sai da página, e
          nunca veria o que estivesse embaixo deles. */}
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

      {/* O EXTRATO.

          Linhas rótulo à esquerda, valor à direita, com um fio entre elas. Em
          grade de duas colunas, "Pago em" caía numa faixa própria embaixo e as
          informações pareciam vir de blocos diferentes; em linhas, elas se
          leem como o que são, um recibo. */}
      <section className="rounded-2xl border bg-card px-4 py-1 text-sm md:px-5">
        <Linha rotulo="Sorteio">{raffleTitle}</Linha>
        {drawDate && (
          <Linha rotulo="Data do sorteio">
            <span className="tabular-nums">
              {new Intl.DateTimeFormat("pt-BR", {
                day: "2-digit",
                month: "long",
                timeZone: "America/Sao_Paulo",
              }).format(drawDate)}
            </span>
          </Linha>
        )}
        {/* Só entram fatos que o sistema cumpre. Não existe aviso automático
            por mensagem em lugar nenhum do código, então prometer "avisamos
            você" seria promessa que ninguém cumpre. */}
        <Linha rotulo="Resultado">Na página da campanha</Linha>
        <Linha rotulo="Valor pago">
          <span className="font-bold tabular-nums">
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
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}
