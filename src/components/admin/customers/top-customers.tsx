import { MessageCircle } from "lucide-react";

import { RankBadge } from "@/components/rank/rank-badge";
import { formatBRL } from "@/lib/format";
import { formatPhone } from "@/lib/cpf";
import type { Customer } from "@/server/services/customers";
import { whatsappLink } from "@/server/services/customers";
import { rankFromXp } from "@/lib/rank";

/**
 * Pódio dos maiores compradores.
 *
 * Fica no topo porque é a lista que o operador realmente usa: são os clientes
 * que vale a pena chamar no WhatsApp quando entra campanha nova.
 */
export function TopCustomers({ customers }: { customers: Customer[] }) {
  if (customers.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-bold">Maiores compradores</h2>
        <p className="text-xs text-muted-foreground">
          Quem mais gastou no total. Chame direto no WhatsApp.
        </p>
      </div>

      <ol className="divide-y">
        {customers.map((c, i) => {
          const zap = whatsappLink(c.phone);
          const rank = rankFromXp(c.xp);
          return (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="w-5 shrink-0 text-center font-mono text-sm font-bold tabular-nums"
                style={{ color: i < 3 ? rank.color : undefined }}
              >
                {i + 1}
              </span>

              <RankBadge rank={rank} size="sm" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {c.phone ? formatPhone(c.phone) : "sem telefone"}
                  <span className="mx-1.5 text-muted-foreground/40">·</span>
                  {c.tickets.toLocaleString("pt-BR")} números
                </p>
              </div>

              <span className="shrink-0 text-sm font-bold text-emerald-500 tabular-nums">
                {formatBRL(c.spent)}
              </span>

              {zap && (
                <a
                  href={zap}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Conversar com ${c.name}`}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/10"
                >
                  <MessageCircle className="h-4 w-4" />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
