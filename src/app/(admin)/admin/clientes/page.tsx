import Link from "next/link";
import type { Metadata } from "next";
import {
  ChevronRight,
  Repeat,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listCustomers, type CustomerSort } from "@/server/services/customers";
import { StatCard } from "@/components/admin/customers/stat-card";
import { CustomersFilters } from "@/components/admin/customers/customers-filters";
import { CustomerRow } from "@/components/admin/customers/customer-row";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBRL } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

const ORDENACOES_VALIDAS: CustomerSort[] = ["spent", "recent", "purchases", "name"];

export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    nome?: string;
    cpf?: string;
    email?: string;
    telefone?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;

  const filtros = {
    nome: (sp.nome ?? "").trim(),
    cpf: (sp.cpf ?? "").trim(),
    email: (sp.email ?? "").trim(),
    telefone: (sp.telefone ?? "").trim(),
    sort: ORDENACOES_VALIDAS.includes(sp.sort as CustomerSort)
      ? (sp.sort as CustomerSort)
      : ("spent" as CustomerSort),
  };
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const { customers, total, pages, page: paginaAtual, totals } =
    await listCustomers(tenantId, { ...filtros, page });


  function href(p: number) {
    const params = new URLSearchParams();
    if (filtros.nome) params.set("nome", filtros.nome);
    if (filtros.cpf) params.set("cpf", filtros.cpf);
    if (filtros.email) params.set("email", filtros.email);
    if (filtros.telefone) params.set("telefone", filtros.telefone);
    if (filtros.sort !== "spent") params.set("sort", filtros.sort);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/clientes?${qs}` : "/admin/clientes";
  }

  const taxaRecorrencia =
    totals.clientes > 0
      ? Math.round((totals.recorrentes / totals.clientes) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Clientes
          </h1>
          <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Clientes</span>
          </nav>
        </div>
        {/* A criação mora aqui porque é desta lista que a necessidade nasce:
            alguém liga pedindo cadastro, ou entra gente nova na equipe. */}
        <Link
          href="/admin/usuarios/novo"
          className={buttonVariants({ variant: "default" })}
        >
          <UserPlus className="mr-1.5 h-4 w-4" />
          Nova conta
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Clientes pagantes"
          value={totals.clientes.toLocaleString("pt-BR")}
          hint={`${totals.novos30d} novos em 30 dias`}
        />
        <StatCard
          icon={Wallet}
          label="Receita total"
          value={formatBRL(totals.receita)}
          accent="money"
        />
        <StatCard
          icon={TrendingUp}
          label="Ticket médio"
          value={formatBRL(totals.ticketMedio)}
          hint="por compra paga"
        />
        <StatCard
          icon={Repeat}
          label="Compraram mais de uma vez"
          value={`${taxaRecorrencia}%`}
          hint={`${totals.recorrentes} de ${totals.clientes}`}
          accent="growth"
        />
      </div>

      <div className="space-y-4">
          <CustomersFilters filtros={filtros} />

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 text-center">#</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>E-mail</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Números</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead>Última compra</TableHead>
                    <TableHead className="w-12 text-right">Zap</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={10}
                        className="py-12 text-center text-sm text-muted-foreground"
                      >
                        Nenhum cliente encontrado com esses filtros.
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c, i) => (
                      <CustomerRow
                        key={c.id}
                        customer={c}
                        position={(paginaAtual - 1) * 25 + i + 1}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {total.toLocaleString("pt-BR")} cliente(s) · página {paginaAtual} de{" "}
                {pages}
              </span>
              <div className="flex gap-2">
                <Link
                  href={href(paginaAtual - 1)}
                  aria-disabled={paginaAtual <= 1}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm hover:bg-muted",
                    paginaAtual <= 1 && "pointer-events-none opacity-40",
                  )}
                >
                  Anterior
                </Link>
                <Link
                  href={href(paginaAtual + 1)}
                  aria-disabled={paginaAtual >= pages}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm hover:bg-muted",
                    paginaAtual >= pages && "pointer-events-none opacity-40",
                  )}
                >
                  Próxima
                </Link>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}
