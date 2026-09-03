// Os cards da vitrine: o grande de destaque e o compacto.
//
// Moravam dentro da home. A lista de campanhas em /sorteios tinha um card
// próprio, mais simples, e por isso a mesma campanha aparecia de dois jeitos
// em duas páginas do mesmo site: na home com capa grande, progresso e preço
// em destaque; na lista, uma linha com miniatura. Não havia um "principal"
// ali, e a página que existe para navegar campanhas era a mais pobre das
// duas.
//
// Agora as duas páginas montam a vitrine com os mesmos dois componentes, e o
// destaque é o mesmo objeto nas duas.

import Link from "next/link";

import { SeloDoBoost } from "@/components/public/selo-do-boost";
import type { BoostNaTela } from "@/components/public/caixas-de-level-up";
import { RaffleCover } from "@/components/public/raffle-cover";
import { SeloDeStatus } from "@/components/public/selo-de-status";
import { SeloDeExclusiva } from "@/components/rank/selo-de-exclusiva";
import { formatBRL } from "@/lib/format";
import { MOLDURA_DO_DESTAQUE } from "@/lib/raffle-images";
import { cn } from "@/lib/utils";

import type { SkinRarity } from "@prisma/client";

export interface RaffleCardData {
  id: string;
  slug: string;
  title: string;
  shortDescription: string | null;
  pricePerNumber: unknown;
  isFree: boolean;
  freeLabel: string | null;
  minLevel: number | null;
  totalNumbers: number;
  showProgressBar: boolean;
  images: { url: string }[];
  prizes: { skinName: string | null; skinRarity: SkinRarity | null }[];
  /**
   * O sorteio ao vivo desta campanha, quando já existe.
   *
   * O card precisa saber porque uma campanha à espera do sorteio não vende
   * mais nada: mostrar "Participar" nela leva a pessoa para uma página onde
   * não há o que participar, e isso é pior do que não mostrar botão.
   */
  draw?: { status: string; publicId: string } | null;
}

/** A campanha ainda está vendendo? */
export function emVenda(raffle: RaffleCardData): boolean {
  return (
    !raffle.draw ||
    raffle.draw.status === "FINISHED" ||
    raffle.draw.status === "ERROR"
  );
}

// Texto exibido no lugar do preço. Rifas gratuitas usam o freeLabel
// (default "Grátis" pra caber em listagens compactas), pagas mostram
// o valor formatado.
export function priceLabel(raffle: RaffleCardData): string {
  if (raffle.isFree) return raffle.freeLabel || "Grátis";
  return formatBRL(Number(raffle.pricePerNumber));
}

// Barra fina de progresso da venda. Todos os sites de rifa mostram isso e
// funciona como prova social: 78% vendido diz "os outros estão comprando".
export function SalesBar({ sold, total }: { sold: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (sold / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>
          <b className="font-semibold text-foreground">{pct.toFixed(0)}%</b> vendido
        </span>
        <span>{(total - sold).toLocaleString("pt-BR")} disponíveis</span>
      </div>
    </div>
  );
}

// Card grande de destaque, capa grande, título, preço e progresso.
export function FeaturedRaffleCard({
  raffle,
  sold,
  statusBadge,
  boostAtivo,
}: {
  raffle: RaffleCardData;
  sold: number;
  statusBadge: string;
  /** O boost de XP ativo, para o selo do celular. Nulo esconde o selo. */
  boostAtivo?: BoostNaTela | null;
}) {
  const prize = raffle.prizes[0];
  // Fechada para o sorteio, o card leva para a transmissão: é para lá que a
  // pessoa quer ir, e a página da campanha só diria que a venda acabou.
  const vendendo = emVenda(raffle);
  return (
    <Link
      href={vendendo ? `/${raffle.slug}` : `/sorteio/${raffle.draw!.publicId}`}
      className="group block overflow-hidden rounded-2xl border bg-card transition-colors hover:border-primary/40"
    >
      <div className="relative">
        <RaffleCover
          url={raffle.images[0]?.url ?? null}
          title={raffle.title}
          skinName={prize?.skinName}
          rarity={prize?.skinRarity}
          className={cn("w-full", MOLDURA_DO_DESTAQUE)}
          priority
        />
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
          <SeloDeStatus texto={statusBadge} />
          <SeloDeExclusiva minLevel={raffle.minLevel} />
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="space-y-1">
          <h3 className="text-base leading-tight font-bold text-balance group-hover:text-primary">
            {raffle.title}
          </h3>
          {raffle.shortDescription && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {raffle.shortDescription}
            </p>
          )}
        </div>

        {raffle.showProgressBar && (
          <SalesBar sold={sold} total={raffle.totalNumbers} />
        )}

        {/* O SELO DO BOOST FICA AQUI, E SÓ NO CELULAR.
            O boost vale para a PRÓXIMA compra, então o lugar dele é onde a
            pessoa decide comprar, e não numa pílula no topo por onde ela
            passa rolando. No desktop ele já mora no cabeçalho, que fica
            sempre à vista; no celular o cabeçalho é estreito e o selo não
            cabia lá sem disputar espaço com a logo e o menu.

            Aparece só no cartão principal: repetido em cada campanha, o mesmo
            aviso viraria ruído em vez de lembrete. */}
        {boostAtivo && vendendo && (
          <div className="md:hidden">
            <SeloDoBoost boost={boostAtivo} className="w-full justify-center" />
          </div>
        )}

        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <span>
            <span className="block text-[10px] tracking-wider text-muted-foreground uppercase">
              {vendendo ? "Por número" : "Títulos vendidos"}
            </span>
            <span
              className={cn(
                "text-xl leading-none font-bold text-primary",
                raffle.isFree && vendendo && "text-base tracking-wider uppercase",
              )}
            >
              {vendendo
                ? priceLabel(raffle)
                : sold.toLocaleString("pt-BR")}
            </span>
          </span>
          <span className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors group-hover:bg-primary/90">
            {vendendo ? "Participar" : "Assistir ao sorteio"}
          </span>
        </div>
      </div>
    </Link>
  );
}

// Card compacto, capa à esquerda, conteúdo à direita.
export function CompactRaffleCard({
  raffle,
  sold,
  statusBadge,
}: {
  raffle: RaffleCardData;
  statusBadge: string;
  sold: number;
}) {
  const prize = raffle.prizes[0];
  const vendendo = emVenda(raffle);
  return (
    <Link
      href={vendendo ? `/${raffle.slug}` : `/sorteio/${raffle.draw!.publicId}`}
      className="group flex gap-3 overflow-hidden rounded-xl border bg-card p-3 transition-colors hover:border-primary/40"
    >
      <RaffleCover
        url={raffle.images[0]?.url ?? null}
        title={raffle.title}
        skinName={prize?.skinName}
        rarity={prize?.skinRarity}
        variant="thumb"
        className="h-20 w-28 shrink-0 rounded-lg sm:h-24 sm:w-40"
        sizes="160px"
      />

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2">
        <div className="space-y-1">
          <h3 className="line-clamp-2 text-sm leading-snug font-semibold group-hover:text-primary">
            {raffle.title}
          </h3>
          {raffle.showProgressBar && (
            <SalesBar sold={sold} total={raffle.totalNumbers} />
          )}
        </div>

        {/* flex-wrap, e o grupo da direita sem shrink-0: preço, selo de nível
            e selo de status não cabem numa linha de 240px, e travados eles
            transbordavam o card em até 92px, com "Aguardando sorteio" saindo
            pela borda. Quebrar é a saída certa aqui, porque nenhum dos três
            pode ser cortado nem escondido. */}
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
          <span
            className={cn(
              "font-bold text-primary",
              raffle.isFree && vendendo
                ? "text-xs tracking-wider uppercase"
                : "text-base",
              // Fechada, o preço sai: ele convida a comprar uma coisa que não
              // está mais à venda.
              !vendendo && "text-xs tracking-wider uppercase",
            )}
          >
            {vendendo ? priceLabel(raffle) : "Assistir ao sorteio"}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <SeloDeExclusiva minLevel={raffle.minLevel} />
            <SeloDeStatus texto={statusBadge} />
          </span>
        </div>
      </div>
    </Link>
  );
}

