import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Pencil, Search, UserPlus } from "lucide-react";
import type { Role } from "@prisma/client";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listCustomers } from "@/server/services/customers";
import { ModBadge } from "@/components/rank/mod-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Usuários" };

// Lista de contas por papel.
//
// Existe por dois motivos. O primeiro é que a rota já era usada: "Voltar",
// "Cancelar" e o retorno depois de salvar na edição apontavam para cá, e sem
// página aqui todo caminho terminava em 404, o que fazia a edição parecer
// quebrada mesmo tendo salvado.
//
// O segundo é que Clientes ordena por gasto, e quem é da equipe quase nunca
// compra: procurar um admin lá é procurar no fim da lista.

const ABAS: { chave: string; rotulo: string; roles: Role[] }[] = [
  { chave: "equipe", rotulo: "Equipe", roles: ["SUPER_ADMIN", "ADMIN", "AFFILIATE"] },
  { chave: "clientes", rotulo: "Clientes", roles: ["PARTICIPANT"] },
  { chave: "todos", rotulo: "Todos", roles: [] },
];

const PAPEL: Record<Role, { rotulo: string; classe: string }> = {
  SUPER_ADMIN: { rotulo: "Dono", classe: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
  ADMIN: { rotulo: "Admin", classe: "border-primary/40 bg-primary/10 text-primary" },
  AFFILIATE: { rotulo: "Afiliado", classe: "border-sky-500/40 bg-sky-500/10 text-sky-500" },
  PARTICIPANT: { rotulo: "Cliente", classe: "border-border bg-muted text-muted-foreground" },
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; nome?: string }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;

  const aba = ABAS.find((a) => a.chave === sp.aba) ?? ABAS[0]!;
  const nome = (sp.nome ?? "").trim();

  const { customers } = await listCustomers(tenantId, {
    nome,
    roles: aba.roles,
    sort: "name",
    pageSize: 500,
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            Usuários
          </h1>
          <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link href="/admin" className="hover:text-foreground">
              Admin
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>Usuários</span>
          </nav>
        </div>
        <Link
          href="/admin/usuarios/novo"
          className={buttonVariants({ variant: "default" })}
        >
          <UserPlus className="mr-1.5 h-4 w-4" />
          Nova conta
        </Link>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={`/admin/usuarios?aba=${a.chave}${nome ? `&nome=${encodeURIComponent(nome)}` : ""}`}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                a.chave === aba.chave
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {a.rotulo}
            </Link>
          ))}
        </div>

        {/* Formulário GET puro: a busca vira parâmetro na URL, então o
            resultado é compartilhável e sobrevive ao recarregar. */}
        <form method="GET" className="relative flex-1">
          <input type="hidden" name="aba" value={aba.chave} />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="nome"
            defaultValue={nome}
            placeholder="Buscar por nome"
            className="pl-8"
          />
        </form>
      </div>

      {customers.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {nome ? "Ninguém com esse nome." : "Nenhuma conta neste grupo."}
          </p>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {customers.map((u) => {
            const papel = PAPEL[u.role];
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40"
              >
                {u.showModBadge && (
                  <ModBadge size={30} uid={`mod-${u.id}`} className="shrink-0" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{u.name}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        papel.classe
                      )}
                    >
                      {papel.rotulo}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {[
                      u.email,
                      u.cpf ? formatCpf(u.cpf) : null,
                      u.phone ? formatPhone(u.phone) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "sem contato cadastrado"}
                  </p>
                </div>

                <span className="hidden shrink-0 text-xs text-muted-foreground md:block">
                  {formatDateTime(u.createdAt)}
                </span>

                <Link
                  href={`/admin/usuarios/${u.id}/editar`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Link>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
