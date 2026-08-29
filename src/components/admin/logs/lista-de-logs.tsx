"use client";

// Lista de registros de atividade.
//
// O detalhe fica fechado por padrão: quem abre a tela está procurando quando
// e quem, e o antes e o depois só interessam depois de achar a linha.

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { textoDaAcao } from "@/lib/activity-log-actions";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface LinhaDeLog {
  id: string;
  criadoEm: Date;
  origem: "PAINEL" | "SISTEMA" | "PUBLICO";
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  acao: string;
  alvoTipo: string | null;
  alvoId: string | null;
  alvoRotulo: string | null;
  detalhes: unknown;
}

const ROTULO_DE_ORIGEM: Record<string, string> = {
  PAINEL: "painel",
  SISTEMA: "sistema",
  PUBLICO: "site",
};

const ROTULO_DE_PAPEL: Record<string, string> = {
  SUPER_ADMIN: "dono",
  ADMIN: "admin",
  AFFILIATE: "afiliado",
  PARTICIPANT: "cliente",
};

/**
 * Para onde o alvo aponta.
 *
 * Devolve nulo para o que não tem tela própria: aí o rótulo fica como texto,
 * em vez de virar um link que leva a 404.
 */
function telaDoAlvo(tipo: string | null, id: string | null): string | null {
  if (!tipo || !id) return null;
  if (tipo === "User") return `/admin/usuarios/${id}/editar`;
  if (tipo === "Raffle") return `/admin/sorteios/${id}/editar`;
  if (tipo === "SkinTemplate") return "/admin/skins";
  return null;
}

export function ListaDeLogs({ registros }: { registros: LinhaDeLog[] }) {
  const [aberto, setAberto] = useState<string | null>(null);

  if (registros.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        Nada registrado com esses filtros.
      </p>
    );
  }

  return (
    <div className="divide-y">
      {registros.map((r) => {
        const temDetalhe = r.detalhes != null;
        const destino = telaDoAlvo(r.alvoTipo, r.alvoId);
        return (
          <div key={r.id} className="px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(r.criadoEm)}
              </span>
              {/* O nome do ator filtra por ele: achar uma linha suspeita e
                  querer ver o resto do que aquela pessoa fez é o movimento
                  seguinte mais comum. */}
              {r.actorId ? (
                <Link
                  href={`/admin/logs?ator=${r.actorId}`}
                  className="font-medium hover:underline"
                >
                  {r.actorName}
                </Link>
              ) : (
                <span className="font-medium">{r.actorName}</span>
              )}
              {r.actorRole && (
                <span className="shrink-0 text-[10px] font-bold uppercase text-muted-foreground">
                  {ROTULO_DE_PAPEL[r.actorRole] ?? r.actorRole}
                </span>
              )}
              <span
                className={cn(
                  "shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase",
                  r.origem === "SISTEMA"
                    ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {ROTULO_DE_ORIGEM[r.origem] ?? r.origem}
              </span>
              <span className="text-muted-foreground">{textoDaAcao(r.acao)}</span>
              {r.alvoRotulo &&
                (destino ? (
                  <Link href={destino} className="font-medium hover:underline">
                    {r.alvoRotulo}
                  </Link>
                ) : (
                  <span className="font-medium">{r.alvoRotulo}</span>
                ))}
              {temDetalhe && (
                <button
                  type="button"
                  onClick={() => setAberto(aberto === r.id ? null : r.id)}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  detalhes
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      aberto === r.id && "rotate-180"
                    )}
                  />
                </button>
              )}
            </div>

            {aberto === r.id && temDetalhe && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/40 p-3 text-xs">
                {JSON.stringify(r.detalhes, null, 2)}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}
