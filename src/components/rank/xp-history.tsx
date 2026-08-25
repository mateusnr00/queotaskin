import type { XpReason } from "@prisma/client";

import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<XpReason, string> = {
  PURCHASE: "Compra",
  REFUND: "Estorno",
  ADMIN_ADJUST: "Ajuste",
  BONUS: "Bônus",
};

export interface XpHistoryRow {
  id: string;
  amount: number;
  reason: XpReason;
  description: string | null;
  createdAt: Date;
}

/** Extrato de XP — responde "de onde veio meu XP" sem precisar do suporte. */
export function XpHistory({ entries }: { entries: XpHistoryRow[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhum XP ainda. Seu primeiro número pago já começa a pontuar.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {entry.description ?? REASON_LABEL[entry.reason]}
            </p>
            <p className="text-xs text-muted-foreground">
              {REASON_LABEL[entry.reason]} · {formatDateTime(entry.createdAt)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 text-sm font-bold tabular-nums",
              entry.amount >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            {entry.amount >= 0 ? "+" : ""}
            {entry.amount.toLocaleString("pt-BR")} XP
          </span>
        </li>
      ))}
    </ul>
  );
}
