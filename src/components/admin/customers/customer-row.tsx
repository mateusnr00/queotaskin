import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { RankBadge } from "@/components/rank/rank-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBRL, formatDate } from "@/lib/format";
import { formatCpf, formatPhone } from "@/lib/cpf";
import type { Customer } from "@/server/services/customers";
import { whatsappLink } from "@/server/services/customers";

/** Iniciais para o avatar: "Mateus Nascimento" -> "MN". */
function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "?";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

export function CustomerRow({
  customer,
  position,
}: {
  customer: Customer;
  position: number;
}) {
  const zap = whatsappLink(customer.phone);

  return (
    <TableRow className="hover:bg-muted/40">
      <TableCell className="text-center font-mono text-xs text-muted-foreground tabular-nums">
        {position}
      </TableCell>

      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold">
            {iniciais(customer.name)}
          </span>
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Link
                href={`/admin/usuarios/${customer.id}/editar`}
                className="block max-w-44 truncate text-sm font-medium hover:underline"
              >
                {customer.name}
              </Link>
              {customer.role !== "PARTICIPANT" && (
                <span className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary uppercase">
                  {customer.role === "AFFILIATE" ? "afiliado" : "admin"}
                </span>
              )}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              {customer.phone ? formatPhone(customer.phone) : "sem telefone"}
            </span>
          </div>
        </div>
      </TableCell>

      <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
        {customer.cpf ? formatCpf(customer.cpf) : "—"}
      </TableCell>

      <TableCell className="max-w-44 truncate text-xs text-muted-foreground">
        {customer.email ?? "—"}
      </TableCell>

      <TableCell>
        <RankBadge xp={customer.xp} size="sm" />
      </TableCell>

      <TableCell className="text-right text-sm tabular-nums">
        {customer.purchases}
      </TableCell>

      <TableCell className="text-right text-sm tabular-nums">
        {customer.tickets.toLocaleString("pt-BR")}
      </TableCell>

      <TableCell className="text-right text-sm font-bold text-emerald-500 tabular-nums">
        {formatBRL(customer.spent)}
      </TableCell>

      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
        {customer.lastPurchaseAt ? formatDate(customer.lastPurchaseAt) : "—"}
      </TableCell>

      <TableCell className="text-right">
        {zap ? (
          <a
            href={zap}
            target="_blank"
            rel="noopener noreferrer"
            title={`Conversar com ${customer.name} no WhatsApp`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-500 transition-colors hover:bg-emerald-500/10"
          >
            <MessageCircle className="h-4 w-4" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}
