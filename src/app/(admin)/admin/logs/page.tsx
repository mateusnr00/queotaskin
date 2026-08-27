import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listarLogs } from "@/server/services/activity-log-query";
import { ACOES, type TipoDeAlvo } from "@/lib/activity-log-actions";
import { ListaDeLogs } from "@/components/admin/logs/lista-de-logs";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Registro de atividade" };

// Histórico do que aconteceu no painel.
//
// O escopo vem de getActiveTenantIdForAdmin, nunca de parâmetro na URL: quem
// decide qual painel a pessoa enxerga é a sessão dela, e aceitar isso da
// querystring seria abrir a leitura de um painel pelo outro.
//
// SUPER_ADMIN vê todos, e é o único caso em que o filtro de tenant sai.

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    acao?: string;
    ator?: string;
    alvoTipo?: string;
    alvoId?: string;
    de?: string;
    ate?: string;
    cursor?: string;
  }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;

  const souDono = session.user.role === "SUPER_ADMIN";

  // Tipo de alvo conferido contra a lista fechada, não convertido na marra.
  // O valor vem da URL, e um cast aqui deixaria qualquer string virar filtro,
  // com o TypeScript dizendo que está tudo bem.
  const TIPOS: TipoDeAlvo[] = [
    "User",
    "Raffle",
    "Reservation",
    "Payment",
    "SkinTemplate",
    "Tenant",
  ];
  const tipoDeAlvo = TIPOS.find((t) => t === sp.alvoTipo);

  // O cursor viaja na URL como "<iso>|<id>". Data sozinha pularia registros
  // do mesmo instante, por isso o id vai junto.
  const cursor = (() => {
    if (!sp.cursor) return undefined;
    const [iso, id] = sp.cursor.split("|");
    if (!iso || !id) return undefined;
    const criadoEm = new Date(iso);
    return Number.isNaN(criadoEm.getTime()) ? undefined : { criadoEm, id };
  })();

  const { registros, proximo } = await listarLogs({
    tenantId: souDono ? null : tenantId,
    acao: sp.acao || undefined,
    actorId: sp.ator || undefined,
    alvo:
      tipoDeAlvo && sp.alvoId ? { tipo: tipoDeAlvo, id: sp.alvoId } : undefined,
    de: sp.de ? new Date(sp.de) : undefined,
    ate: sp.ate ? new Date(sp.ate) : undefined,
    cursor,
  });

  const paramsBase = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v && k !== "cursor") paramsBase.set(k, v);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Registro de atividade
        </h1>
        <nav className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/admin" className="hover:text-foreground">
            Admin
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>Registro</span>
        </nav>
      </header>

      {/* Formulário GET puro, como a busca de Usuários: o resultado vira URL,
          sobrevive ao recarregar e dá para mandar pra outra pessoa. */}
      <form method="GET" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Ação
          <select
            name="acao"
            defaultValue={sp.acao ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          >
            <option value="">todas</option>
            {Object.entries(ACOES).map(([chave, texto]) => (
              <option key={chave} value={chave}>
                {texto}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          De
          <input
            type="date"
            name="de"
            defaultValue={sp.de ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={sp.ate ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        {/* O filtro por pessoa entra pela URL, clicando no nome numa linha.
            Repetir aqui como campo de texto pediria um cuid decorado, então o
            que a tela oferece é o caminho de volta. */}
        {sp.ator && <input type="hidden" name="ator" value={sp.ator} />}
        {sp.alvoTipo && <input type="hidden" name="alvoTipo" value={sp.alvoTipo} />}
        {sp.alvoId && <input type="hidden" name="alvoId" value={sp.alvoId} />}

        <button className={buttonVariants({ variant: "outline", size: "sm" })}>
          Filtrar
        </button>

        {(sp.ator || sp.alvoId) && (
          <Link
            href="/admin/logs"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Limpar recorte
          </Link>
        )}
      </form>

      <Card className="overflow-hidden p-0">
        <ListaDeLogs
          registros={registros.map((r) => ({
            id: r.id,
            criadoEm: r.criadoEm,
            origem: r.origem,
            actorId: r.actorId,
            actorName: r.actorName,
            actorRole: r.actorRole,
            acao: r.acao,
            alvoTipo: r.alvoTipo,
            alvoId: r.alvoId,
            alvoRotulo: r.alvoRotulo,
            detalhes: r.detalhes,
          }))}
        />
      </Card>

      {proximo && (
        <Link
          href={`/admin/logs?${paramsBase.toString()}${paramsBase.toString() ? "&" : ""}cursor=${encodeURIComponent(
            `${proximo.criadoEm.toISOString()}|${proximo.id}`
          )}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Carregar mais
        </Link>
      )}
    </div>
  );
}
