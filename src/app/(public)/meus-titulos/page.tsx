import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ChevronDown, Clock, Ticket, TicketCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { formatBRL, formatDateTime } from "@/lib/format";
import { getCurrentTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { Etiqueta, Moldura } from "@/components/ui/moldura";

export const metadata: Metadata = { title: "Meus títulos" };

// Lista as reservas de quem está logado, com situação e, quando pagas, os
// números. Reservas expiradas continuam aparecendo: o histórico é parte da
// experiência ("já tentei essa, não paguei a tempo").

/**
 * As situações em que uma reserva pode estar, do ponto de vista de quem
 * comprou. São elas que viram as abas.
 *
 * PARTICIPANDO É SÓ ENQUANTO O SORTEIO NÃO ACONTECEU.
 *
 * Antes bastava a reserva estar paga, e a campanha sorteada há três meses
 * continuava listada como "participando". Participar é sobre o que ainda vai
 * acontecer: depois do sorteio não há mais o que aguardar, e a reserva vira
 * histórico com resultado. Por isso "Encerrados" é aba própria, e não um
 * rótulo dentro da mesma.
 */
const ABAS = [
  { chave: "todas", rotulo: "Todas" },
  { chave: "participando", rotulo: "Participando" },
  { chave: "encerrados", rotulo: "Encerrados" },
  { chave: "aguardando", rotulo: "Aguardando pagamento" },
  { chave: "expirados", rotulo: "Expirados" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirect=/meus-titulos");
  }
  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  const { estado } = await searchParams;
  const abaAtiva: Aba = ABAS.find((a) => a.chave === estado)?.chave ?? "todas";

  // Filtra pelo tenant atual: o participante pode ter comprado em vários, mas
  // "Meus títulos" no domínio de um só lista os dele.
  const reservations = await prisma.reservation.findMany({
    where: {
      userId: session.user.id,
      raffle: { tenantId: tenant.id },
    },
    orderBy: { createdAt: "desc" },
    include: {
      raffle: {
        select: {
          title: true,
          slug: true,
          pricePerNumber: true,
          isFree: true,
          // O que separa "participando" de "encerrado", e o que diz se a
          // pessoa ganhou.
          winnerDrawnAt: true,
          winnerTicketNumber: true,
          images: { where: { isCover: true }, take: 1 },
        },
      },
      tickets: {
        select: { number: true },
        orderBy: { number: "asc" },
      },
    },
  });

  // Snapshot do "agora" no servidor: o React Compiler proíbe Date.now() dentro
  // do render dos componentes filhos.
  const now = new Date().getTime();

  /**
   * Em que aba a reserva cai.
   *
   * PENDING vencido conta como expirado mesmo que o cron ainda não tenha
   * rodado: o que vale para quem olha é se ainda dá para pagar, e não o que
   * está gravado na coluna.
   */
  const abaDa = (r: (typeof reservations)[number]): Exclude<Aba, "todas"> => {
    if (r.status === "PAID") {
      return r.raffle.winnerDrawnAt ? "encerrados" : "participando";
    }
    if (r.status === "PENDING" && r.expiresAt.getTime() > now) {
      return "aguardando";
    }
    return "expirados";
  };

  const contagem: Record<Aba, number> = {
    todas: reservations.length,
    participando: 0,
    encerrados: 0,
    aguardando: 0,
    expirados: 0,
  };
  for (const r of reservations) contagem[abaDa(r)] += 1;

  const visiveis =
    abaAtiva === "todas"
      ? reservations
      : reservations.filter((r) => abaDa(r) === abaAtiva);

  return (
    <div className="container mx-auto max-w-3xl px-4 py-6 md:py-10">
      <header>
        <div>
          <Etiqueta icone={<Ticket aria-hidden className="h-3 w-3" />}>
            Minhas reservas
          </Etiqueta>
          <h1 className="mt-2 text-2xl font-black tracking-tight md:text-3xl">
            Meus títulos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {reservations.length === 0
              ? "Você ainda não tem reservas."
              : "Cada compra, os números dela e em que pé está o sorteio."}
          </p>
        </div>
      </header>

      {contagem.aguardando > 0 && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {contagem.aguardando === 1
              ? "Você tem 1 reserva esperando pagamento."
              : `Você tem ${contagem.aguardando} reservas esperando pagamento.`}{" "}
            Elas expiram sozinhas e os números voltam para a campanha.
          </span>
        </p>
      )}

      {reservations.length > 0 && (
        /* Abas como links, e não botões: o estado vive na URL, então dá para
           voltar, recarregar e mandar o link sem perder o filtro. E a página
           segue sendo server component, sem JavaScript para isso. */
        <nav
          aria-label="Filtrar por situação"
          className="mt-4 -mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <ul className="flex w-max gap-2">
            {ABAS.map((aba) => {
              const ativa = aba.chave === abaAtiva;
              const quantos = contagem[aba.chave];
              return (
                <li key={aba.chave}>
                  <Link
                    href={
                      aba.chave === "todas"
                        ? "/meus-titulos"
                        : `/meus-titulos?estado=${aba.chave}`
                    }
                    aria-current={ativa ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
                      ativa
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground",
                    )}
                  >
                    {aba.rotulo}
                    {/* O número ao lado responde "tem algo aqui?" antes do
                        clique. Sem ele, a pessoa abre abas vazias para
                        descobrir. */}
                    <span
                      className={cn(
                        "rounded-full px-1.5 text-[10px] tabular-nums",
                        ativa ? "bg-primary/15" : "bg-white/[0.06]",
                      )}
                    >
                      {quantos}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <div className="mt-4 space-y-3">
        {reservations.length === 0 ? (
          <Moldura>
            <div className="px-4 py-14 text-center">
              <TicketCheck
                aria-hidden
                className="mx-auto h-8 w-8 text-muted-foreground/30"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-sm font-semibold">
                Nenhuma reserva ainda.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quando você comprar números, eles aparecem aqui.
              </p>
              <Link
                href="/sorteios"
                className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Ver campanhas
              </Link>
            </div>
          </Moldura>
        ) : visiveis.length === 0 ? (
          /* A aba existe e está vazia. Dizer isso é melhor do que a lista
             sumir sem explicação e parecer erro de carregamento. */
          <Moldura>
            <div className="px-4 py-14 text-center">
              <TicketCheck
                aria-hidden
                className="mx-auto h-8 w-8 text-muted-foreground/30"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-sm font-semibold">Nada nesta situação.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Troque a aba acima para ver as outras.
              </p>
            </div>
          </Moldura>
        ) : (
          visiveis.map((r) => (
            <CartaoDaReserva key={r.id} reservation={r} now={now} />
          ))
        )}
      </div>
    </div>
  );
}

type ReservationWithRaffle = Awaited<
  ReturnType<typeof prisma.reservation.findMany>
>[number] & {
  raffle: {
    title: string;
    slug: string;
    pricePerNumber: unknown;
    isFree: boolean;
    winnerDrawnAt: Date | null;
    winnerTicketNumber: number | null;
    images: { url: string }[];
  };
  tickets: { number: number }[];
};

function CartaoDaReserva({
  reservation,
  now,
}: {
  reservation: ReservationWithRaffle;
  now: number;
}) {
  const cover = reservation.raffle.images[0]?.url ?? null;
  // A reserva expirada perde os bilhetes, então contar a tabela devolvia zero
  // e a linha virava "- títulos". A quantidade continua existindo no valor
  // pago, que é o mesmo caminho que o webhook atrasado usa para recriar os
  // números.
  const preco = Number(reservation.raffle.pricePerNumber);
  const quantidade =
    reservation.tickets.length ||
    (preco > 0 ? Math.round(Number(reservation.totalAmount) / preco) : 0);
  const isPaid = reservation.status === "PAID";
  const isPending = reservation.status === "PENDING";
  // Pendente vira ativo só enquanto não expirou. Depois de expiresAt, mesmo
  // com o status ainda em PENDING (cron não rodou), a tela trata como
  // expirado: a próxima visita à campanha libera os números.
  const aindaPendente = isPending && reservation.expiresAt.getTime() > now;
  const sorteado = reservation.raffle.winnerDrawnAt != null;
  const href =
    isPaid || aindaPendente ? `/comprovante/${reservation.id}` : null;

  return (
    <Moldura>
      <div className="flex gap-3 p-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.04] sm:h-24 sm:w-24">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={reservation.raffle.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-primary/40">
              <TicketCheck className="h-8 w-8" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs text-muted-foreground">
            {formatDateTime(reservation.createdAt)}
          </p>
          {/* O título leva à campanha; o cartão inteiro não é link porque
              dentro dele há o botão de abrir os números, e link dentro de link
              é o tipo de coisa que rouba o toque no celular. */}
          <h2 className="line-clamp-2 text-sm leading-snug font-bold">
            {href ? (
              <Link href={href} className="hover:text-primary">
                {reservation.raffle.title}
              </Link>
            ) : (
              reservation.raffle.title
            )}
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <Selo
              status={reservation.status}
              aindaPendente={aindaPendente}
              sorteado={sorteado}
            />
            {/* Some quando não dá para saber, em vez de afirmar zero. Numa
                campanha gratuita não há preço para dividir, e "0 títulos" numa
                reserva que teve números é pior do que não dizer nada. */}
            {quantidade > 0 && (
              <span className="text-muted-foreground tabular-nums">
                {quantidade} título{quantidade === 1 ? "" : "s"}
              </span>
            )}
            <span className="font-semibold tabular-nums">
              {formatBRL(Number(reservation.totalAmount))}
            </span>
          </div>
        </div>
      </div>

      {isPaid && reservation.tickets.length > 0 && (
        /* FECHADO POR PADRÃO, EM <details>.
           Cem números abertos empurravam a próxima reserva para fora da tela,
           e com dezoito reservas a lista virava rolagem sem fim. Em <details>
           o abre e fecha não custa JavaScript nenhum, então a página continua
           sendo server component e funciona antes de qualquer script carregar. */
        <details className="group border-t border-white/[0.06]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-[10px] font-bold tracking-[0.14em] text-muted-foreground uppercase transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            <span>
              Seus números
              <span className="ml-1.5 tabular-nums opacity-70">
                {reservation.tickets.length}
              </span>
            </span>
            <ChevronDown
              aria-hidden
              className="h-4 w-4 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-180"
            />
          </summary>
          <div className="flex flex-wrap gap-1.5 px-3 pt-1 pb-3">
            {reservation.tickets.map((t) => {
              const premiado =
                t.number === reservation.raffle.winnerTicketNumber;
              return (
                <span
                  key={t.number}
                  className={cn(
                    "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 font-mono text-xs font-semibold tabular-nums",
                    premiado
                      ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                      : "border-white/10 bg-white/[0.03]",
                  )}
                >
                  {t.number}
                </span>
              );
            })}
          </div>
        </details>
      )}
    </Moldura>
  );
}

function Selo({
  status,
  aindaPendente,
  sorteado,
}: {
  status: ReservationWithRaffle["status"];
  aindaPendente: boolean;
  sorteado: boolean;
}) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase";

  if (status === "PAID") {
    if (sorteado) {
      // Sorteada: "Pago" seria verdade e mesmo assim enganoso, porque some a
      // informação que a pessoa procura, que é se aquilo ainda está de pé.
      return (
        <span className={cn(base, "bg-white/[0.06] text-muted-foreground")}>
          Encerrado
        </span>
      );
    }
    return (
      <span className={cn(base, "bg-emerald-500/15 text-emerald-400")}>
        Participando
      </span>
    );
  }
  if (status === "PENDING" && aindaPendente) {
    return (
      <span className={cn(base, "bg-amber-500/15 text-amber-400")}>
        Aguardando pagamento
      </span>
    );
  }
  // PENDING vencido cai no mesmo balde de EXPIRED.
  if (status === "EXPIRED" || status === "PENDING") {
    return (
      <span className={cn(base, "bg-white/[0.06] text-muted-foreground")}>
        Expirado
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className={cn(base, "bg-white/[0.06] text-muted-foreground")}>
        Cancelado
      </span>
    );
  }
  return (
    <span className={cn(base, "bg-white/[0.06] text-muted-foreground")}>
      Reembolsado
    </span>
  );
}
