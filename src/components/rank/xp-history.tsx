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

/** Extrato de XP — responde "de onde veio meu XP" sem passar pelo suporte. */
export function XpHistory({ entries }: { entries: XpHistoryRow[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-[#232730] px-4 py-6 text-center text-xs text-muted-foreground">
        Nenhum XP ainda. Seu primeiro número pago já começa a pontuar.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[#232730] overflow-hidden rounded-md border border-[#232730]">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {entry.description ?? REASON_LABEL[entry.reason]}
            </p>
            <p className="font-mono text-[10.5px] text-muted-foreground">
              {REASON_LABEL[entry.reason]} · {formatDateTime(entry.createdAt)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 font-mono text-xs font-bold tabular-nums",
              entry.amount >= 0 ? "text-emerald-400" : "text-destructive",
            )}
          >
            {entry.amount >= 0 ? "+" : ""}
            {entry.amount.toLocaleString("pt-BR")}
          </span>
        </li>
      ))}
    </ul>
  );
}
