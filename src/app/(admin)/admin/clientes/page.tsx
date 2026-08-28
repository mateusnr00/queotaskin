import Link from "next/link";
import type { Metadata } from "next";
import {
  ChevronRight,
  Download,
  Repeat,
  TrendingUp,
  UserPlus,
  SearchX,
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
    busca?: string;
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
    busca: (sp.busca ?? "").trim(),
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
    if (filtros.busca) params.set("busca", filtros.busca);
    if (filtros.nome) params.set("nome", filtros.nome);
    if (filtros.cpf) params.set("cpf", filtros.cpf);
    if (filtros.email) params.set("email", filtros.email);
    if (filtros.telefone) params.set("telefone", filtros.telefone);
    if (filtros.sort !== "spent") params.set("sort", filtros.sort);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/clientes?${qs}` : "/admin/clientes";
  }

  const temFiltro = Boolean(
    filtros.busca ||
      filtros.nome ||
      filtros.cpf ||
      filtros.email ||
      filtros.telefone,
  );

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
        <div className="flex flex-wrap gap-2">
          {/* Os filtros da tela vão junto: filtrar e exportar entrega
              exatamente o que está à vista, e não uma lista diferente da que
              a pessoa acabou de montar. */}
          <Link
            href={`/admin/clientes/exportar?${new URLSearchParams(
              Object.entries(filtros).filter(([, v]) => v)
            ).toString()}`}
            prefetch={false}
            className={buttonVariants({ variant: "outline" })}
          >
            <Download className="mr-1.5 h-4 w-4" />
            Exportar CSV
          </Link>
          {/* A criação mora aqui porque é desta lista que a necessidade
              nasce: alguém liga pedindo cadastro, ou entra gente nova. */}
          <Link
            href="/admin/usuarios/novo"
            className={buttonVariants({ variant: "default" })}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Nova conta
          </Link>
        </div>
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
        {/* Ticket médio em cor neutra. Ele e a receita total ficam lado a
            lado e, numa operação nova, são o mesmo número: dois valores
            idênticos, verdes e do mesmo tamanho, lêem-se como repetição. O
            verde fica só na receita, que é o dado que a cor promete. */}
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
          // Cor de destaque só quando existe recorrência. Com 0%, o laranja
          // dizia "olha que bom" no pior valor possível da métrica.
          accent={taxaRecorrencia > 0 ? "growth" : "default"}
        />
      </div>

      <div className="space-y-4">
          <CustomersFilters filtros={filtros} />

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {/* Duas colunas saíram. O "#" numerava a linha na página
                      atual e reiniciava na seguinte, então o 1 da página 2
                      não queria dizer nada; e o e-mail vinha vazio em 9 de 10
                      linhas, porque cliente entra por nome e CPF. Os dois
                      juntos gastavam 203px dos 1136 da tabela. O e-mail, que
                      existe para a equipe, foi para baixo do nome. */}
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Patente</TableHead>
                    <TableHead className="text-right">Pedidos</TableHead>
                    <TableHead className="text-right">Números</TableHead>
                    <TableHead className="text-right">Gasto</TableHead>
                    <TableHead>Última compra</TableHead>
                    <TableHead className="w-24 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-14">
                        {/* Estado vazio com saída, e não só a frase que
                            estava aqui. A regra de UX é essa: dizer o que
                            houve e oferecer o que fazer. E os dois casos são
                            diferentes, busca sem resultado e base vazia
                            pedem coisas opostas. */}
                        <div className="mx-auto max-w-sm space-y-3 text-center">
                          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <SearchX className="h-5 w-5" />
                          </span>
                          {temFiltro ? (
                            <>
                              <p className="text-sm font-semibold">
                                Nenhum cliente com esses filtros
                              </p>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                A busca aceita nome, CPF, telefone ou e-mail.
                                Números procuram no CPF e no telefone ao mesmo
                                tempo.
                              </p>
                              <Link
                                href="/admin/clientes"
                                className={buttonVariants({
                                  variant: "outline",
                                  size: "sm",
                                })}
                              >
                                Limpar a busca
                              </Link>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold">
                                Nenhum cliente ainda
                              </p>
                              <p className="text-xs leading-relaxed text-muted-foreground">
                                Quem criar conta no site aparece aqui, mesmo
                                antes da primeira compra.
                              </p>
                              <Link
                                href="/admin/usuarios/novo"
                                className={buttonVariants({ size: "sm" })}
                              >
                                <UserPlus className="mr-1.5 h-4 w-4" />
                                Cadastrar manualmente
                              </Link>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c) => <CustomerRow key={c.id} customer={c} />)
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
