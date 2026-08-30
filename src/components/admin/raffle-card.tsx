"use client";

// Card de sorteio na listagem admin, inspirado no Sorteamos:
// thumb + título + datas, status select, barra de ícones de ação e ring de %.
// Todos os toggles são client-side (server action via useTransition + toast).

import Link from "next/link";
import { Moldura } from "@/components/ui/moldura";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Radio,
  Copy,
  CopyPlus,
  ExternalLink,
  Loader2,
  Pencil,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  Crown,
  Star,
  TicketCheck,
  Link2,
} from "lucide-react";

import {
  definirCampanhaPrincipalAction,
  moverCampanhaAction,
  updateRaffleHighlightAction,
  updateRaffleStatusAction,
} from "@/server/actions/raffles";
import { duplicarSorteioAction } from "@/server/actions/raffle-duplicate";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES = [
  { value: "DRAFT", label: "Rascunho" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "FINISHED", label: "Encerrado" },
  { value: "CANCELLED", label: "Cancelado" },
] as const;

const STATUS_LABELS = Object.fromEntries(
  STATUSES.map((s) => [s.value, s.label]),
);

export interface RaffleCardData {
  id: string;
  title: string;
  slug: string;
  coverUrl: string | null;
  status: "DRAFT" | "ACTIVE" | "FINISHED" | "CANCELLED";
  drawDate: string | null; // ISO string
  createdAt: string; // ISO string
  showOnHome: boolean;
  /** A campanha principal do site: o card grande no topo da vitrine. */
  principal: boolean;
  totalNumbers: number;
  soldTickets: number; // count de tickets pagos (= compras)
}

export function RaffleCard({
  raffle,
  publicUrl,
}: {
  raffle: RaffleCardData;
  publicUrl: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [highlight, setHighlight] = useState(raffle.showOnHome);
  const [principal, setPrincipal] = useState(raffle.principal);
  const [status, setStatus] = useState(raffle.status);
  const [duplicando, setDuplicando] = useState(false);

  async function duplicar() {
    setDuplicando(true);
    try {
      const resultado = await duplicarSorteioAction(raffle.id);
      if (!resultado.ok) {
        toast.error(resultado.error);
        return;
      }
      toast.success("Sorteio duplicado. A cópia entrou como rascunho.");
      // Abre a cópia direto na edição: quem duplica quer mexer nela, e ela
      // está fora do ar até ser publicada.
      router.push(`/admin/sorteios/${resultado.data.id}/editar`);
    } finally {
      setDuplicando(false);
    }
  }
  const soldPct = Math.min(
    100,
    raffle.totalNumbers > 0
      ? Math.round((raffle.soldTickets / raffle.totalNumbers) * 100)
      : 0,
  );

  function alternarPrincipal() {
    const proximo = !principal;
    setPrincipal(proximo); // otimista
    startTransition(async () => {
      // Server Action lança quando a rede cai, e o `if (!ok)` nunca rodaria:
      // sem o try o selo ficaria aceso na tela e apagado no banco.
      try {
        const r = await definirCampanhaPrincipalAction({ raffleId: raffle.id });
        if (!r.ok) {
          setPrincipal(!proximo);
          toast.error(r.error);
          return;
        }
        toast.success(
          proximo
            ? "Agora é a campanha principal do site"
            : "Deixou de ser a campanha principal",
        );
        router.refresh();
      } catch {
        setPrincipal(!proximo);
        toast.error("Não foi possível salvar. Tente de novo.");
      }
    });
  }

  function mover(direcao: "cima" | "baixo") {
    startTransition(async () => {
      try {
        const r = await moverCampanhaAction({ raffleId: raffle.id, direcao });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        router.refresh();
      } catch {
        toast.error("Não foi possível mover. Tente de novo.");
      }
    });
  }

  function toggleHighlight() {
    const next = !highlight;
    setHighlight(next); // otimista
    startTransition(async () => {
      const result = await updateRaffleHighlightAction({
        id: raffle.id,
        showOnHome: next,
      });
      if (!result.ok) {
        setHighlight(!next);
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Destacado na home" : "Removido dos destaques");
    });
  }

  function changeStatus(value: string | null) {
    if (!value || value === status) return;
    const prev = status;
    setStatus(value as typeof status);
    startTransition(async () => {
      const result = await updateRaffleStatusAction({
        id: raffle.id,
        status: value,
      });
      if (!result.ok) {
        setStatus(prev);
        toast.error(result.error);
        return;
      }
      toast.success("Status atualizado");
    });
  }

  function copyLink() {
    navigator.clipboard.writeText(publicUrl).then(
      () => toast.success("Link copiado"),
      () => toast.error("Falha ao copiar link"),
    );
  }

  return (
    <Moldura>
      <div className="p-4 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.02]">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Thumb + info */}
          <div className="flex gap-3 min-w-0 flex-1">
            <div className="relative h-16 w-16 sm:h-20 sm:w-20 shrink-0 rounded-lg overflow-hidden bg-muted ring-1 ring-border">
              {raffle.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={raffle.coverUrl}
                  alt={raffle.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  <TicketCheck className="h-7 w-7 opacity-40" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm leading-snug line-clamp-2">
                {raffle.title}
              </p>
              <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                <div>
                  Sorteio:{" "}
                  {raffle.drawDate ? formatDateTime(raffle.drawDate) : "-"}
                </div>
                <div>Cadastro: {formatDate(raffle.createdAt)}</div>
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center">
            <Select
              value={status}
              onValueChange={changeStatus}
              disabled={isPending}
            >
              <SelectTrigger className="w-full lg:w-36 h-9">
                <SelectValue labels={STATUS_LABELS} />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-1 flex-wrap">
            {/* Subir e descer no lugar de arrastar: a lista é paginada e o
              painel é usado no telefone, onde arrastar item de lista disputa
              com a rolagem da página. Dois botões resolvem o mesmo e
              funcionam pelo teclado. */}
            <IconAction
              label="Subir na vitrine"
              onClick={() => mover("cima")}
              disabled={isPending}
            >
              <ChevronUp className="h-4 w-4" />
            </IconAction>
            <IconAction
              label="Descer na vitrine"
              onClick={() => mover("baixo")}
              disabled={isPending}
            >
              <ChevronDown className="h-4 w-4" />
            </IconAction>

            {/* A principal é uma só no site inteiro, então o ícone é diferente
              do destaque na home: coroa é "a maior", estrela é "aparece lá". */}
            <IconAction
              label={
                principal
                  ? "Deixar de ser a principal"
                  : "Tornar a campanha principal do site"
              }
              onClick={alternarPrincipal}
              active={principal}
              disabled={isPending}
            >
              <Crown
                className={cn(
                  "h-4 w-4",
                  principal && "fill-primary text-primary",
                )}
              />
            </IconAction>

            <IconAction
              label={highlight ? "Remover destaque" : "Destacar na home"}
              onClick={toggleHighlight}
              active={highlight}
            >
              <Star
                className={cn(
                  "h-4 w-4",
                  highlight && "fill-primary text-primary",
                )}
              />
            </IconAction>

            <IconAction label="Copiar link" onClick={copyLink}>
              <Copy className="h-4 w-4" />
            </IconAction>

            <IconLink
              href={`/admin/sorteios/${raffle.id}/editar`}
              label="Editar"
            >
              <Pencil className="h-4 w-4" />
            </IconLink>

            <IconAction
              label="Duplicar sorteio"
              onClick={duplicar}
              disabled={duplicando}
            >
              {duplicando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CopyPlus className="h-4 w-4" />
              )}
            </IconAction>

            <IconLink href={publicUrl} label="Visualizar página" external>
              <ExternalLink className="h-4 w-4" />
            </IconLink>

            <IconLink
              href={`/admin/sorteios/${raffle.id}/campanha`}
              label="Links de campanha"
            >
              <Link2 className="h-4 w-4" />
            </IconLink>

            <IconLink
              href={`/admin/sorteios/${raffle.id}/sorteio`}
              label="Sorteio ao vivo"
            >
              <Radio className="h-4 w-4" />
            </IconLink>

            <IconLink
              href={`/admin/sorteios/${raffle.id}/compras`}
              label="Ver compras"
              accent
            >
              <ShoppingCart className="h-4 w-4" />
            </IconLink>
          </div>

          {/* Ring de % vendido */}
          <div className="flex items-center justify-end lg:justify-center lg:w-20 shrink-0">
            <CircularProgress percent={soldPct} />
          </div>
        </div>
      </div>
    </Moldura>
  );
}

function IconAction({
  label,
  onClick,
  active,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "h-9 w-9 text-muted-foreground hover:text-foreground",
        active && "text-primary hover:text-primary",
      )}
    >
      {children}
    </Button>
  );
}

function IconLink({
  href,
  label,
  external,
  accent,
  children,
}: {
  href: string;
  label: string;
  external?: boolean;
  accent?: boolean;
  children: React.ReactNode;
}) {
  const className = cn(
    "h-9 w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors",
    accent && "text-primary hover:text-primary hover:bg-primary/10",
  );
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={label}
        aria-label={label}
        className={className}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} title={label} aria-label={label} className={className}>
      {children}
    </Link>
  );
}

function CircularProgress({ percent }: { percent: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <div className="relative h-12 w-12" aria-label={`Compras ${percent}%`}>
      <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90" aria-hidden>
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth="3.5"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums">
        {percent}%
      </div>
    </div>
  );
}
