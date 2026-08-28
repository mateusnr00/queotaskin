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
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeftRight,
  Award,
  ChevronLeft,
  ChevronRight,
  Check,
  CreditCard,
  Disc3,
  ExternalLink,
  Eye,
  EyeOff,
  Gift,
  Info,
  Loader2,
  Lock,
  MoreVertical,
  Phone,
  RotateCcw,
  Search,
  Square,
  Unlock,
  Pencil,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import type {
  ReservationStatus,
  SkinRarity,
  SurpriseBoxStatus,
} from "@prisma/client";

import { markReservationPaidAction } from "@/server/actions/reservations";
import {
  getTopBuyersAction,
  type TopBuyer,
} from "@/server/actions/raffle-stats";
import {
  clearRaffleWinnerAction,
  createSurpriseBoxPrizesAction,
  deleteSurpriseBoxAction,
  deleteSurpriseBoxPrizeAction,
  updateSurpriseBoxPrizeAction,
  setRaffleSurpriseBoxCombosAction,
  setRaffleWinnerAction,
  toggleSurpriseBoxPrizeLockAction,
} from "@/server/actions/raffle-content";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CampoDePremio,
  type SkinDoCatalogoSimples,
} from "@/components/admin/campo-de-premio";
import { RARITY_TEXT_VAR } from "@/lib/cs2";
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
}

export interface SurpriseBoxConfig {
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
  /** Quando abriu, ou quando foi criada se ainda está fechada. */
  abertaEm: string;
  premioId: string | null;
  premioTitulo: string | null;
  premio: string | null;
  raridade: SkinRarity | null;
  ganhador: string;
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
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  },
  PAID: {
    label: "Pago",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  },
  EXPIRED: {
    label: "Expirado",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  },
  CANCELLED: {
    label: "Cancelado",
    className: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
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
}: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [caixasOpen, setCaixasOpen] = useState(false);
  const [winnerOpen, setWinnerOpen] = useState(false);

  return (
    <>
      <RaffleHeaderCard
        raffle={raffle}
        showDetails={showDetails}
        onToggleDetails={() => setShowDetails((v) => !v)}
        onOpenRanking={() => setRankingOpen(true)}
        onOpenCaixas={() => setCaixasOpen(true)}
        onOpenWinner={() => setWinnerOpen(true)}
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

      {showDetails && <StatsPanel stats={stats} />}

      <Card className="overflow-hidden p-0">
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
      </Card>
    </>
  );
}

// ============ HEADER ============

function RaffleHeaderCard({
  raffle,
  showDetails,
  onToggleDetails,
  onOpenRanking,
  onOpenCaixas,
  onOpenWinner,
}: {
  raffle: RaffleSummary;
  showDetails: boolean;
  onToggleDetails: () => void;
  onOpenRanking: () => void;
  onOpenCaixas: () => void;
  onOpenWinner: () => void;
}) {
  return (
    <Card className="p-5 md:p-6 space-y-4">
      <div className="flex items-start gap-4">
        <RaffleAvatar imageUrl={raffle.imageUrl} title={raffle.title} />
        <div className="flex-1 min-w-0 space-y-1.5">
          <h2 className="text-lg md:text-xl font-bold tracking-tight text-primary line-clamp-2">
            {raffle.title}
          </h2>
          {raffle.shortDescription && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {raffle.shortDescription}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">
              {raffle.isFree
                ? "GRÁTIS"
                : formatBRL(raffle.pricePerNumber).replace("R$ ", "R$ ")}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {raffle.status}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mais ações"
          className="shrink-0"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </div>

      {/* Ações do header, 6 botões espelhando SkinsLendarias. */}
      <div className="border-t pt-3 flex items-center gap-1 flex-wrap">
        <HeaderActionButton
          label={showDetails ? "Esconder detalhes" : "Mostrar detalhes"}
          onClick={onToggleDetails}
        >
          {showDetails ? (
            <Eye className="h-4 w-4" />
          ) : (
            <EyeOff className="h-4 w-4" />
          )}
        </HeaderActionButton>
        <HeaderActionButton
          label="Visualizar página"
          // Absoluta: este painel roda em admin.<domínio>, e ali o caminho
          // relativo cai de volta no admin em vez de abrir a campanha.
          href={raffle.urlPublica}
          external
        >
          <ExternalLink className="h-4 w-4" />
        </HeaderActionButton>
        <HeaderActionButton
          label="Ranking de compras"
          onClick={onOpenRanking}
        >
          <Trophy className="h-4 w-4" />
        </HeaderActionButton>
        <HeaderActionButton
          label="Caixas surpresas"
          onClick={onOpenCaixas}
        >
          <Gift className="h-4 w-4" />
        </HeaderActionButton>
        <HeaderActionButton
          label={
            raffle.winnerTicketNumber != null
              ? `Ganhador: ${raffle.winnerTicketNumber}`
              : "Definir ganhador"
          }
          onClick={onOpenWinner}
        >
          <Award
            className={cn(
              "h-4 w-4",
              raffle.winnerTicketNumber != null && "text-amber-500"
            )}
          />
        </HeaderActionButton>
        <HeaderActionButton
          label="Roletas premiadas"
          onClick={() => toast.info("Roletas premiadas: em breve")}
        >
          <Disc3 className="h-4 w-4" />
        </HeaderActionButton>
        <HeaderActionButton
          label="Raspadinhas premiadas"
          onClick={() => toast.info("Raspadinhas premiadas: em breve")}
        >
          <CreditCard className="h-4 w-4" />
        </HeaderActionButton>
      </div>
    </Card>
  );
}

function RaffleAvatar({
  imageUrl,
  title,
}: {
  imageUrl: string | null;
  title: string;
}) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={title}
        className="h-20 w-20 md:h-24 md:w-24 rounded-full object-cover ring-1 ring-border shrink-0"
      />
    );
  }
  const initial = title.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="h-20 w-20 md:h-24 md:w-24 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground shrink-0">
      {initial}
    </div>
  );
}

function HeaderActionButton({
  label,
  children,
  onClick,
  href,
  external,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const className =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";
  if (href) {
    return (
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        aria-label={label}
        title={label}
        className={className}
      >
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
    >
      {children}
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
        <DialogHeader>
          <DialogTitle className="inline-flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Top 10 Compradores
          </DialogTitle>
        </DialogHeader>

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
    phoneDigits.length >= 10
      ? `(${phoneDigits.slice(0, 2)}) ****-****`
      : "-";
  const isFirst = buyer.rank === 1;
  return (
    <li className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <span
        className={cn(
          "tabular-nums font-bold shrink-0",
          isFirst ? "text-3xl text-amber-500" : "text-lg text-muted-foreground"
        )}
        style={{ minWidth: isFirst ? "3rem" : "2.5rem" }}
      >
        {buyer.rank}º
      </span>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "font-semibold truncate",
            isFirst ? "text-base" : "text-sm"
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
            href={`https://wa.me/+55${phoneDigits}`}
            target="_blank"
            aria-label="WhatsApp"
            title="WhatsApp"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-emerald-600 hover:bg-emerald-500/10 transition-colors"
          >
            <WhatsAppIcon />
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
        {open && (
          <CaixasModalBody
            raffleId={raffleId}
            initial={initial}
          />
        )}
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
    initial.exibirGanhadores
  );
  const [displayOrder, setDisplayOrder] = useState<SurpriseBoxDisplayOrder>(
    initial.displayOrder
  );
  const prizes = initial.prizes;
  const [combos, setCombos] = useState<ComboDraft[]>(() =>
    initial.combos.map((c) => ({
      key: c.id,
      threshold: String(c.threshold),
      boxCount: String(c.boxCount),
      visible: c.visible,
      highlighted: c.highlighted,
    }))
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
          c.boxCount > 0
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
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5 text-amber-500" />
          Caixas Surpresas ({prizes.length})
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
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
          <span className="text-sm">Ativar Caixas Surpresas</span>
        </label>

        {enabled && (
          <div className="space-y-2 pl-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
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
              <span className="text-sm">Ativar &ldquo;Abrir todas&rdquo;</span>
            </label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
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
                <span className="text-sm">Exibir Ganhadores</span>
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
          </div>
        )}

        {combos.length === 0 && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive dark:text-rose-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Cadastre combos para a distribuição das caixas!</span>
          </div>
        )}

        {prizes.length === 0 && (
          <div
            role="status"
            className="flex items-start gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2.5 text-sm text-sky-700 dark:text-sky-300"
          >
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Nenhuma caixa premiada cadastrada para este produto!</span>
          </div>
        )}

        {/* Filtrar por status + ações primárias */}
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs font-medium">Filtrar por status</Label>
            <Select defaultValue="all" disabled>
              <SelectTrigger className="h-9">
                <SelectValue
                  labels={{
                    all: "Todos",
                    paid: "Pagos",
                    unpaid: "Não pagos",
                  }}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
                <SelectItem value="unpaid">Não pagos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => setDistribOpen(true)}
            >
              Combos
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setInserirOpen(true)}
            >
              Inserir
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => toast.info("Exportar PDF: em breve")}
            >
              PDF
            </Button>
          </div>
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
            disabled={isPending}
          />
        )}

        <TabelaDeCaixas
          caixas={initial.caixas}
          catalogo={initial.catalogo}
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
          : `${result.data?.count} prêmios cadastrados`
      );
      onClose();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-base">Inserir caixa</DialogTitle>
      </DialogHeader>

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
            onValueChange={(v) =>
              v && setModo(v as SurpriseBoxPrizeMode)
            }
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
  disabled,
}: {
  caixas: CaixaDistribuida[];
  catalogo: SkinDoCatalogoSimples[];
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState<CaixaDistribuida | null>(null);
  const [removendo, setRemovendo] = useState<CaixaDistribuida | null>(null);

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
                <td
                  colSpan={7}
                  className="px-3 py-12 text-center text-sm text-muted-foreground"
                >
                  Sem Registros
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
      <DialogHeader>
        <DialogTitle className="text-base">Editar prêmio</DialogTitle>
      </DialogHeader>
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

// Lista compacta dos prêmios cadastrados no pool, agrupada por title +
// prize pra não duplicar visualmente quando o admin cria várias unidades.
// Cada grupo mostra contador (claimed/total) + ações de lock/remove.
function PrizesTable({
  prizes,
  catalogo,
  disabled,
}: {
  prizes: SurpriseBoxPrizeRow[];
  catalogo: SkinDoCatalogoSimples[];
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editando, setEditando] = useState<{
    ids: string[];
    title: string;
    prize: string;
  } | null>(null);

  function toggleLock(prizeId: string) {
    startTransition(async () => {
      const result = await toggleSurpriseBoxPrizeLockAction({ prizeId });
      if (!result.ok) toast.error(result.error);
      else toast.success("Bloqueio atualizado");
    });
  }

  function remove(prizeId: string) {
    startTransition(async () => {
      const result = await deleteSurpriseBoxPrizeAction({ prizeId });
      if (!result.ok) toast.error(result.error);
      else toast.success("Prêmio removido");
    });
  }

  // O que já saiu para alguém não é mais estoque: sai daqui e vive na tabela
  // de caixas distribuídas. Antes ficava nas duas cabeças ao mesmo tempo, com
  // o contador em "1/1", e não dava para distinguir o que ainda pode sair do
  // que já foi entregue.
  const noPool = prizes.filter((p) => !p.claimed);

  // Agrupa por (title|prize|mode|odds) pra mostrar como "X unidades".
  const groups = new Map<
    string,
    {
      title: string;
      prize: string;
      mode: SurpriseBoxPrizeMode;
      odds: number | null;
      ids: { id: string; locked: boolean; claimed: boolean }[];
    }
  >();
  for (const p of noPool) {
    const key = `${p.title} ${p.prize} ${p.mode} ${p.odds ?? "-"}`;
    if (!groups.has(key)) {
      groups.set(key, {
        title: p.title,
        prize: p.prize,
        mode: p.mode,
        odds: p.odds,
        ids: [],
      });
    }
    groups.get(key)!.ids.push({
      id: p.id,
      locked: p.locked,
      claimed: p.claimed,
    });
  }

  return (
    <>
    <div className="rounded-lg border overflow-hidden">
      <div className="px-3 py-2 border-b bg-muted/30 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Prêmios cadastrados ({noPool.length})
      </div>
      <ul className="divide-y">
        {[...groups.values()].map((g) => {
          const total = g.ids.length;
          const locked = g.ids.filter((x) => x.locked).length;
          const operable = g.ids[0];
          const allLocked = locked === total && total > 0;
          return (
            <li
              key={`${g.title}-${g.prize}-${g.mode}-${g.odds ?? ""}`}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">
                    {g.prize}
                  </span>
                  {/* Só o que resta no pool: o contador "sorteados/total"
                      perdeu o sentido quando o sorteado saiu desta lista. */}
                  <Badge variant="outline" className="text-[10px] tabular-nums">
                    {total} {total === 1 ? "unidade" : "unidades"}
                  </Badge>
                  {g.mode === "PERCENT" && g.odds != null && (
                    <Badge variant="outline" className="text-[10px]">
                      {g.odds}%
                    </Badge>
                  )}
                  {allLocked && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Bloqueado
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground truncate">
                  {g.title}
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
                      ids: g.ids.map((x) => x.id),
                      title: g.title,
                      prize: g.prize,
                    })
                  }
                  aria-label="Editar prêmio"
                  title="Editar o nome do prêmio"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                {operable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    disabled={disabled || isPending}
                    onClick={() => toggleLock(operable.id)}
                    aria-label={
                      operable.locked
                        ? "Desbloquear prêmio"
                        : "Bloquear prêmio"
                    }
                    title={
                      operable.locked
                        ? "Desbloquear prêmio"
                        : "Bloquear prêmio"
                    }
                  >
                    {operable.locked ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Unlock className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {operable && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    disabled={disabled || isPending}
                    onClick={() => remove(operable.id)}
                    aria-label="Remover prêmio"
                    title="Remover 1 unidade desse prêmio"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
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
    </>
  );
}

// Sub-modal "Distribuição das Caixas", espelha o print do SkinsLendarias.
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
      r.key === key ? { ...r, visible: value } : r
    );
    setDraft(next);
    commit(next, accum);
  }

  function toggleHighlighted(key: string, value: boolean) {
    const next = draft.map((r) =>
      r.key === key ? { ...r, highlighted: value } : r
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

      <DialogHeader>
        <DialogTitle className="text-lg">Distribuição das Caixas</DialogTitle>
      </DialogHeader>

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
    alreadySet ? String(raffle.winnerTicketNumber) : ""
  );
  const [note, setNote] = useState(raffle.winnerNote ?? "");
  const [finish, setFinish] = useState(true);
  const [isPending, startTransition] = useTransition();

  function save() {
    const n = Number(ticketNumber);
    if (!Number.isFinite(n) || n < 1 || n > raffle.totalNumbers) {
      toast.error(`Número deve estar entre 1 e ${raffle.totalNumbers}`);
      return;
    }
    if (alreadySet && raffle.winnerTicketNumber !== n) {
      if (
        !confirm(
          `Substituir o ganhador ${raffle.winnerTicketNumber} pelo ${n}?`
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
          `Ganhador: ${w.participantName} (título ${w.ticketNumber})`
        );
      } else {
        toast.warning(
          `Número ${w.ticketNumber} salvo, mas não achamos o comprador (talvez ninguém tenha comprado esse título).`
        );
      }
      router.refresh();
      onClose();
    });
  }

  function clearWinner() {
    if (
      !confirm(
        "Remover o ganhador registrado? A rifa volta pro estado ACTIVE."
      )
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
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Award className="h-5 w-5 text-amber-500" />
          {alreadySet ? "Ganhador do sorteio" : "Definir ganhador"}
        </DialogTitle>
      </DialogHeader>

      <div className="space-y-4">
        {alreadySet && raffle.winnerDrawnAt && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-900 dark:text-amber-100 flex items-start gap-2">
            <Award className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-semibold">
                Ganhador registrado: título{" "}
                <span className="tabular-nums">
                  {raffle.winnerTicketNumber}
                </span>
              </p>
              <p className="mt-0.5">
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
            placeholder="Ex: 70"
            disabled={isPending}
            className="text-lg font-mono tabular-nums"
          />
          <p className="text-[11px] text-muted-foreground">
            Intervalo da rifa: 1 a {raffle.totalNumbers.toLocaleString("pt-BR")}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="winner-note" className="text-xs font-medium">
            Nota / comprovação (opcional)
          </Label>
          <textarea
            id="winner-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: Resultado da Loteria Federal do dia 15/08/2026, extração 5842. Link do vídeo do sorteio, hash do bloco usado como semente, etc."
            disabled={isPending}
            maxLength={2000}
            rows={4}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-[11px] text-muted-foreground">
            Aparece publicamente pra dar transparência de como o número foi
            escolhido.
          </p>
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <Checkbox
            checked={finish}
            disabled={isPending}
            onCheckedChange={(v) => setFinish(v === true)}
          />
          <span className="text-sm">Encerrar o sorteio (status FINISHED)</span>
        </label>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t">
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
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={isPending}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {alreadySet ? "Atualizar" : "Registrar ganhador"}
          </Button>
        </div>
      </div>
    </>
  );
}

// ============ STATS PANEL ============

function StatsPanel({ stats }: { stats: Stats }) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-amber-500/15 text-amber-900 dark:text-amber-100 px-4 py-3 text-center text-sm font-bold tabular-nums">
        {stats.soldPercent.toFixed(2)}%
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <StatPill
          label="Livres"
          value={stats.livres}
          accent="border-foreground/20"
          numClass=""
        />
        <StatPill
          label="Reservados"
          value={stats.reservados}
          accent="border-amber-500/50 text-amber-700 dark:text-amber-300"
          numClass="text-amber-700 dark:text-amber-300"
        />
        <StatPill
          label="Pagos"
          value={stats.pagos}
          accent="border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
          numClass="text-emerald-700 dark:text-emerald-300"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <TotalCard
          icon={
            <span className="inline-flex h-12 w-12 rounded-full ring-2 ring-emerald-500/50 items-center justify-center text-emerald-600 dark:text-emerald-300">
              <Check className="h-6 w-6" />
            </span>
          }
          title="Pagos"
          subtitle={
            stats.pagos === 0
              ? "nenhuma compra"
              : `${stats.pagos} ${stats.pagos === 1 ? "compra" : "compras"}`
          }
          total={stats.paidTotal}
          colorClass="text-emerald-600 dark:text-emerald-300"
        />
        <TotalCard
          icon={
            <span className="inline-flex h-12 w-12 rounded-full ring-2 ring-amber-500/50 items-center justify-center text-amber-600 dark:text-amber-300">
              <Square className="h-6 w-6" />
            </span>
          }
          title="Reservados"
          subtitle={
            stats.reservados === 0
              ? "nenhuma compra"
              : `${stats.reservados} ${stats.reservados === 1 ? "compra" : "compras"}`
          }
          total={stats.pendingTotal}
          colorClass="text-amber-600 dark:text-amber-300"
        />
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  accent,
  numClass,
}: {
  label: string;
  value: number;
  accent: string;
  numClass: string;
}) {
  return (
    <div className={cn("rounded-lg border bg-card px-4 py-3 text-center", accent)}>
      <div className={cn("text-sm font-bold tabular-nums", numClass)}>
        {value.toLocaleString("pt-BR")} {label}
      </div>
    </div>
  );
}

function TotalCard({
  icon,
  title,
  subtitle,
  total,
  colorClass,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  total: number;
  colorClass: string;
}) {
  return (
    <Card className="p-4 flex items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold tracking-tight">{title}</div>
        <div className={cn("text-xs", colorClass)}>{subtitle}</div>
        <div className={cn("mt-0.5 text-sm font-bold tabular-nums", colorClass)}>
          {formatBRL(total)}
        </div>
      </div>
    </Card>
  );
}

// ============ TABS ============

function TabsBar({ tab, counts }: { tab: Filters["tab"]; counts: Counts }) {
  const searchParams = useSearchParams();
  return (
    <div className="flex overflow-x-auto border-b">
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
              "shrink-0 px-4 py-3 text-xs font-medium border-b-2 -mb-px transition-colors flex items-center gap-2",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white tabular-nums",
                t.dotClass
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
    <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto] p-4 border-b">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Nome"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          className="pl-9"
        />
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Título"
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
        <Button type="button" onClick={submit}>
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
      <div className="p-12 text-center text-sm text-muted-foreground">
        Nenhuma compra encontrada com os filtros atuais.
      </div>
    );
  }
  return (
    <ul className="divide-y">
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
    <li className="px-4 py-3 flex flex-col md:flex-row md:items-center gap-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <div className="h-10 w-10 rounded-full bg-sky-500 text-white flex items-center justify-center font-bold shrink-0">
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

      <div className="md:text-right md:min-w-[110px]">
        <div className="text-xs text-muted-foreground tabular-nums line-through">
          {row.ticketsCount}×{formatBRL(row.unitPrice)}
        </div>
        <div className="text-sm font-bold text-primary tabular-nums">
          {formatBRL(row.totalAmount)}
        </div>
      </div>

      <div className="md:min-w-[180px] md:text-center">
        <span
          className={cn(
            "inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-semibold",
            badge.className
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
      `Pague aqui: ${typeof window !== "undefined" ? window.location.origin : ""}/comprovante/${row.id}`
  );
  const waHref = row.participantPhone
    ? `https://wa.me/+55${row.participantPhone.replace(/\D/g, "")}?text=${waMessage}`
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
          <WhatsAppIcon />
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
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Info className="h-5 w-5 text-primary" />
            Detalhes da reserva
          </DialogTitle>
        </DialogHeader>

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
                  () => toast.error("Falha ao copiar")
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
                    badge.className
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

function WhatsAppIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden
    >
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01ZM12.04 20.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c.02 4.54-3.68 8.23-8.22 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43s.17-.25.25-.41c.08-.17.04-.31-.02-.43s-.56-1.34-.76-1.84c-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07s.89 2.4 1.01 2.56c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18s-.22-.16-.47-.28Z" />
    </svg>
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
          page === 1 && "pointer-events-none opacity-40"
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
          page >= totalPages && "pointer-events-none opacity-40"
        )}
        aria-label="Próxima página"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

