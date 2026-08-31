"use client";

// Lista de Compras por sorteio. Espelha o painel do SkinsLendarias:
// - Header rico com imagem, título, status, e linha de ícones de ação.
// - Painel expansível (controlado pelo "olho") com barra de progresso,
//   livres/reservados/pagos + totais R$, quando OFF os dados sensíveis
//   do comprador (telefone/CPF/email/reservationId) ficam mascarados.
// - 5 tabs com contadores: Todos / Pagos / Reservado / Expirados / Afiliados.
// - Busca por nome (q) e por número do título (ticket).
// - Lista paginada com 4 ações por linha: WhatsApp, Aprovar, Alterar
//   participante (TODO), Detalhes.

import { useEffect, useState, useTransition } from "react";
import {
  RaspadinhasModal,
  type ConfigDaRaspadinha,
} from "@/components/admin/raspadinhas-modal";
import { porcentagemDaSaida, type TipoDeSaida } from "@/lib/saida";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeftRight,
  Award,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  CreditCard,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  Info,
  Loader2,
  Lock,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Square,
  Trash2,
  Trophy,
  Unlock,
  X,
} from "lucide-react";
import type {
  ReservationStatus,
  SkinRarity,
  SurpriseBoxStatus,
} from "@prisma/client";

import { markReservationPaidAction } from "@/server/actions/reservations";
import {
  consultarDonoDoTituloAction,
  getTopBuyersAction,
  type DonoDoTitulo,
  type TopBuyer,
} from "@/server/actions/raffle-stats";
import {
  clearRaffleWinnerAction,
  createSurpriseBoxPrizesAction,
  salvarSaidaDoPremioAction,
  deleteSurpriseBoxAction,
  deleteSurpriseBoxPrizeAction,
  updateSurpriseBoxPrizeAction,
  setRaffleSurpriseBoxCombosAction,
  setRaffleWinnerAction,
  toggleSurpriseBoxPrizeLockAction,
} from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { CabecalhoDeModal } from "@/components/admin/cabecalho-de-modal";
import { Moldura, Placa } from "@/components/ui/moldura";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { casasDoTitulo, numeroDoTitulo } from "@/lib/titulo";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CampoDePremio,
  type SkinDoCatalogoSimples,
} from "@/components/admin/campo-de-premio";
import { RARITY_TEXT_VAR } from "@/lib/cs2";
import {
  linkDoWhatsapp,
  mensagemDeParabens,
  numeroInternacional,
} from "@/lib/whatsapp";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateTime } from "@/lib/format";
import { IconeDoWhatsapp } from "@/components/icones/whatsapp";
import { formatCpf, formatPhone } from "@/lib/cpf";

interface RaffleSummary {
  id: string;
  slug: string;
  /** URL absoluta da página pública, resolvida no servidor. */
  urlPublica: string;
  title: string;
  shortDescription: string | null;
  status: string;
  isFree: boolean;
  pricePerNumber: number;
  totalNumbers: number;
  imageUrl: string | null;
  winnerTicketNumber: number | null;
  winnerDrawnAt: string | null;
  winnerNote: string | null;
}

interface Stats {
  soldTickets: number;
  livres: number;
  reservados: number;
  pagos: number;
  paidTotal: number;
  pendingTotal: number;
  soldPercent: number;
  /** O que o gateway ficou, somando faixa por faixa. */
  taxas: number;
  /** Pagamentos de gateway sem faixa cadastrada: o líquido está otimista. */
  semTaxa: number;
  /** As reservas que um admin marcou como pagas pelo painel. */
  aprovadasNoPainel: { quantidade: number; valor: number };
}

interface Counts {
  all: number;
  paid: number;
  pending: number;
  expired: number;
  cancelled: number;
  affiliates: number;
}

interface ReservationRow {
  id: string;
  participantName: string;
  participantPhone: string | null;
  participantCpf: string | null;
  participantEmail: string | null;
  createdAt: string;
  status: ReservationStatus;
  ticketsCount: number;
  ticketNumbers: number[];
  totalAmount: number;
  unitPrice: number;
}

interface Filters {
  tab: "all" | "paid" | "pending" | "expired" | "cancelled" | "affiliates";
  q: string;
  ticket: string;
  page: number;
  pageSize: number;
}

export interface SurpriseBoxComboRow {
  id: string;
  threshold: number;
  boxCount: number;
  visible: boolean;
  highlighted: boolean;
}

export type SurpriseBoxDisplayOrder = "RANDOM" | "ASC" | "DESC";
export type SurpriseBoxPrizeMode = "RANDOM" | "PERCENT";

export interface SurpriseBoxPrizeRow {
  id: string;
  title: string;
  prize: string;
  mode: SurpriseBoxPrizeMode;
  odds: number | null;
  locked: boolean;
  claimed: boolean;
  /** Quando ele sai. Ver src/lib/saida.ts. */
  tipoDeSaida: TipoDeSaida;
  saidaEmTitulos: number | null;
  saidaTitulosDe: number | null;
  saidaTitulosAte: number | null;
  saidaDataDe: string | null;
  saidaDataAte: string | null;
  saidaDdds: string[];
}

export interface SurpriseBoxConfig {
  /** Para converter o ponto de saída, que é em títulos, em porcentagem. */
  totalNumbers: number;
  enabled: boolean;
  accumulative: boolean;
  abrirTodas: boolean;
  exibirGanhadores: boolean;
  displayOrder: SurpriseBoxDisplayOrder;
  combos: SurpriseBoxComboRow[];
  prizes: SurpriseBoxPrizeRow[];
  /**
   * Catálogo de skins do tenant, para sugerir o nome do prêmio.
   *
   * Viaja dentro da config das caixas, e não como prop nova, porque o
   * caminho até o campo passa por quatro componentes: a view, o modal das
   * caixas, o modal de inserir e o corpo dele. Uma prop atravessando os
   * quatro só para chegar num input é ruído em três deles.
   */
  catalogo: SkinDoCatalogoSimples[];
  /** As caixas já distribuídas, com quem levou e o que saiu. */
  caixas: CaixaDistribuida[];
}

export interface CaixaDistribuida {
  id: string;
  status: SurpriseBoxStatus;
  /** Onde o prêmio estava marcado para sair, em títulos. Nulo sem agendamento. */
  programadoEmTitulos?: number | null;
  /** Quantos títulos estavam vendidos quando esta caixa foi sorteada. */
  vendidosNaSaida?: number | null;
  /** Quando abriu, ou quando foi criada se ainda está fechada. */
  abertaEm: string;
  premioId: string | null;
  premioTitulo: string | null;
  premio: string | null;
  raridade: SkinRarity | null;
  ganhador: string;
  telefone: string | null;
  paisDoTelefone: string | null;
  pagoEm: string | null;
}

interface Props {
  raffle: RaffleSummary;
  stats: Stats;
  counts: Counts;
  reservations: ReservationRow[];
  filters: Filters;
  totalRows: number;
  totalPages: number;
  surpriseBox: SurpriseBoxConfig;
  raspadinha: ConfigDaRaspadinha;
}

const TABS: { key: Filters["tab"]; label: string; dotClass: string }[] = [
  { key: "all", label: "Todos", dotClass: "bg-sky-400" },
  { key: "paid", label: "Pagos", dotClass: "bg-emerald-500" },
  { key: "pending", label: "Reservado", dotClass: "bg-amber-400" },
  { key: "expired", label: "Expirados", dotClass: "bg-rose-400" },
  // Herdada da tela global de Reservas, que saiu. Sem ela, cancelada seria
  // o único estado sem lugar para ser visto.
  { key: "cancelled", label: "Cancelados", dotClass: "bg-zinc-400" },
  { key: "affiliates", label: "Afiliados", dotClass: "bg-violet-400" },
];

const STATUS_BADGE: Record<
  ReservationStatus,
  { label: string; className: string }
> = {
  PENDING: {
    label: "Aguardando pagamento",
    className:
      "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  PAID: {
    label: "Pago",
    className:
      "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  EXPIRED: {
    label: "Expirado",
    className:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  CANCELLED: {
    label: "Cancelado",
    className:
      "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  REFUNDED: {
    label: "Reembolsado",
    className: "bg-muted text-muted-foreground border-border",
  },
};

export function RaffleComprasView({
  raffle,
  stats,
  counts,
  reservations,
  filters,
  totalRows,
  totalPages,
  surpriseBox,
  raspadinha,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [caixasOpen, setCaixasOpen] = useState(false);
  const [raspadinhasOpen, setRaspadinhasOpen] = useState(false);
  const [winnerOpen, setWinnerOpen] = useState(false);

  return (
    <>
      <RaffleHeaderCard
        raffle={raffle}
        stats={stats}
        surpriseBox={surpriseBox}
        raspadinha={raspadinha}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails((v) => !v)}
        onOpenRanking={() => setRankingOpen(true)}
        onOpenCaixas={() => setCaixasOpen(true)}
        onOpenRaspadinhas={() => setRaspadinhasOpen(true)}
        onOpenWinner={() => setWinnerOpen(true)}
      />

      <RaspadinhasModal
        raffleId={raffle.id}
        initial={raspadinha}
        catalogo={surpriseBox.catalogo}
        aberto={raspadinhasOpen}
        aoFechar={() => setRaspadinhasOpen(false)}
      />

      <RankingModal
        open={rankingOpen}
        onOpenChange={setRankingOpen}
        raffleId={raffle.id}
      />
      <CaixasModal
        open={caixasOpen}
        onOpenChange={setCaixasOpen}
        raffleId={raffle.id}
        initial={surpriseBox}
      />
      <WinnerModal
        open={winnerOpen}
        onOpenChange={setWinnerOpen}
        raffle={raffle}
      />

      {/* Os números não dependem mais do olho.
          Ele escondia duas coisas ao mesmo tempo: o dinheiro da campanha e o
          telefone de quem comprou. Só a segunda é dado pessoal, e é por ela
          que alguém aperta o botão numa tela que fica aberta o dia todo. Com
          as duas juntas, esconder o telefone custava perder o quanto a
          campanha arrecadou, então ninguém escondia. */}
      <PainelDeNumeros stats={stats} totalNumbers={raffle.totalNumbers} />

      <Moldura>
        <TabsBar tab={filters.tab} counts={counts} />
        <SearchBar filters={filters} />
        <ReservationsTable
          reservations={reservations}
          raffle={raffle}
          showDetails={showDetails}
        />
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          totalRows={totalRows}
          pageSize={filters.pageSize}
        />
      </Moldura>
    </>
  );
}

// ============ HEADER ============

function RaffleHeaderCard({
  raffle,
  stats,
  surpriseBox,
  raspadinha,
  showDetails,
  onToggleDetails,
  onOpenRanking,
  onOpenCaixas,
  onOpenRaspadinhas,
  onOpenWinner,
}: {
  raffle: RaffleSummary;
  stats: Stats;
  surpriseBox: SurpriseBoxConfig;
  raspadinha: ConfigDaRaspadinha;
  showDetails: boolean;
  onToggleDetails: () => void;
  onOpenRanking: () => void;
  onOpenCaixas: () => void;
  onOpenRaspadinhas: () => void;
  onOpenWinner: () => void;
}) {
  const temGanhador = raffle.winnerTicketNumber != null;
  const pct = Math.min(100, Math.max(0, stats.soldPercent));
  return (
    <Moldura>
      <div className="space-y-5 p-4 md:p-6">
        <div className="flex items-start gap-4">
          <RaffleAvatar imageUrl={raffle.imageUrl} title={raffle.title} />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="line-clamp-2 text-lg font-black tracking-tight md:text-xl">
              {raffle.title}
            </h2>
            {raffle.shortDescription && (
              <p className="line-clamp-1 text-xs text-muted-foreground">
                {raffle.shortDescription}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[11px] font-bold">
                {raffle.isFree ? "GRÁTIS" : formatBRL(raffle.pricePerNumber)}
              </Badge>
              <Badge variant="outline" className="text-[11px]">
                {raffle.status}
              </Badge>
              {temGanhador && (
                <Badge
                  variant="outline"
                  className="border-amber-500/40 text-[11px] text-amber-400 tabular-nums"
                >
                  <Award className="mr-1 h-3 w-3" />
                  ganhador{" "}
                  {numeroDoTitulo(
                    raffle.winnerTicketNumber!,
                    raffle.totalNumbers,
                  )}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* A barra de venda.
            O número 85,20% sozinho, dentro de uma caixa cor de mostarda,
            obrigava a leitura para virar noção. Uma barra diz o mesmo antes
            de ser lida, e é o primeiro que se procura ao abrir a campanha. */}
        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-black tabular-nums">
              {stats.soldPercent.toFixed(2).replace(".", ",")}%
              <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                vendido
              </span>
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {stats.soldTickets.toLocaleString("pt-BR")} de{" "}
              {raffle.totalNumbers.toLocaleString("pt-BR")} títulos
            </span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Títulos vendidos"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-amber-400 transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* As ações da campanha.
            Eram sete ícones nus em fila, sem uma palavra: presente, disco,
            cartão e troféu, e descobrir qual era a raspadinha exigia passar o
            mouse em cada um, o que no celular nem existe. */}
        <div className="grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          <AcaoDaCampanha
            icone={<Award className="h-4 w-4" />}
            rotulo={temGanhador ? "Ganhador registrado" : "Definir ganhador"}
            nota={
              temGanhador
                ? `Título ${numeroDoTitulo(raffle.winnerTicketNumber!, raffle.totalNumbers)}`
                : "Registrar o número sorteado"
            }
            aoClicar={onOpenWinner}
            destaque={temGanhador}
          />
          <AcaoDaCampanha
            icone={<Gift className="h-4 w-4" />}
            rotulo="Caixas surpresas"
            nota={
              surpriseBox.prizes.length === 0
                ? "Nenhum prêmio cadastrado"
                : `${surpriseBox.prizes.length} prêmio(s)`
            }
            aoClicar={onOpenCaixas}
          />
          <AcaoDaCampanha
            icone={<CreditCard className="h-4 w-4" />}
            rotulo="Raspadinhas premiadas"
            nota={
              raspadinha.premios.length === 0
                ? "Nenhum prêmio cadastrado"
                : `${raspadinha.premios.length} prêmio(s)`
            }
            aoClicar={onOpenRaspadinhas}
          />
          <AcaoDaCampanha
            icone={<Trophy className="h-4 w-4" />}
            rotulo="Ranking de compras"
            nota="Quem mais comprou"
            aoClicar={onOpenRanking}
          />
          <AcaoDaCampanha
            icone={<ExternalLink className="h-4 w-4" />}
            rotulo="Ver a página"
            nota="Como o cliente vê"
            // Absoluta: este painel roda em admin.<domínio>, e ali o caminho
            // relativo cai de volta no admin em vez de abrir a campanha.
            href={raffle.urlPublica}
          />
          <AcaoDaCampanha
            icone={
              showDetails ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )
            }
            rotulo={
              showDetails ? "Esconder dados pessoais" : "Mostrar dados pessoais"
            }
            nota="Telefone, CPF e e-mail na lista"
            aoClicar={onToggleDetails}
            destaque={showDetails}
          />
          {/* Fica na fila, apagada e dizendo que ainda não existe. Como botão
              normal que abria um aviso de "em breve", ela gastava um clique
              para não fazer nada. */}
          <AcaoDaCampanha
            icone={<Disc3 className="h-4 w-4" />}
            rotulo="Roletas premiadas"
            nota="Em breve"
            emBreve
          />
        </div>
      </div>
    </Moldura>
  );
}

function RaffleAvatar({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  // A imagem que não carrega despejava o título inteiro no lugar dela, em
  // texto solto, atravessando o círculo e empurrando o resto do cabeçalho.
  // Vale a inicial, que é o que o resto do painel já mostra.
  const [quebrou, setQuebrou] = useState(false);
  const inicial = title.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] md:h-20 md:w-20">
      {imageUrl && !quebrou ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          onError={() => setQuebrou(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-2xl font-black text-muted-foreground">
          {inicial}
        </span>
      )}
    </div>
  );
}

/** Uma ação da campanha: ícone, o que ela faz, e o estado atual embaixo. */
function AcaoDaCampanha({
  icone,
  rotulo,
  nota,
  aoClicar,
  href,
  destaque,
  emBreve,
}: {
  icone: React.ReactNode;
  rotulo: string;
  nota: string;
  aoClicar?: () => void;
  href?: string;
  destaque?: boolean;
  emBreve?: boolean;
}) {
  const classe = cn(
    "group flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
    emBreve
      ? "cursor-not-allowed border-white/[0.06] bg-white/[0.01] opacity-50"
      : destaque
        ? "border-primary/40 bg-primary/[0.07] hover:bg-primary/10"
        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]",
  );
  const corpo = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]",
          destaque
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-white/10 bg-white/[0.04] text-muted-foreground",
          !emBreve && "group-hover:scale-105",
        )}
      >
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{rotulo}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {nota}
        </span>
      </span>
    </>
  );
  if (emBreve) {
    return (
      <div className={classe} aria-disabled title="Ainda não disponível">
        {corpo}
      </div>
    );
  }
  if (href) {
    return (
      <Link href={href} target="_blank" className={classe}>
        {corpo}
      </Link>
    );
  }
  return (
    <button type="button" onClick={aoClicar} className={classe}>
      {corpo}
    </button>
  );
}

// ============ MODAIS: RANKING DE COMPRAS ============

function RankingModal({
  open,
  onOpenChange,
  raffleId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raffleId: string;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [buyers, setBuyers] = useState<TopBuyer[]>([]);
  const [isPending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  function fetchRanking(start?: string | null, end?: string | null) {
    startTransition(async () => {
      const result = await getTopBuyersAction({
        raffleId,
        startDate: start ?? null,
        endDate: end ?? null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBuyers(result.data.buyers);
      setLoaded(true);
    });
  }

  // Carrega top 10 na primeira abertura do modal. Não chama de novo se
  // o admin já filtrou por data e fechou, preserva o resultado anterior.
  useEffect(() => {
    if (open && !loaded) fetchRanking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function reset() {
    setStartDate("");
    setEndDate("");
    fetchRanking();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <CabecalhoDeModal
          icone={<Trophy className="h-5 w-5" />}
          tom="premio"
          titulo="Top 10 compradores"
          descricao="Soma dos títulos pagos, agrupada por quem comprou. Escolha um período para recortar."
        />

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rankStart">Data inicial</Label>
              <Input
                id="rankStart"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rankEnd">Data final</Label>
              <Input
                id="rankEnd"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={isPending}
              onClick={() => fetchRanking(startDate, endDate)}
            >
              {isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-1.5 h-4 w-4" />
              )}
              Pesquisar
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Limpar filtro"
              onClick={reset}
              disabled={isPending}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {isPending && !buyers.length ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Carregando ranking...
            </div>
          ) : buyers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma compra encontrada no período.
            </div>
          ) : (
            <ul className="space-y-2 border-t pt-3">
              {buyers.map((b) => (
                <RankingRow key={`${b.rank}-${b.phone ?? b.name}`} buyer={b} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RankingRow({ buyer }: { buyer: TopBuyer }) {
  const firstName = buyer.name.trim().split(/\s+/)[0] ?? buyer.name;
  const phoneDigits = (buyer.phone ?? "").replace(/\D/g, "");
  const phoneMasked =
    phoneDigits.length >= 10 ? `(${phoneDigits.slice(0, 2)}) ****-****` : "-";
  const isFirst = buyer.rank === 1;
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <span
        className={cn(
          "tabular-nums font-bold shrink-0",
          isFirst ? "text-3xl text-amber-500" : "text-lg text-muted-foreground",
        )}
        style={{ minWidth: isFirst ? "3rem" : "2.5rem" }}
      >
        {buyer.rank}º
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "font-semibold truncate",
            isFirst ? "text-base" : "text-sm",
          )}
        >
          {firstName} ...
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {phoneMasked} · {buyer.ticketCount.toLocaleString("pt-BR")} cotas ·{" "}
          {formatBRL(buyer.totalAmount)}
        </div>
      </div>
      {phoneDigits.length >= 10 && (
        <div className="flex items-center gap-1 shrink-0">
          <Link
            href={`tel:+55${phoneDigits}`}
            target="_blank"
            aria-label="Ligar"
            title="Ligar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Phone className="h-4 w-4" />
          </Link>
          <Link
            // numeroInternacional em vez de "+55" no código: o cadastro
            // aceita outros países, e o DDI fixo montava um link para um
            // número brasileiro que não é o da pessoa.
            href={`https://wa.me/${numeroInternacional(phoneDigits)}`}
            target="_blank"
            aria-label="WhatsApp"
            title="WhatsApp"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/10 transition-colors"
          >
            <IconeDoWhatsapp className="h-5 w-5" />
          </Link>
        </div>
      )}
    </li>
  );
}

// ============ MODAIS: CAIXAS SURPRESAS ============

// Estado client-side dos combos enquanto o admin edita; só vira commit no save.
type ComboDraft = {
  // key local pra render, id do banco ou "tmp-..." pra linha nova.
  key: string;
  threshold: string; // string pra controlled input; coerce no save
  boxCount: string;
  visible: boolean;
  highlighted: boolean;
};

function CaixasModal({
  open,
  onOpenChange,
  raffleId,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raffleId: string;
  initial: SurpriseBoxConfig;
}) {
  // Body só monta quando open=true → useState initializer pega o `initial`
  // mais recente sem precisar de useEffect pra sincronizar.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[85vh] overflow-y-auto">
        {open && <CaixasModalBody raffleId={raffleId} initial={initial} />}
      </DialogContent>
    </Dialog>
  );
}

function CaixasModalBody({
  raffleId,
  initial,
}: {
  raffleId: string;
  initial: SurpriseBoxConfig;
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [accumulative, setAccumulative] = useState(initial.accumulative);
  const [abrirTodas, setAbrirTodas] = useState(initial.abrirTodas);
  const [exibirGanhadores, setExibirGanhadores] = useState(
    initial.exibirGanhadores,
  );
  const [displayOrder, setDisplayOrder] = useState<SurpriseBoxDisplayOrder>(
    initial.displayOrder,
  );
  const prizes = initial.prizes;
  const [combos, setCombos] = useState<ComboDraft[]>(() =>
    initial.combos.map((c) => ({
      key: c.id,
      threshold: String(c.threshold),
      boxCount: String(c.boxCount),
      visible: c.visible,
      highlighted: c.highlighted,
    })),
  );
  const [distribOpen, setDistribOpen] = useState(false);
  const [inserirOpen, setInserirOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function persist(payload: {
    enabled: boolean;
    accumulative: boolean;
    abrirTodas: boolean;
    exibirGanhadores: boolean;
    displayOrder: SurpriseBoxDisplayOrder;
    combos: ComboDraft[];
  }) {
    const cleaned = payload.combos
      .map((c) => ({
        threshold: Number(c.threshold),
        boxCount: Number(c.boxCount),
        visible: c.visible,
        highlighted: c.highlighted,
      }))
      .filter(
        (c) =>
          Number.isFinite(c.threshold) &&
          c.threshold > 0 &&
          Number.isFinite(c.boxCount) &&
          c.boxCount > 0,
      );

    // Sem duplicar threshold (constraint do banco).
    const seen = new Set<number>();
    for (const c of cleaned) {
      if (seen.has(c.threshold)) {
        toast.error(`Combo duplicado em "A partir de ${c.threshold}"`);
        return;
      }
      seen.add(c.threshold);
    }

    startTransition(async () => {
      const result = await setRaffleSurpriseBoxCombosAction({
        raffleId,
        enabled: payload.enabled,
        accumulative: payload.accumulative,
        abrirTodas: payload.abrirTodas,
        exibirGanhadores: payload.exibirGanhadores,
        displayOrder: payload.displayOrder,
        combos: cleaned,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Caixas Surpresas atualizadas");
    });
  }

  // Espelha o layout do print da SkinsLendarias: header simples, checkbox
  // "Ativar", 2 alerts (cadastre combos / nenhuma caixa) sempre visíveis,
  // linha "Filtrar por status" com Select + 3 botões primary (Combos /
  // Inserir / PDF), e tabela vazia com headers da listagem de caixas
  // distribuídas. A lista de combos cadastrados fica como bloco compacto
  // logo abaixo dos alerts pra dar feedback do que foi configurado.
  return (
    <>
      <CabecalhoDeModal
        icone={<Gift className="h-5 w-5" />}
        tom="premio"
        titulo="Caixas surpresas"
        descricao="Quem compra ganha caixas pelos combos. Cada prêmio sai no ponto da venda que você agendar."
        acessorio={
          <Badge variant="outline" className="text-[10px] tabular-nums">
            {prizes.length} prêmio(s)
          </Badge>
        }
      />

      <div className="space-y-4">
        {/* Chaves em vez de caixinhas, e cada uma dizendo o que muda.
            A raspadinha, que é a mesma mecânica, já era assim: com um lado em
            checkbox e outro em switch, duas telas irmãs pareciam de produtos
            diferentes. E "Abrir todas" sem uma linha embaixo não diz se abre
            as caixas de uma compra ou as da campanha. */}
        <div className="divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.02]">
          <label className="flex cursor-pointer items-start gap-3 px-3.5 py-3">
            <Switch
              checked={enabled}
              disabled={isPending}
              onCheckedChange={(next) => {
                const val = next === true;
                setEnabled(val);
                persist({
                  enabled: val,
                  accumulative,
                  abrirTodas,
                  exibirGanhadores,
                  displayOrder,
                  combos,
                });
              }}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                Ativar caixas surpresas
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Desligado, ninguém recebe caixa nas compras novas.
              </span>
            </span>
          </label>

          {enabled && (
            <label className="flex cursor-pointer items-start gap-3 px-3.5 py-3">
              <Switch
                checked={abrirTodas}
                disabled={isPending}
                onCheckedChange={(next) => {
                  const val = next === true;
                  setAbrirTodas(val);
                  persist({
                    enabled,
                    accumulative,
                    abrirTodas: val,
                    exibirGanhadores,
                    displayOrder,
                    combos,
                  });
                }}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  Botão &ldquo;Abrir todas&rdquo;
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Abre as caixas da compra de uma vez, sem clicar em cada uma.
                </span>
              </span>
            </label>
          )}

          {enabled && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
              <label className="flex cursor-pointer items-start gap-3">
                <Switch
                  checked={exibirGanhadores}
                  disabled={isPending}
                  onCheckedChange={(next) => {
                    const val = next === true;
                    setExibirGanhadores(val);
                    persist({
                      enabled,
                      accumulative,
                      abrirTodas,
                      exibirGanhadores: val,
                      displayOrder,
                      combos,
                    });
                  }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    Mostrar os ganhadores
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    A lista de quem já abriu, na página da campanha.
                  </span>
                </span>
              </label>
              {exibirGanhadores && (
                <Select
                  value={displayOrder}
                  onValueChange={(v) => {
                    if (!v) return;
                    const next = v as SurpriseBoxDisplayOrder;
                    setDisplayOrder(next);
                    persist({
                      enabled,
                      accumulative,
                      abrirTodas,
                      exibirGanhadores,
                      displayOrder: next,
                      combos,
                    });
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger className="h-8 w-36">
                    <SelectValue
                      labels={{
                        RANDOM: "Aleatório",
                        ASC: "Crescente",
                        DESC: "Decrescente",
                      }}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RANDOM">Aleatório</SelectItem>
                    <SelectItem value="ASC">Crescente</SelectItem>
                    <SelectItem value="DESC">Decrescente</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        {/* Um aviso só, e com o que fazer a seguir.
            Eram dois empilhados, um vermelho e um azul, dizendo a mesma coisa
            por ângulos diferentes: sem combo e sem prêmio a mecânica está
            ligada e não entrega nada. Vermelho ali também assustava sem
            motivo, já que campanha nova começa exatamente assim. */}
        {enabled && (combos.length === 0 || prizes.length === 0) && (
          <div
            role="status"
            className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-3 text-xs leading-relaxed text-amber-300"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {combos.length === 0 && prizes.length === 0
                ? "Falta o combo (quantos títulos dão quantas caixas) e falta prêmio. Sem os dois, ninguém recebe caixa."
                : combos.length === 0
                  ? "Falta o combo: sem ele ninguém recebe caixa, mesmo com prêmio cadastrado."
                  : "Falta prêmio: as caixas saem, mas todas vazias."}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* O filtro por status saiu.
              Ele vinha disabled desde sempre, sem nada por trás: um controle
              que não controla nada ensina a desconfiar dos que funcionam. */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setDistribOpen(true)}
          >
            Combos
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled
            title="Ainda não disponível"
          >
            PDF (em breve)
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full px-4"
            onClick={() => setInserirOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Inserir caixa
          </Button>
        </div>

        {/* Resumo dos combos cadastrados (some quando 0) */}
        {combos.length > 0 && (
          <div className="rounded-lg border bg-muted/20">
            <div className="border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Combos cadastrados ({combos.length})
            </div>
            <ul className="divide-y text-sm">
              {combos
                .slice()
                .sort((a, b) => Number(a.threshold) - Number(b.threshold))
                .map((c) => (
                  <li
                    key={c.key}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-muted-foreground">
                      A partir de{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {c.threshold}
                      </span>{" "}
                      títulos
                    </span>
                    <span className="font-semibold tabular-nums">
                      Ganha {c.boxCount}{" "}
                      {Number(c.boxCount) === 1 ? "CAIXA!" : "CAIXAS!"}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Lista compacta dos prêmios cadastrados no pool */}
        {prizes.some((p) => !p.claimed) && (
          <PrizesTable
            prizes={prizes}
            catalogo={initial.catalogo}
            totalNumbers={initial.totalNumbers}
            disabled={isPending}
          />
        )}

        <TabelaDeCaixas
          caixas={initial.caixas}
          catalogo={initial.catalogo}
          totalNumbers={initial.totalNumbers}
          disabled={isPending}
        />
      </div>

      <DistribuicaoCaixasModal
        open={distribOpen}
        onOpenChange={setDistribOpen}
        accumulative={accumulative}
        combos={combos}
        isPending={isPending}
        onSave={(nextCombos, nextAccumulative) => {
          setAccumulative(nextAccumulative);
          setCombos(nextCombos);
          persist({
            enabled,
            accumulative: nextAccumulative,
            abrirTodas,
            exibirGanhadores,
            displayOrder,
            combos: nextCombos,
          });
        }}
      />

      <InserirCaixaModal
        open={inserirOpen}
        onOpenChange={setInserirOpen}
        raffleId={raffleId}
        catalogo={initial.catalogo}
      />
    </>
  );
}

// Sub-modal "Inserir caixa", formulário pra criar uma caixa surpresa
// manual (não vem do combo automático). Schema de SurpriseBox ainda não
// existe, então hoje o Salvar mostra toast "em breve" e o layout fica
// pronto pra ligar quando o backend entrar.
function InserirCaixaModal({
  open,
  onOpenChange,
  raffleId,
  catalogo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raffleId: string;
  catalogo: SkinDoCatalogoSimples[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        {open && (
          <InserirCaixaBody
            raffleId={raffleId}
            catalogo={catalogo}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InserirCaixaBody({
  raffleId,
  catalogo,
  onClose,
}: {
  raffleId: string;
  catalogo: SkinDoCatalogoSimples[];
  onClose: () => void;
}) {
  const [titulo, setTitulo] = useState("Caixa Surpresa");
  const [quantidade, setQuantidade] = useState("1");
  const [premio, setPremio] = useState("");
  const [modo, setModo] = useState<SurpriseBoxPrizeMode>("RANDOM");
  const [odds, setOdds] = useState("");
  const [bloqueio, setBloqueio] = useState<"UNLOCKED" | "LOCKED">("UNLOCKED");
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const qty = Number(quantidade);
    if (!Number.isFinite(qty) || qty < 1 || qty > 100) {
      toast.error("Quantidade deve ser entre 1 e 100");
      return;
    }
    if (!premio.trim()) {
      toast.error("Descreva o prêmio");
      return;
    }
    if (modo === "PERCENT") {
      const o = Number(odds);
      if (!Number.isFinite(o) || o < 0 || o > 100) {
        toast.error("Porcentagem deve ser entre 0 e 100");
        return;
      }
    }

    startTransition(async () => {
      const result = await createSurpriseBoxPrizesAction({
        raffleId,
        title: titulo.trim() || "Caixa Surpresa",
        prize: premio.trim(),
        quantity: qty,
        mode: modo,
        odds: modo === "PERCENT" ? Number(odds) : null,
        locked: bloqueio === "LOCKED",
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.data?.count === 1
          ? "Prêmio cadastrado"
          : `${result.data?.count} prêmios cadastrados`,
      );
      onClose();
    });
  }

  return (
    <>
      <CabecalhoDeModal
        icone={<Gift className="h-5 w-5" />}
        tom="premio"
        titulo="Inserir caixa"
        descricao="Cada unidade nasce com o seu ponto de saída, uma atrás da outra."
      />

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="caixa-titulo" className="text-xs font-medium">
            Título
          </Label>
          <Input
            id="caixa-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Caixa Surpresa"
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="caixa-qtd" className="text-xs font-medium">
            Quantidade de Caixas
          </Label>
          <Input
            id="caixa-qtd"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            disabled={isPending}
          />
          <p className="text-[11px] text-muted-foreground">
            Cria N unidades do mesmo prêmio. Máximo 100 por cadastro.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="caixa-premio" className="text-xs font-medium">
            Prêmio
          </Label>
          {/* O placeholder ensinava "AK-47 Asiimov", sem a barra, que e um
              nome que o catalogo nunca reconhece: o premio saia sem a cor da
              raridade e ninguem era avisado. Agora o exemplo esta no formato
              da Steam e a sugestao faz o nome cair certo. */}
          <CampoDePremio
            valor={premio}
            aoMudar={setPremio}
            catalogo={catalogo}
            placeholder="Ex: AK-47 | Asiimov, R$ 50, Vale-presente..."
            desabilitado={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Modo</Label>
          <Select
            value={modo}
            onValueChange={(v) => v && setModo(v as SurpriseBoxPrizeMode)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue
                labels={{ RANDOM: "Aleatório", PERCENT: "Porcentagem" }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RANDOM">Aleatório</SelectItem>
              <SelectItem value="PERCENT">Porcentagem</SelectItem>
            </SelectContent>
          </Select>
          {modo === "PERCENT" && (
            <div className="pt-2 space-y-1.5">
              <Label htmlFor="caixa-odds" className="text-xs font-medium">
                Chance (%)
              </Label>
              <Input
                id="caixa-odds"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="0.01"
                value={odds}
                onChange={(e) => setOdds(e.target.value)}
                placeholder="Ex: 5"
                disabled={isPending}
              />
              <p className="text-[11px] text-muted-foreground">
                Probabilidade desse prêmio sair em cada caixa aberta.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Bloqueio</Label>
          <Select
            value={bloqueio}
            onValueChange={(v) => v && setBloqueio(v as typeof bloqueio)}
            disabled={isPending}
          >
            <SelectTrigger>
              <SelectValue
                labels={{ UNLOCKED: "Desbloqueada", LOCKED: "Bloqueada" }}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="UNLOCKED">Desbloqueada</SelectItem>
              <SelectItem value="LOCKED">Bloqueada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Salvar
        </Button>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="w-full text-sm text-amber-600 hover:text-amber-700 hover:underline pt-1 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </>
  );
}

// ============ TABELA DE CAIXAS DISTRIBUÍDAS ============
//
// O cabeçalho desta tabela já existia, com o corpo fixo em "Sem Registros" e
// um comentário dizendo que os dados viriam depois. Nunca vieram, e o efeito
// era o pior possível: o prêmio sorteado continuava aparecendo na lista de
// cadastrados, com o contador em "1/1", e não aparecia como premiação em
// lugar nenhum. Não dava para distinguir o que ainda está no pool do que já
// saiu para alguém.
//
// Agora o que já saiu vive aqui, e some da lista de cadastrados. São dois
// estados diferentes de duas coisas diferentes: lá é estoque, aqui é
// premiação.

const ROTULO_DO_STATUS: Record<SurpriseBoxStatus, string> = {
  UNOPENED: "Não aberta",
  OPENED_PRIZE: "Premiada",
  OPENED_EMPTY: "Sem prêmio",
};

function TabelaDeCaixas({
  caixas,
  catalogo,
  totalNumbers,
  disabled,
}: {
  caixas: CaixaDistribuida[];
  catalogo: SkinDoCatalogoSimples[];
  /** Para virar títulos em porcentagem, que é como a saída é lida. */
  totalNumbers: number;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState<CaixaDistribuida | null>(null);
  const [removendo, setRemovendo] = useState<CaixaDistribuida | null>(null);

  function avisar(c: CaixaDistribuida): string | null {
    if (!c.premio) return null;
    return linkDoWhatsapp(
      c.telefone,
      mensagemDeParabens({ nome: c.ganhador, premio: c.premio }),
      c.paisDoTelefone,
    );
  }

  function remover(boxId: string) {
    startTransition(async () => {
      const r = await deleteSurpriseBoxAction({ boxId });
      if (!r.ok) toast.error(r.error);
      else toast.success("Caixa removida, prêmio voltou para o pool");
      setRemovendo(null);
    });
  }

  return (
    <>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ganhador
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Título
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                Status
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Prêmio
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Saída
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Associado em
              </th>
              <th className="px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                Pago
              </th>
              <th className="w-20 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {caixas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
                    <Gift className="h-5 w-5" />
                  </span>
                  <p className="text-sm font-semibold">
                    Nenhuma caixa premiada ainda
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A lista mostra só as caixas que saíram com prêmio. As vazias
                    não aparecem.
                  </p>
                </td>
              </tr>
            )}
            {caixas.map((c) => (
              <tr key={c.id} className="hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">{c.ganhador}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {c.premioTitulo ?? "-"}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <Badge variant="outline" className="text-[10px]">
                    {ROTULO_DO_STATUS[c.status]}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  {c.premio ? (
                    <span
                      className="font-medium"
                      style={
                        c.raridade
                          ? { color: RARITY_TEXT_VAR[c.raridade] }
                          : undefined
                      }
                    >
                      {c.premio}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <SaidaDaCaixa caixa={c} totalNumbers={totalNumbers} />
                </td>
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {new Date(c.abertaEm).toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-muted-foreground">
                  {c.pagoEm
                    ? new Date(c.pagoEm).toLocaleDateString("pt-BR")
                    : "-"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {/* Avisar o ganhador é o passo seguinte a ele ganhar, e
                        era feito fora do sistema: abrir o WhatsApp, procurar o
                        número, copiar o nome da skin da tela. O link já leva a
                        conversa certa com o texto escrito, e o WhatsApp abre
                        com ele editável antes de enviar. Sem número cadastrado
                        o botão não aparece, em vez de abrir uma conversa
                        vazia. */}
                    {avisar(c) && (
                      <a
                        href={avisar(c)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Avisar ${c.ganhador} no WhatsApp`}
                        title="Avisar no WhatsApp com a mensagem pronta"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10"
                      >
                        <IconeDoWhatsapp className="h-5 w-5" />
                      </a>
                    )}
                    {/* Editar existe sobretudo aqui: nome errado que já saiu
                        para alguém é o que o ganhador está lendo, e era o
                        único caso sem conserto. */}
                    {c.premioId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        disabled={disabled || isPending}
                        onClick={() => setEditando(c)}
                        aria-label="Editar prêmio"
                        title="Editar o nome do prêmio"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      disabled={disabled || isPending}
                      onClick={() => setRemovendo(c)}
                      aria-label="Remover caixa"
                      title="Remover esta caixa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditarPremioModal
        aberto={editando != null}
        aoFechar={() => setEditando(null)}
        catalogo={catalogo}
        prizeIds={editando?.premioId ? [editando.premioId] : []}
        tituloInicial={editando?.premioTitulo ?? ""}
        premioInicial={editando?.premio ?? ""}
      />

      <Dialog
        open={removendo != null}
        onOpenChange={(v) => !v && setRemovendo(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Remover esta caixa?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A caixa de <b className="text-foreground">{removendo?.ganhador}</b>{" "}
            some da lista, e{" "}
            {removendo?.premio ? (
              <>
                <b className="text-foreground">{removendo.premio}</b> volta para
                os prêmios cadastrados, disponível para sair de novo.
              </>
            ) : removendo?.status === "UNOPENED" ? (
              // Caixa fechada e caixa aberta sem prêmio são coisas diferentes,
              // e o aviso dizia "saiu vazia" nas duas.
              "nada volta para o pool: esta caixa ainda não foi aberta."
            ) : (
              "nada volta para o pool, porque esta caixa saiu vazia."
            )}
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setRemovendo(null)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="flex-1"
              onClick={() => removendo && remover(removendo.id)}
              disabled={isPending}
            >
              {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============ MODAL: EDITAR PRÊMIO ============
//
// Vale para o prêmio ainda no pool e para o que já saiu. Renomear não mexe em
// quem ganhou nem em quando: só no texto e na raridade que sai dele.

function EditarPremioModal({
  aberto,
  aoFechar,
  catalogo,
  prizeIds,
  tituloInicial,
  premioInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  catalogo: SkinDoCatalogoSimples[];
  prizeIds: string[];
  tituloInicial: string;
  premioInicial: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        {aberto && (
          <EditarPremioBody
            // key remonta o formulário a cada prêmio: sem isso o campo
            // guardaria o texto do prêmio anterior ao abrir o seguinte.
            key={prizeIds.join(",")}
            catalogo={catalogo}
            prizeIds={prizeIds}
            tituloInicial={tituloInicial}
            premioInicial={premioInicial}
            aoFechar={aoFechar}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditarPremioBody({
  catalogo,
  prizeIds,
  tituloInicial,
  premioInicial,
  aoFechar,
}: {
  catalogo: SkinDoCatalogoSimples[];
  prizeIds: string[];
  tituloInicial: string;
  premioInicial: string;
  aoFechar: () => void;
}) {
  const [titulo, setTitulo] = useState(tituloInicial);
  const [premio, setPremio] = useState(premioInicial);
  const [isPending, startTransition] = useTransition();

  function salvar() {
    if (!premio.trim()) {
      toast.error("Descreva o prêmio");
      return;
    }
    startTransition(async () => {
      const r = await updateSurpriseBoxPrizeAction({
        prizeIds,
        title: titulo.trim() || "Caixa Surpresa",
        prize: premio.trim(),
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Prêmio atualizado");
        aoFechar();
      }
    });
  }

  return (
    <>
      <CabecalhoDeModal
        icone={<Pencil className="h-5 w-5" />}
        titulo="Editar prêmio"
        descricao="Vale para esta unidade só, e não para as outras de mesmo nome."
      />
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="editar-titulo" className="text-xs font-medium">
            Título
          </Label>
          <Input
            id="editar-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            disabled={isPending}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Prêmio</Label>
          <CampoDePremio
            valor={premio}
            aoMudar={setPremio}
            catalogo={catalogo}
            placeholder="Ex: AK-47 | Asiimov, R$ 50, Vale-presente..."
            desabilitado={isPending}
          />
        </div>
        {prizeIds.length > 1 && (
          <p className="text-[11px] text-muted-foreground">
            Vale para as {prizeIds.length} unidades deste prêmio.
          </p>
        )}
        <Button
          type="button"
          onClick={salvar}
          disabled={isPending}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Salvar
        </Button>
      </div>
    </>
  );
}

/**
 * Quando o grupo sai, em porcentagem da venda.
 *
 * Uma unidade mostra o ponto; várias mostram a faixa que elas cobrem, porque
 * cada uma tem o seu e elas saem uma atrás da outra. Prêmio antigo, cadastrado
 * antes de a saída existir, não ganha ponto inventado: ele continua saindo
 * pelo sorteio de chance, e a tela diz isso em vez de mentir uma porcentagem.
 */
function SeloDeSaida({
  tipo,
  pontos,
  totalNumbers,
}: {
  tipo: TipoDeSaida;
  pontos: (number | null)[];
  totalNumbers: number;
}) {
  if (tipo === "PERSONALIZADO") {
    return (
      <Badge variant="outline" className="text-[10px] text-primary">
        Saída personalizada
      </Badge>
    );
  }
  const pcts = pontos
    .map((p) => porcentagemDaSaida(p, totalNumbers))
    .filter((p): p is number => p != null)
    .sort((a, b) => a - b);
  if (pcts.length === 0) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        Sem agendamento
      </Badge>
    );
  }
  const fmt = (n: number) => `${n.toFixed(n < 10 ? 1 : 0).replace(".", ",")}%`;
  const primeiro = pcts[0]!;
  const ultimo = pcts[pcts.length - 1]!;
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/40 text-[10px] text-emerald-500 tabular-nums"
      title="Vai para a primeira caixa aberta a partir deste ponto da venda"
    >
      {pcts.length === 1 || primeiro === ultimo
        ? `sai em ${fmt(primeiro)}`
        : `sai de ${fmt(primeiro)} a ${fmt(ultimo)}`}
    </Badge>
  );
}

// Lista compacta dos prêmios cadastrados no pool, agrupada por title +
// prize pra não duplicar visualmente quando o admin cria várias unidades.
// Cada grupo mostra contador (claimed/total) + ações de lock/remove.
function PrizesTable({
  prizes,
  catalogo,
  totalNumbers,
  disabled,
}: {
  prizes: SurpriseBoxPrizeRow[];
  catalogo: SkinDoCatalogoSimples[];
  totalNumbers: number;
  disabled: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState<{
    ids: string[];
    title: string;
    prize: string;
  } | null>(null);
  const [configurando, setConfigurando] = useState<SurpriseBoxPrizeRow | null>(
    null,
  );

  function toggleLock(prizeId: string) {
    startTransition(async () => {
      const result = await toggleSurpriseBoxPrizeLockAction({ prizeId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Bloqueio atualizado");
      // SEM ISTO A TELA FICA MENTINDO ATÉ ALGUÉM RECARREGAR.
      //
      // A lista vem de props do servidor, então trocar o cadeado no banco não
      // mudava nada na tela: era preciso recarregar a página para ver o novo
      // estado. O refresh rebusca do servidor e a linha se atualiza no lugar.
      router.refresh();
    });
  }

  function remove(prizeId: string) {
    startTransition(async () => {
      const result = await deleteSurpriseBoxPrizeAction({ prizeId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Prêmio removido");
      router.refresh();
    });
  }

  // O que já saiu para alguém não é mais estoque: sai daqui e vive na tabela
  // de caixas distribuídas.
  const noPool = prizes.filter((p) => !p.claimed);

  // UMA LINHA POR UNIDADE, E NÃO POR NOME.
  //
  // Antes as unidades de mesmo nome vinham agrupadas em "4 unidades". Isso
  // fazia sentido quando elas eram intercambiáveis, e deixou de fazer quando
  // cada uma ganhou o SEU ponto de saída e o SEU cadeado: agrupada, a
  // porcentagem virava uma faixa que não dizia qual unidade sai quando, e não
  // havia onde clicar para configurar uma delas.
  //
  // Ordenadas pelo ponto de saída, que é a ordem em que elas vão sair de
  // verdade. Sem ponto vai para o fim: quem não tem hora marcada sai por
  // sorteio, depois de quem tem.
  const unidades = [...noPool].sort((a, b) => {
    const pa = a.saidaEmTitulos ?? Number.MAX_SAFE_INTEGER;
    const pb = b.saidaEmTitulos ?? Number.MAX_SAFE_INTEGER;
    return pa - pb;
  });

  // Quantas unidades de cada nome, para numerar "2 de 4" e deixar claro que
  // linhas parecidas não são repetição da tela.
  const totalPorNome = new Map<string, number>();
  for (const u of unidades) {
    const k = `${u.title}|${u.prize}`;
    totalPorNome.set(k, (totalPorNome.get(k) ?? 0) + 1);
  }
  const vistos = new Map<string, number>();

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b bg-muted/30 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Prêmios cadastrados ({unidades.length})
        </div>
        <ul className="divide-y">
          {unidades.map((u) => {
            const chave = `${u.title}|${u.prize}`;
            const quantos = totalPorNome.get(chave) ?? 1;
            const indice = (vistos.get(chave) ?? 0) + 1;
            vistos.set(chave, indice);
            return (
              <li
                key={u.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {u.prize}
                    </span>
                    {quantos > 1 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] tabular-nums"
                      >
                        {indice} de {quantos}
                      </Badge>
                    )}
                    {u.mode === "PERCENT" && u.odds != null && (
                      <Badge variant="outline" className="text-[10px]">
                        chance {u.odds}%
                      </Badge>
                    )}
                    <SeloDeSaida
                      tipo={u.tipoDeSaida}
                      pontos={[u.saidaEmTitulos]}
                      totalNumbers={totalNumbers}
                    />
                    {u.locked && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-[10px] text-amber-500"
                      >
                        Bloqueado
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {u.title}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={disabled || isPending}
                    onClick={() =>
                      setEditando({
                        ids: [u.id],
                        title: u.title,
                        prize: u.prize,
                      })
                    }
                    aria-label="Editar prêmio"
                    title="Editar o nome do prêmio"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {/* A engrenagem, que é onde mora a saída. Separada do
                      cadeado: bloquear é guardar o prêmio, configurar é dizer
                      quando ele sai, e juntar os dois num botão só é o que
                      deixava a configuração escondida. */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-primary"
                    disabled={disabled || isPending}
                    onClick={() => setConfigurando(u)}
                    aria-label="Configurar a saída deste prêmio"
                    title="Quando este prêmio sai"
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={disabled || isPending}
                    onClick={() => toggleLock(u.id)}
                    aria-label={u.locked ? "Desbloquear" : "Bloquear"}
                    title={
                      u.locked
                        ? "Desbloquear: volta a poder sair"
                        : "Bloquear: fica guardado e não sai"
                    }
                  >
                    {u.locked ? (
                      <Lock className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Unlock className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={disabled || isPending}
                    onClick={() => remove(u.id)}
                    aria-label="Remover prêmio"
                    title="Remover esta unidade"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <EditarPremioModal
        aberto={editando != null}
        aoFechar={() => setEditando(null)}
        catalogo={catalogo}
        prizeIds={editando?.ids ?? []}
        tituloInicial={editando?.title ?? ""}
        premioInicial={editando?.prize ?? ""}
      />

      <ConfigDeSaidaModal
        premio={configurando}
        totalNumbers={totalNumbers}
        aoFechar={() => setConfigurando(null)}
      />
    </>
  );
}

/**
 * Configurações de saída de UMA unidade de prêmio.
 *
 * Dois tipos, e eles respondem perguntas diferentes:
 *
 * PORCENTAGEM responde "em que ponto da venda". A unidade que a campanha é
 * medida no dia a dia, e o campo fala nela; o banco guarda o título, porque
 * porcentagem gravada mudaria de significado se o total de números mudasse.
 *
 * PERSONALIZADO responde "para qual compra". É o caso do disparo: se o
 * WhatsApp sai às 14h, a data inicial às 14h faz o prêmio esperar a compra que
 * veio dele, em vez de sair para quem comprou de manhã.
 *
 * Campo em branco não filtra. Um personalizado sem nenhuma condição vale para
 * qualquer compra, que é diferente de não valer para nenhuma.
 */
function ConfigDeSaidaModal({
  premio,
  totalNumbers,
  aoFechar,
}: {
  premio: SurpriseBoxPrizeRow | null;
  totalNumbers: number;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [tipo, setTipo] = useState<TipoDeSaida>("PROGRESSO");
  const [pct, setPct] = useState("");
  const [titulosDe, setTitulosDe] = useState("");
  const [titulosAte, setTitulosAte] = useState("");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [ddds, setDdds] = useState("");

  // O formulário nasce do prêmio que abriu. Guardar o id do último aberto é o
  // que evita reescrever o que a pessoa está digitando a cada renderização.
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  if (premio && premio.id !== ultimoId) {
    setUltimoId(premio.id);
    setTipo(premio.tipoDeSaida);
    const p = porcentagemDaSaida(premio.saidaEmTitulos, totalNumbers);
    setPct(p == null ? "" : p.toFixed(2).replace(".", ","));
    setTitulosDe(premio.saidaTitulosDe?.toString() ?? "");
    setTitulosAte(premio.saidaTitulosAte?.toString() ?? "");
    setDataDe(paraCampoDeData(premio.saidaDataDe));
    setDataAte(paraCampoDeData(premio.saidaDataAte));
    setDdds(premio.saidaDdds.join(", "));
  }

  const emTitulos = (() => {
    const n = Number(pct.replace(",", "."));
    if (!Number.isFinite(n) || totalNumbers <= 0) return null;
    return Math.min(
      totalNumbers,
      Math.max(1, Math.ceil((n / 100) * totalNumbers)),
    );
  })();

  async function salvar() {
    if (!premio) return;
    setSalvando(true);
    const result = await salvarSaidaDoPremioAction({
      prizeId: premio.id,
      tipoDeSaida: tipo,
      porcentagem: pct.trim() === "" ? null : Number(pct.replace(",", ".")),
      titulosDe: titulosDe.trim() === "" ? null : Number(titulosDe),
      titulosAte: titulosAte.trim() === "" ? null : Number(titulosAte),
      dataDe: dataDe.trim() === "" ? null : new Date(dataDe).toISOString(),
      dataAte: dataAte.trim() === "" ? null : new Date(dataAte).toISOString(),
      ddds: ddds
        .split(/[\s,]+/)
        .map((d) => d.replace(/\D/g, ""))
        .filter((d) => d.length === 2),
    });
    setSalvando(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Saída salva");
    aoFechar();
    router.refresh();
  }

  return (
    <Dialog open={premio != null} onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configurações de saída</DialogTitle>
          <DialogDescription>
            Quando <strong>{premio?.prize}</strong> vai sair. Ele vai para a
            primeira caixa aberta a partir do ponto escolhido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo de saída</Label>
            <Select
              value={tipo}
              onValueChange={(v) => v && setTipo(v as TipoDeSaida)}
            >
              <SelectTrigger className="w-full">
                <SelectValue
                  labels={{
                    PROGRESSO: "Porcentagem da venda",
                    PERSONALIZADO: "Personalizado",
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PROGRESSO">Porcentagem da venda</SelectItem>
                <SelectItem value="PERSONALIZADO">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipo === "PROGRESSO" ? (
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="saida-pct">
                Porcentagem
              </Label>
              <Input
                id="saida-pct"
                inputMode="decimal"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="12,50"
                className="font-mono"
              />
              {/* O título correspondente, ao vivo. Porcentagem sozinha é
                  abstrata numa campanha de 5.000 números: dizer "o 625º" é o
                  que deixa conferir se o ponto é o pretendido. */}
              <p className="text-[11px] text-muted-foreground">
                {emTitulos == null
                  ? "Em branco, este prêmio volta para o sorteio por chance."
                  : `Sai quando a venda chegar no título ${emTitulos.toLocaleString("pt-BR")} de ${totalNumbers.toLocaleString("pt-BR")}.`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="saida-tde">
                    Títulos, no mínimo
                  </Label>
                  <Input
                    id="saida-tde"
                    inputMode="numeric"
                    value={titulosDe}
                    onChange={(e) => setTitulosDe(e.target.value)}
                    placeholder="10"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="saida-tate">
                    Títulos, no máximo
                  </Label>
                  <Input
                    id="saida-tate"
                    inputMode="numeric"
                    value={titulosAte}
                    onChange={(e) => setTitulosAte(e.target.value)}
                    placeholder="sem limite"
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="saida-dde">
                    A partir de
                  </Label>
                  <Input
                    id="saida-dde"
                    type="datetime-local"
                    value={dataDe}
                    onChange={(e) => setDataDe(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="saida-date">
                    Até
                  </Label>
                  <Input
                    id="saida-date"
                    type="datetime-local"
                    value={dataAte}
                    onChange={(e) => setDataAte(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="saida-ddd">
                  DDDs (opcional)
                </Label>
                <Input
                  id="saida-ddd"
                  value={ddds}
                  onChange={(e) => setDdds(e.target.value)}
                  placeholder="62, 11, 21"
                  className="font-mono"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Campo em branco não filtra. Para um disparo de WhatsApp das 14h,
                ponha 14h em <strong>A partir de</strong>: o prêmio espera a
                compra que veio dele em vez de sair para quem comprou de manhã.
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="h-9 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-opacity hover:opacity-95 disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** ISO para o formato que datetime-local aceita, no fuso de quem olha. */
function paraCampoDeData(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
// Toggle "Combos Acumulativos" no topo + tabela editável de tiers.
function DistribuicaoCaixasModal({
  open,
  onOpenChange,
  accumulative,
  combos,
  isPending,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  accumulative: boolean;
  combos: ComboDraft[];
  isPending: boolean;
  onSave: (combos: ComboDraft[], accumulative: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-7xl max-h-[85vh] overflow-y-auto">
        {open && (
          <DistribuicaoCaixasBody
            accumulative={accumulative}
            combos={combos}
            isPending={isPending}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DistribuicaoCaixasBody({
  accumulative,
  combos,
  isPending,
  onSave,
}: {
  accumulative: boolean;
  combos: ComboDraft[];
  isPending: boolean;
  onSave: (combos: ComboDraft[], accumulative: boolean) => void;
}) {
  // Espelha o print do SkinsLendarias: red alert no topo quando 0 combos,
  // header simples, checkbox "Combos Acumulativos ***", botão âmbar
  // "Cadastrar combo" e tabela inline (A partir de [N] Títulos | Ganha [N]
  // CAIXAS! | Exibir | Destacar | trash). Sem botões Salvar/Cancelar,
  // todas as mudanças persistem automaticamente.
  const [draft, setDraft] = useState<ComboDraft[]>(combos);
  const [accum, setAccum] = useState(accumulative);

  function commit(nextDraft: ComboDraft[], nextAccum: boolean) {
    onSave(nextDraft, nextAccum);
  }

  function toggleAccum(v: boolean) {
    setAccum(v);
    commit(draft, v);
  }

  function addRow() {
    // Linha nova vai vazia, só persiste quando admin preenche threshold +
    // boxCount e dá blur. Antes disso, a row fica como rascunho local.
    setDraft((d) => [
      ...d,
      {
        key: `tmp-${crypto.randomUUID()}`,
        threshold: "",
        boxCount: "",
        visible: true,
        highlighted: false,
      },
    ]);
  }

  function patchRow(key: string, patch: Partial<ComboDraft>) {
    setDraft((d) => d.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function blurRow() {
    // Persiste no servidor, backend filtra linhas com threshold/boxCount
    // inválidos, então rascunhos vazios não são gravados.
    commit(draft, accum);
  }

  function toggleVisible(key: string, value: boolean) {
    const next = draft.map((r) =>
      r.key === key ? { ...r, visible: value } : r,
    );
    setDraft(next);
    commit(next, accum);
  }

  function toggleHighlighted(key: string, value: boolean) {
    const next = draft.map((r) =>
      r.key === key ? { ...r, highlighted: value } : r,
    );
    setDraft(next);
    commit(next, accum);
  }

  function removeRow(key: string) {
    const next = draft.filter((r) => r.key !== key);
    setDraft(next);
    commit(next, accum);
  }

  return (
    <>
      {/* Red alert no topo do dialog quando ainda não há combos. Posição
          exata do print: flush com a borda do dialog (negative margin
          neutraliza o p-4 do DialogContent) e top rounded pra acompanhar
          o canto do modal. */}
      {draft.length === 0 && (
        <div
          role="alert"
          className="-mx-4 -mt-4 mb-2 flex items-start gap-2 rounded-t-xl border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive dark:text-rose-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Cadastre combos para a distribuição das caixas!</span>
        </div>
      )}

      <CabecalhoDeModal
        icone={<Gift className="h-5 w-5" />}
        titulo="Distribuição das caixas"
        descricao="Quantos títulos dão quantas caixas, e em que ordem elas aparecem."
      />

      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={accum}
            disabled={isPending}
            onCheckedChange={(v) => toggleAccum(v === true)}
          />
          <span className="text-sm">
            Combos Acumulativos{" "}
            <span className="text-muted-foreground">***</span>
          </span>
        </label>

        <Button
          type="button"
          onClick={addRow}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white"
        >
          Cadastrar combo
        </Button>

        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                  A partir de
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                  Quantidade de Caixas
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                  Exibir combo
                </th>
                <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground text-center">
                  Destacar
                </th>
                <th className="px-4 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {draft.map((row) => (
                <tr key={row.key} className="hover:bg-muted/20">
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        A partir de
                      </span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={row.threshold}
                        onChange={(e) =>
                          patchRow(row.key, { threshold: e.target.value })
                        }
                        onBlur={blurRow}
                        placeholder="10"
                        className="h-9 w-20 text-center"
                      />
                      <span className="text-sm text-muted-foreground">
                        Títulos
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        Ganha
                      </span>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={row.boxCount}
                        onChange={(e) =>
                          patchRow(row.key, { boxCount: e.target.value })
                        }
                        onBlur={blurRow}
                        placeholder="1"
                        className="h-9 w-20 text-center"
                      />
                      <span className="text-sm font-semibold">
                        {Number(row.boxCount) === 1 ? "CAIXA!" : "CAIXAS!"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Checkbox
                      checked={row.visible}
                      disabled={isPending}
                      onCheckedChange={(v) =>
                        toggleVisible(row.key, v === true)
                      }
                      aria-label="Exibir combo"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Checkbox
                      checked={row.highlighted}
                      disabled={isPending}
                      onCheckedChange={(v) =>
                        toggleHighlighted(row.key, v === true)
                      }
                      aria-label="Destacar"
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={isPending}
                      className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => removeRow(row.key)}
                      aria-label="Remover combo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ============ MODAL: DEFINIR GANHADOR DO SORTEIO ============

function WinnerModal({
  open,
  onOpenChange,
  raffle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  raffle: RaffleSummary;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {open && (
          <WinnerBody raffle={raffle} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function WinnerBody({
  raffle,
  onClose,
}: {
  raffle: RaffleSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const alreadySet = raffle.winnerTicketNumber != null;
  const [ticketNumber, setTicketNumber] = useState(
    alreadySet ? String(raffle.winnerTicketNumber) : "",
  );
  const [note, setNote] = useState(raffle.winnerNote ?? "");
  const [finish, setFinish] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [conferido, setConferido] = useState<DonoDoTitulo | null>(null);

  const n = Number(ticketNumber);
  const valido =
    ticketNumber.trim() !== "" &&
    Number.isFinite(n) &&
    n >= 1 &&
    n <= raffle.totalNumbers;
  const foraDaFaixa = ticketNumber.trim() !== "" && !valido;

  /**
   * Quem está com este título, enquanto se digita.
   *
   * Registrar o ganhador publica um nome, encerra a campanha e vira uma
   * entrega. Antes só dava para saber quem era DEPOIS de gravar, pelo aviso do
   * salvamento, e um dígito trocado já era público. Meio segundo de espera
   * evita uma consulta por tecla.
   */
  useEffect(() => {
    if (!valido) return;
    let vivo = true;
    const t = setTimeout(async () => {
      const r = await consultarDonoDoTituloAction({
        raffleId: raffle.id,
        number: n,
      });
      if (vivo && r.ok) setConferido(r.data);
    }, 500);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [valido, n, raffle.id]);

  // A resposta guardada carrega o número que ela responde, então "ainda não
  // conferi este" é uma comparação, e não um segundo estado para manter em dia.
  // Zerar por efeito a cada tecla seria escrever estado durante o render, que é
  // de onde vêm os renders em cascata.
  const dono = conferido?.number === n ? conferido : null;
  const conferindo = valido && dono == null;

  function save() {
    if (!valido) {
      toast.error(`Número deve estar entre 1 e ${raffle.totalNumbers}`);
      return;
    }
    if (alreadySet && raffle.winnerTicketNumber !== n) {
      if (
        !confirm(
          `Substituir o ganhador ${raffle.winnerTicketNumber} pelo ${n}?`,
        )
      ) {
        return;
      }
    }
    startTransition(async () => {
      const result = await setRaffleWinnerAction({
        raffleId: raffle.id,
        ticketNumber: n,
        note,
        finish,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const w = result.data!;
      if (w.participantName) {
        toast.success(
          `Ganhador: ${w.participantName} (título ${w.ticketNumber})`,
        );
      } else {
        toast.warning(
          `Número ${w.ticketNumber} salvo, mas não achamos o comprador (talvez ninguém tenha comprado esse título).`,
        );
      }
      router.refresh();
      onClose();
    });
  }

  function clearWinner() {
    if (
      !confirm("Remover o ganhador registrado? A rifa volta pro estado ACTIVE.")
    ) {
      return;
    }
    startTransition(async () => {
      const result = await clearRaffleWinnerAction({ raffleId: raffle.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Ganhador removido");
      router.refresh();
      onClose();
    });
  }

  return (
    <>
      <CabecalhoDeModal
        icone={<Award className="h-5 w-5" />}
        tom="premio"
        titulo={alreadySet ? "Ganhador do sorteio" : "Definir ganhador"}
        descricao="O número entra na página da campanha junto com a nota, e quem estiver com ele vira o ganhador."
      />

      <div className="space-y-4">
        {alreadySet && raffle.winnerDrawnAt && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-3 text-xs text-amber-200">
            <Award className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <p className="font-bold">
                Já registrado: título{" "}
                <span className="tabular-nums">
                  {numeroDoTitulo(
                    raffle.winnerTicketNumber!,
                    raffle.totalNumbers,
                  )}
                </span>
              </p>
              <p className="mt-0.5 opacity-90">
                Sorteado em {formatDateTime(new Date(raffle.winnerDrawnAt))}.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="winner-number" className="text-xs font-medium">
            Número do título sorteado
          </Label>
          <Input
            id="winner-number"
            type="number"
            inputMode="numeric"
            min={1}
            max={raffle.totalNumbers}
            value={ticketNumber}
            onChange={(e) => setTicketNumber(e.target.value)}
            placeholder={String(1).padStart(
              casasDoTitulo(raffle.totalNumbers),
              "0",
            )}
            disabled={isPending}
            className="h-12 font-mono text-xl tabular-nums"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground tabular-nums">
              {valido ? (
                <>
                  Vai aparecer como{" "}
                  <strong className="font-mono">
                    {numeroDoTitulo(n, raffle.totalNumbers)}
                  </strong>
                </>
              ) : (
                <>
                  Títulos de{" "}
                  {String(1).padStart(casasDoTitulo(raffle.totalNumbers), "0")}{" "}
                  a {raffle.totalNumbers.toLocaleString("pt-BR")}
                </>
              )}
            </p>
            {foraDaFaixa && (
              <Badge
                variant="outline"
                className="border-red-500/50 text-[10px] text-red-400"
              >
                fora do intervalo da campanha
              </Badge>
            )}
          </div>
          <ConferenciaDoTitulo
            valido={valido}
            conferindo={conferindo}
            dono={dono}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="winner-note" className="text-xs font-medium">
            Nota / comprovação (opcional)
          </Label>
          <Textarea
            id="winner-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: Resultado da Loteria Federal do dia 15/08/2026, extração 5842. Link do vídeo do sorteio, hash do bloco usado como semente, etc."
            disabled={isPending}
            maxLength={2000}
            rows={4}
            className="resize-none"
          />
          <p className="text-[11px] text-muted-foreground">
            Aparece publicamente pra dar transparência de como o número foi
            escolhido.
          </p>
        </div>

        <label className="flex cursor-pointer select-none items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <Checkbox
            checked={finish}
            disabled={isPending}
            onCheckedChange={(v) => setFinish(v === true)}
            className="mt-0.5"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              Encerrar a campanha
            </span>
            <span className="block text-[11px] text-muted-foreground">
              Ela sai do ar para novas compras e passa a mostrar o resultado.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-white/10 pt-3">
          {alreadySet && (
            <button
              type="button"
              onClick={clearWinner}
              disabled={isPending}
              className="mr-auto text-xs text-destructive hover:underline disabled:opacity-50"
            >
              Remover ganhador
            </button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isPending}
            className="rounded-full"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={isPending || !valido}
            className="rounded-full bg-amber-500 px-5 text-white hover:bg-amber-600"
          >
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {alreadySet ? "Atualizar" : "Registrar ganhador"}
          </Button>
        </div>
      </div>
    </>
  );
}

/** O aviso de quem está com o título digitado, embaixo do campo. */
function ConferenciaDoTitulo({
  valido,
  conferindo,
  dono,
}: {
  valido: boolean;
  conferindo: boolean;
  dono: DonoDoTitulo | null;
}) {
  if (!valido) return null;
  if (conferindo || !dono) {
    return (
      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Conferindo de quem é este título...
      </p>
    );
  }
  if (!dono.nome) {
    return (
      <p className="flex items-start gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[11px] text-amber-300">
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
        Ninguém comprou este título. Dá para registrar assim mesmo, mas a
        campanha vai ficar sem ganhador para exibir.
      </p>
    );
  }
  const pago = dono.status === "PAID";
  return (
    <p
      className={cn(
        "flex items-start gap-1.5 rounded-xl border px-3 py-2 text-[11px]",
        pago
          ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-300"
          : "border-amber-500/30 bg-amber-500/[0.06] text-amber-300",
      )}
    >
      <Check className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Este título é de <strong>{dono.nome}</strong>
        {!pago && ", numa compra que ainda não foi paga"}.
      </span>
    </p>
  );
}

// ============ STATS PANEL ============

function PainelDeNumeros({
  stats,
  totalNumbers,
}: {
  stats: Stats;
  totalNumbers: number;
}) {
  return (
    <Moldura>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 md:p-5">
        {/* Dinheiro primeiro, e nas duas primeiras placas, porque é a pergunta
            que traz alguém a esta tela. */}
        <Placa
          rotulo="Recebido"
          valor={formatBRL(stats.paidTotal)}
          nota={
            stats.pagos === 0
              ? "nenhuma compra paga"
              : `${stats.pagos.toLocaleString("pt-BR")} compra(s) paga(s)` +
                (stats.aprovadasNoPainel.quantidade > 0
                  ? `, ${stats.aprovadasNoPainel.quantidade} no painel`
                  : "")
          }
          icone={<Check className="h-3 w-3" />}
          tom="bom"
          destaque
        />
        {/* O bruto sozinho não é o que sobra: o gateway já ficou com a parte
            dele antes de o dinheiro cair. */}
        <Placa
          rotulo="Líquido"
          valor={formatBRL(Math.max(0, stats.paidTotal - stats.taxas))}
          nota={
            stats.taxas > 0
              ? `${formatBRL(stats.taxas)} em taxas`
              : stats.semTaxa > 0
                ? "gateway sem taxa cadastrada"
                : "sem taxa cadastrada"
          }
          icone={<Coins className="h-3 w-3" />}
          tom={stats.taxas > 0 ? "custo" : "neutro"}
        />
        <Placa
          rotulo="Aguardando pagamento"
          valor={formatBRL(stats.pendingTotal)}
          nota={
            stats.reservados === 0
              ? "nenhuma reserva aberta"
              : `${stats.reservados.toLocaleString("pt-BR")} reserva(s) aberta(s)`
          }
          icone={<Square className="h-3 w-3" />}
          tom={stats.pendingTotal > 0 ? "custo" : "neutro"}
        />
        {/* Títulos e compras ficavam lado a lado dizendo só "148 Livres" e
            "503 Pagos", como se as duas contassem a mesma coisa. Não contam:
            148 é título, 503 é compra, e uma compra leva vários títulos. Os
            rótulos passam a dizer qual é qual. */}
        <Placa
          rotulo="Títulos vendidos"
          valor={stats.soldTickets.toLocaleString("pt-BR")}
          nota={`de ${totalNumbers.toLocaleString("pt-BR")} da campanha`}
          icone={<Trophy className="h-3 w-3" />}
          tom="marca"
        />
        <Placa
          rotulo="Títulos livres"
          valor={stats.livres.toLocaleString("pt-BR")}
          nota={stats.livres === 0 ? "campanha esgotada" : "ainda à venda"}
          icone={<Square className="h-3 w-3" />}
        />
      </div>
    </Moldura>
  );
}

// ============ TABS ============

function TabsBar({ tab, counts }: { tab: Filters["tab"]; counts: Counts }) {
  const searchParams = useSearchParams();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
      {TABS.map((t) => {
        const active = tab === t.key;
        const params = new URLSearchParams(searchParams.toString());
        if (t.key === "all") {
          params.delete("tab");
        } else {
          params.set("tab", t.key);
        }
        params.delete("page");
        const value = counts[t.key];
        return (
          <Link
            key={t.key}
            href={`?${params.toString()}`}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
              active
                ? "bg-white/[0.07] text-foreground ring-1 ring-white/10"
                : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white tabular-nums",
                t.dotClass,
                // A bolinha do filtro apagado fica sem cor: seis bolinhas
                // coloridas em fila competiam com a que está selecionada.
                !active && "opacity-60",
              )}
            >
              {value}
            </span>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

// ============ BUSCA ============

function SearchBar({ filters }: { filters: Filters }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(filters.q);
  const [ticket, setTicket] = useState(filters.ticket);

  function submit() {
    const params = new URLSearchParams(searchParams.toString());
    if (q.trim()) params.set("q", q.trim());
    else params.delete("q");
    if (ticket.trim()) params.set("ticket", ticket.trim());
    else params.delete("ticket");
    params.delete("page");
    router.push(`?${params.toString()}`);
  }
  function clear() {
    setQ("");
    setTicket("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("ticket");
    params.delete("page");
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="grid gap-2 border-b border-white/10 p-3 md:grid-cols-[1fr_200px_auto]">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar pelo nome de quem comprou"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="pl-9"
        />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Nº do título"
          inputMode="numeric"
          value={ticket}
          onChange={(e) => setTicket(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="pl-9"
        />
      </div>
      <div className="flex items-center gap-1">
        <Button type="button" onClick={submit} className="rounded-full px-5">
          Buscar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={clear}
          aria-label="Limpar"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ============ TABELA ============

function ReservationsTable({
  reservations,
  raffle,
  showDetails,
}: {
  reservations: ReservationRow[];
  raffle: RaffleSummary;
  showDetails: boolean;
}) {
  if (reservations.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-muted-foreground">
          <Search className="h-5 w-5" />
        </span>
        <p className="text-sm font-semibold">Nenhuma compra por aqui</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Troque a aba acima ou limpe a busca para ver as outras.
        </p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-white/[0.06]">
      {reservations.map((r) => (
        <ReservationRowItem
          key={r.id}
          row={r}
          raffle={raffle}
          showDetails={showDetails}
        />
      ))}
    </ul>
  );
}

function ReservationRowItem({
  row,
  raffle,
  showDetails,
}: {
  row: ReservationRow;
  raffle: RaffleSummary;
  showDetails: boolean;
}) {
  const initial = row.participantName.trim().charAt(0).toUpperCase() || "?";
  const badge = STATUS_BADGE[row.status];

  return (
    <li className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02] md:flex-row md:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] font-bold text-muted-foreground">
          {initial}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="text-sm font-semibold truncate">
            {row.participantName}
          </div>
          {showDetails ? (
            <>
              {row.participantPhone && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatPhone(row.participantPhone)}
                </div>
              )}
              {row.participantCpf && (
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatCpf(row.participantCpf)}
                </div>
              )}
            </>
          ) : (
            <>
              <BlurredLine width={120} />
              <BlurredLine width={140} />
            </>
          )}
          <div className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(new Date(row.createdAt))}
          </div>
          {showDetails ? (
            <>
              <div className="text-[11px] text-muted-foreground tabular-nums break-all">
                {row.id}
              </div>
              {row.ticketNumbers.length > 0 && (
                <div className="pt-1 flex flex-wrap gap-1">
                  {row.ticketNumbers.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary tabular-nums"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <BlurredLine width={160} />
          )}
        </div>
      </div>

      <div className="md:min-w-[130px] md:text-right">
        <div className="text-sm font-bold text-primary tabular-nums">
          {formatBRL(row.totalAmount)}
        </div>
        {/* A conta por trás do total, sem o risco em cima.
            Ela vinha com line-through, que num valor quer dizer preço
            cancelado, e não "detalhe do total". Some quando a reserva não tem
            título nenhum, porque ali "0 x R$ 4,99" não explica nada. */}
        {row.ticketsCount > 0 && (
          <div className="text-[11px] text-muted-foreground tabular-nums">
            {row.ticketsCount} título(s) de {formatBRL(row.unitPrice)}
          </div>
        )}
      </div>

      <div className="md:min-w-[180px] md:text-center">
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </div>

      <RowActions row={row} raffle={raffle} />
    </li>
  );
}

function BlurredLine({ width }: { width: number }) {
  return (
    <div
      className="h-3 rounded bg-muted-foreground/15 select-none"
      style={{ width }}
      aria-hidden
    />
  );
}

function RowActions({
  row,
  raffle,
}: {
  row: ReservationRow;
  raffle: RaffleSummary;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const waMessage = encodeURIComponent(
    `Olá *${row.participantName}*,\n\n` +
      `Sua reserva _${row.id}_ está aguardando pagamento.\n\n` +
      `Campanha: *${raffle.title}*\n` +
      `Valor: ${formatBRL(row.totalAmount)}\n\n` +
      `Pague aqui: ${typeof window !== "undefined" ? window.location.origin : ""}/comprovante/${row.id}`,
  );
  const waHref = row.participantPhone
    ? `https://wa.me/${numeroInternacional(row.participantPhone)}?text=${waMessage}`
    : null;

  function approve() {
    if (row.status === "PAID") {
      toast.info("Esta reserva já está paga");
      return;
    }
    if (!confirm(`Marcar a reserva de ${row.participantName} como paga?`))
      return;
    startTransition(async () => {
      const result = await markReservationPaidAction(row.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Reserva marcada como paga");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1 md:justify-end">
      {waHref ? (
        <Link
          href={waHref}
          target="_blank"
          aria-label="WhatsApp"
          title="Enviar mensagem no WhatsApp"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/10 transition-colors"
        >
          <IconeDoWhatsapp className="h-5 w-5" />
        </Link>
      ) : (
        <span className="h-9 w-9" aria-hidden />
      )}
      <button
        type="button"
        onClick={approve}
        disabled={isPending || row.status === "PAID"}
        aria-label="Aprovar compra"
        title="Aprovar compra"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => toast.info("Alterar participante: em breve")}
        aria-label="Alterar participante"
        title="Alterar participante"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <ArrowLeftRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        aria-label="Detalhes da reserva"
        title="Detalhes da reserva"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Info className="h-4 w-4" />
      </button>

      <ReservationDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        row={row}
      />
    </div>
  );
}

// Modal admin com o dossiê completo da reserva. Sem máscara de PII (é
// admin-only), formato pensado pra dar contexto rápido de suporte/dúvida
// do comprador. Espelha o card "Detalhes da sua compra" do reference,
// com blocos extras que só fazem sentido internamente (email, ID da
// reserva copiável, atalho pra abrir o comprovante público).
function ReservationDetailsModal({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: ReservationRow;
}) {
  const badge = STATUS_BADGE[row.status];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <CabecalhoDeModal
          icone={<Info className="h-5 w-5" />}
          titulo="Detalhes da reserva"
          descricao="Os dados de contato de quem comprou e os títulos desta compra."
        />

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/20 px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                ID da reserva
              </p>
              <p className="text-xs font-mono tabular-nums break-all">
                {row.id}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(row.id).then(
                  () => toast.success("ID copiado"),
                  () => toast.error("Falha ao copiar"),
                );
              }}
              className="shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              Copiar
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailField label="Comprador" value={row.participantName} />
            <DetailField
              label="Situação"
              value={
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              }
            />
            <DetailField
              label="CPF"
              value={row.participantCpf ? formatCpf(row.participantCpf) : "-"}
              mono
            />
            <DetailField
              label="Telefone"
              value={
                row.participantPhone ? formatPhone(row.participantPhone) : "-"
              }
              mono
            />
            <DetailField
              label="E-mail"
              value={row.participantEmail || "-"}
              className="sm:col-span-2"
            />
            <DetailField
              label="Data / horário"
              value={formatDateTime(new Date(row.createdAt))}
              mono
            />
            <DetailField
              label="Preço unitário"
              value={formatBRL(row.unitPrice)}
              mono
            />
            <DetailField
              label="Quantidade"
              value={`${row.ticketsCount} título${
                row.ticketsCount === 1 ? "" : "s"
              }`}
              mono
            />
            <DetailField
              label="Total"
              value={
                <span className="text-sm font-bold text-primary">
                  {formatBRL(row.totalAmount)}
                </span>
              }
            />
          </div>

          <div className="rounded-lg border bg-card p-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Títulos ({row.ticketNumbers.length})
            </p>
            {row.ticketNumbers.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1">
                Nenhum título alocado nessa reserva.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                {row.ticketNumbers.map((n) => (
                  <span
                    key={n}
                    className="inline-flex items-center rounded border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-mono tabular-nums text-primary"
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t">
            <a
              href={`/comprovante/${row.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Abrir comprovante público
            </a>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              Fechar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DetailField({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={cn("text-sm break-words", mono && "font-mono tabular-nums")}
      >
        {value}
      </p>
    </div>
  );
}

// ============ PAGINAÇÃO ============

function Pagination({
  page,
  totalPages,
  totalRows,
  pageSize,
}: {
  page: number;
  totalPages: number;
  totalRows: number;
  pageSize: number;
}) {
  const searchParams = useSearchParams();
  function href(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(p));
    return `?${params.toString()}`;
  }
  const from = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(totalRows, page * pageSize);
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 text-xs text-muted-foreground border-t">
      <span className="tabular-nums">
        {from}–{to} de {totalRows}
      </span>
      <Link
        href={href(Math.max(1, page - 1))}
        aria-disabled={page === 1}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted",
          page === 1 && "pointer-events-none opacity-40",
        )}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <Link
        href={href(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-md border hover:bg-muted",
          page >= totalPages && "pointer-events-none opacity-40",
        )}
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

/**
 * Onde o prêmio devia sair e onde ele saiu.
 *
 * Os dois juntos, e nunca só um. O ponto agendado sozinho é promessa sem
 * conferência; o ponto de saída sozinho é um número sem régua. Lado a lado
 * eles respondem à pergunta que quem administra faz: a saída programada está
 * sendo cumprida?
 *
 * Prêmio sem agendamento mostra só onde saiu, porque ali não havia promessa
 * nenhuma a cumprir. E caixa sorteada antes desta coluna existir fica sem o
 * número em vez de ganhar um inventado.
 */
function SaidaDaCaixa({
  caixa,
  totalNumbers,
}: {
  caixa: CaixaDistribuida;
  totalNumbers: number;
}) {
  const programado = porcentagemDaSaida(
    caixa.programadoEmTitulos ?? null,
    totalNumbers,
  );
  const saiu = porcentagemDaSaida(caixa.vendidosNaSaida ?? null, totalNumbers);

  if (programado == null && saiu == null) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {saiu != null && (
        <Badge
          variant="outline"
          className="border-emerald-500/40 text-[10px] text-emerald-500 tabular-nums"
          title="Quanto da campanha estava vendido quando este prêmio saiu"
        >
          saiu em {formatarPorcentagem(saiu)}
        </Badge>
      )}
      {programado != null && (
        <Badge
          variant="outline"
          className="text-[10px] text-muted-foreground tabular-nums"
          title="Onde este prêmio estava programado para sair"
        >
          previsto {formatarPorcentagem(programado)}
        </Badge>
      )}
    </span>
  );
}

/** Uma casa decimal só abaixo de dez por cento, onde ela muda a leitura. */
function formatarPorcentagem(pct: number): string {
  return `${pct.toFixed(pct < 10 ? 1 : 0).replace(".", ",")}%`;
}
