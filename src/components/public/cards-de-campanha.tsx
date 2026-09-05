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
import { degrauDoRank } from "@/lib/rank";
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
        {/* OS DOIS SELOS NO TOPO DA ARTE, UM EM CADA PONTA.
            Uma faixa só, com `justify-between`, e não dois elementos
            absolutos independentes: ancorados cada um no seu canto, eles
            crescem um em direção ao outro e se sobrepõem no nome de rank mais
            comprido. Aqui a faixa é o container, e o espaço entre eles é
            garantido pela própria caixa.

            O nível já esteve aqui e saiu, porque sobre a capa da skin o
            "PRATA ELITE" era engolido pela logo desenhada na arte. O que
            resolve isso é o fundo escuro atrás dele, e não mudá-lo de lugar:
            a condição de compra volta para a vitrine, e o rodapé fica com o
            preço e o botão, que é o que decide o toque. */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <SeloDeStatus texto={statusBadge} className="shrink-0" />
          {/* O fundo escuro é do INVÓLUCRO, não do selo: o selo pinta a
              própria cor por style inline, que venceria qualquer classe, e
              trocá-la apagaria a cor do rank. Assim a cor dele compõe por
              cima do escuro, e a borda e o texto seguem os do degrau. */}
          <span className="min-w-0 shrink rounded-full bg-black/55 backdrop-blur-sm">
            <SeloDeExclusiva
              minLevel={raffle.minLevel}
              className="min-w-0 pr-1.5 sm:pr-2.5"
            />
          </span>
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
        {/* O selo do boost continua em linha própria: ele é uma frase, não um
            rótulo, e disputaria a largura do rodapé com o preço e o botão. O
            selo de nível desceu para lá, onde a decisão acontece. */}
        {boostAtivo && vendendo && (
          <SeloDoBoost boost={boostAtivo} className="md:hidden" />
        )}

        {/* O RODAPÉ EM UMA LINHA SÓ: PREÇO, NÍVEL, BOTÃO.
            O selo de nível ocupava uma linha inteira acima daqui, e ele é
            uma condição da compra: pertence à mesma linha em que o preço e o
            botão estão. Numa vitrine que rola, cada linha a menos por cartão
            é um cartão a mais aparecendo na tela.

            `items-center` alinha os três pelo meio, `min-w-0` deixa o preço
            e o selo cederem largura, e só o botão é `shrink-0`: é ele que
            não pode encolher, porque é o que a pessoa vem tocar. */}
        <div className="flex items-end justify-between gap-3 border-t pt-3">
          <span>
            {/* GRÁTIS NÃO PRECISA DE RÓTULO.
                "Por número" existe para dizer que aquele valor é o de UMA
                cota, e não o total: com preço, a distinção importa. Grátis
                não tem essa ambiguidade, e o rótulo em cima só empurrava a
                palavra que interessa para baixo e para longe do botão.

                E ela cresce em vez de encolher. Antes o "GRÁTIS" saía MENOR
                que um preço qualquer, o que é o contrário do que ele vale:
                é o argumento mais forte que o cartão tem para oferecer. */}
            {!(raffle.isFree && vendendo) && (
              <span className="block text-[10px] tracking-wider text-muted-foreground uppercase">
                {vendendo ? "Por número" : "Títulos vendidos"}
              </span>
            )}
            <span
              className={cn(
                "text-xl leading-none font-bold text-primary",
                raffle.isFree &&
                  vendendo &&
                  "text-2xl tracking-[0.08em] uppercase drop-shadow-[0_0_14px_color-mix(in_srgb,var(--color-primary)_45%,transparent)]",
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
        // Cartão mais enxuto: a miniatura não cresce no desktop (era h-24 w-40).
        className="h-20 w-28 shrink-0 rounded-lg sm:w-32"
        sizes="128px"
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

        {/* Rodapé com dois itens curtos: preço à esquerda e UM selo à direita.
            No sorteio EXCLUSIVO, o selo de nível ("PRATA III") toma o lugar da
            chamada que pisca, porque o próprio nível já diz que é exclusivo, e
            os dois juntos não cabiam nem faziam sentido repetidos. No sorteio
            normal (sem nível), fica a chamada ("ADQUIRA JÁ!"). Sempre um só,
            encostado na direita, uniforme entre os cartões. */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 truncate font-bold text-primary",
              // Grátis sai com o mesmo peso do preço, com o espaçamento de
              // letras que a palavra pede.
              raffle.isFree && vendendo
                ? "text-base tracking-[0.06em] uppercase"
                : "text-base",
              // Fechada, o preço sai: ele convida a comprar uma coisa que não
              // está mais à venda.
              !vendendo && "text-xs tracking-wider uppercase",
            )}
          >
            {vendendo ? priceLabel(raffle) : "Assistir ao sorteio"}
          </span>
          {degrauDoRank(raffle.minLevel) ? (
            <SeloDeExclusiva
              minLevel={raffle.minLevel}
              className="ml-auto min-w-0 shrink-0"
            />
          ) : (
            <SeloDeStatus texto={statusBadge} className="ml-auto shrink-0" />
          )}
        </div>
      </div>
    </Link>
  );
}

