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

// O Next entrega array quando o mesmo parâmetro vem repetido na URL. Fica
// com o primeiro: é o que o formulário produz, e passar array adiante faria
// o Prisma recusar a consulta e a página responder 500.
function umValor(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// O <input type="date"> manda "2026-08-26", e new Date() disso é meia-noite
// em UTC: com o `lte` da consulta, "até 26/08" terminava ANTES do dia 26
// começar, e um intervalo de um dia só devolvia nada. Montar com a hora
// explícita faz o fim do dia ser o fim do dia. Mesmo tratamento que
// /admin/relatorios já usa, e a data inválida vira undefined em vez de
// chegar no Prisma e derrubar a página.
function inicioDoDia(dia: string): Date | undefined {
  const d = new Date(`${dia}T00:00:00`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function fimDoDia(dia: string): Date | undefined {
  const d = new Date(`${dia}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

// Os tipos são nomes de tabela; no filtro eles aparecem em português, porque
// quem opera o painel não conhece o schema do Prisma.
const NOME_DO_TIPO: Record<TipoDeAlvo, string> = {
  User: "pessoa",
  Raffle: "sorteio",
  Reservation: "reserva",
  Payment: "pagamento",
  SkinTemplate: "skin do catálogo",
  Tenant: "painel",
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const sp = await searchParams;

  const souDono = session.user.role === "SUPER_ADMIN";

  const acao = umValor(sp.acao);
  const ator = umValor(sp.ator);
  const de = umValor(sp.de);
  const ate = umValor(sp.ate);
  const cursorParam = umValor(sp.cursor);

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
  const tipoDeAlvo = TIPOS.find((t) => t === umValor(sp.alvoTipo));

  // Sem tipo válido não há recorte: descartar só o tipo e manter o alvoId na
  // tela acenderia o aviso de recorte sobre uma lista que não está recortada.
  const alvoId = tipoDeAlvo ? umValor(sp.alvoId) : undefined;

  // O cursor viaja na URL como "<iso>|<id>". Data sozinha pularia registros
  // do mesmo instante, por isso o id vai junto.
  const cursor = (() => {
    if (!cursorParam) return undefined;
    const [iso, id] = cursorParam.split("|");
    if (!iso || !id) return undefined;
    const criadoEm = new Date(iso);
    return Number.isNaN(criadoEm.getTime()) ? undefined : { criadoEm, id };
  })();

  const { registros, proximo } = await listarLogs({
    tenantId: souDono ? null : tenantId,
    acao: acao || undefined,
    actorId: ator || undefined,
    alvo: tipoDeAlvo && alvoId ? { tipo: tipoDeAlvo, id: alvoId } : undefined,
    de: de ? inicioDoDia(de) : undefined,
    ate: ate ? fimDoDia(ate) : undefined,
    cursor,
  });

  const paramsBase = new URLSearchParams();
  if (acao) paramsBase.set("acao", acao);
  if (ator) paramsBase.set("ator", ator);
  if (tipoDeAlvo) paramsBase.set("alvoTipo", tipoDeAlvo);
  if (alvoId) paramsBase.set("alvoId", alvoId);
  if (de) paramsBase.set("de", de);
  if (ate) paramsBase.set("ate", ate);

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
            defaultValue={acao ?? ""}
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
            defaultValue={de ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Até
          <input
            type="date"
            name="ate"
            defaultValue={ate ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Tipo de alvo
          <select
            name="alvoTipo"
            defaultValue={tipoDeAlvo ?? ""}
            className="h-9 rounded-lg border bg-background px-2 text-sm text-foreground"
          >
            <option value="">qualquer</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {NOME_DO_TIPO[t]}
              </option>
            ))}
          </select>
        </label>

        {/* O id é o identificador interno, o mesmo que os atalhos "ver
            histórico" colocam na URL. Ninguém decora um cuid: o campo existe
            para colar o que veio de um desses atalhos, ou para editar à mão o
            recorte que já está aberto. */}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Id do alvo (identificador interno)
          <input
            type="text"
            name="alvoId"
            defaultValue={alvoId ?? ""}
            placeholder="cole aqui"
            className="h-9 w-44 rounded-lg border bg-background px-2 text-sm text-foreground"
          />
        </label>

        {/* O filtro por pessoa entra pela URL, clicando no nome numa linha.
            Repetir aqui como campo de texto pediria um cuid decorado, então o
            que a tela oferece é o caminho de volta. */}
        {ator && <input type="hidden" name="ator" value={ator} />}

        <button className={buttonVariants({ variant: "outline", size: "sm" })}>
          Filtrar
        </button>

        {(ator || alvoId) && (
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
