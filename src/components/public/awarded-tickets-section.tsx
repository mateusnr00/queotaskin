"use client";

// Seção pública "🏆 Títulos Premiados". Modo padrão (list): card inline
// com lista vertical (uma linha por título) + toggle "Mostrar mais/menos"
// quando tem muitos. Modo modal: vira um botão que abre Dialog com a mesma
// lista. Linha do contemplado ganha highlight emerald sólido.

import { useState } from "react";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const COLLAPSED_VISIBLE = 5;

export interface PublicAwardedTicket {
  number: number;
  prizeDescription: string;
  participantName: string | null;
}

interface Props {
  tickets: PublicAwardedTicket[];
  totalNumbers: number;
  viewMode: "list" | "modal";
}

export function AwardedTicketsSection({
  tickets,
  totalNumbers,
  viewMode,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  if (tickets.length === 0) return null;

  const winnersCount = tickets.filter((t) => t.participantName).length;
  const total = tickets.length;
  // Padding do número segue a quantidade total de cotas: 100 → 099, 99999
  // → 99999, igual SkinsLendarias.
  const padDigits = Math.max(2, String(Math.max(totalNumbers - 1, 0)).length);
  const visible =
    expanded || tickets.length <= COLLAPSED_VISIBLE
      ? tickets
      : tickets.slice(0, COLLAPSED_VISIBLE);
  const canCollapse = tickets.length > COLLAPSED_VISIBLE;

  const list = (
    <ul className="space-y-2">
      {visible.map((t) => {
        const claimed = Boolean(t.participantName);
        const numLabel = String(t.number).padStart(padDigits, "0");
        return (
          <li
            key={t.number}
            aria-label="Premiada"
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-2.5 py-2",
              claimed
                ? "bg-emerald-500/15 border-emerald-500/50"
                : "bg-muted/30 border-transparent"
            )}
          >
            <span
              className={cn(
                "shrink-0 inline-flex h-9 min-w-[68px] items-center justify-center rounded-md px-2 text-sm font-extrabold tabular-nums",
                claimed
                  ? "bg-background text-emerald-700 dark:text-emerald-300"
                  : "bg-muted-foreground/20 text-foreground"
              )}
            >
              {numLabel}
            </span>
            <p
              className={cn(
                "min-w-0 flex-1 text-xs leading-snug line-clamp-2",
                claimed
                  ? "font-medium text-emerald-900 dark:text-emerald-100"
                  : "text-foreground"
              )}
            >
              {t.prizeDescription}
            </p>
            <span
              className={cn(
                "shrink-0 text-[11px] font-semibold whitespace-nowrap text-right max-w-[90px] truncate",
                claimed
                  ? "text-emerald-700 dark:text-emerald-300"
                  : "text-muted-foreground"
              )}
            >
              {claimed ? `${t.participantName} 🏆` : "Disponível"}
            </span>
          </li>
        );
      })}
    </ul>
  );

  const expander = canCollapse && (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
    >
      {expanded ? (
        <>
          <ChevronUp className="h-4 w-4" />
          Mostrar menos
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" />
          Mostrar mais
        </>
      )}
    </button>
  );

  if (viewMode === "modal") {
    return (
      <Dialog>
        <DialogTrigger
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full h-12 justify-between"
          )}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <Trophy className="h-4 w-4 text-amber-500" />
            Títulos Premiados
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {winnersCount}/{total}
          </span>
        </DialogTrigger>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Títulos Premiados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground text-right tabular-nums">
              {winnersCount}/{total} já contemplados
            </div>
            {list}
            {expander}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <Trophy className="h-4 w-4 text-amber-500" />
          Títulos Premiados
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {winnersCount}/{total}
        </span>
      </div>
      {list}
      {expander}
    </div>
  );
}
