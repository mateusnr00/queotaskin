"use client";

// A gestão do programa de afiliados, no painel.
//
// Uma tela, três coisas: achar gente, ativar quem vai divulgar, e mexer no
// que já está rodando (suspender, trocar código, ajustar entradas). A busca
// serve aos dois lados: filtra a lista de afiliados e, ao mesmo tempo,
// oferece as contas que ainda não são afiliadas com o mesmo nome.
//
// O ajuste manual exige motivo. Não é burocracia: entrada vale uma cota em
// qualquer campanha, e um saldo que muda sem explicação é a coisa que
// ninguém consegue reconstruir três meses depois.

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Minus, Plus, Search, Ticket, UserPlus, X } from "lucide-react";

import {
  ajustarEntradasAction,
  alterarCodigoDoAfiliadoAction,
  ativarAfiliadoAction,
  definirStatusDoAfiliadoAction,
} from "@/server/actions/afiliados";
import { normalizarCodigo } from "@/lib/afiliados";
import { formatPhone } from "@/lib/cpf";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Moldura } from "@/components/ui/moldura";
import { cn } from "@/lib/utils";

export interface AfiliadoNaLista {
  id: string;
  userId: string;
  nome: string;
  telefone: string | null;
  codigo: string;
  status: "INACTIVE" | "ACTIVE" | "SUSPENDED";
  indicados: number;
  qualificados: number;
  disponiveis: number;
  reservadas: number;
  usadas: number;
  desde: string;
}

const ROTULO_DO_STATUS: Record<AfiliadoNaLista["status"], string> = {
  ACTIVE: "Ativo",
  SUSPENDED: "Suspenso",
  INACTIVE: "Inativo",
};

export function GerenciadorDeAfiliados({
  afiliados,
  candidatos,
  busca,
  total,
  porPagina,
}: {
  afiliados: AfiliadoNaLista[];
  candidatos: { id: string; name: string; phone: string | null }[];
  busca: string;
  /** Quantos afiliados existem no total, para o aviso de lista cortada. */
  total: number;
  porPagina: number;
  /** Só para deixar claro de qual tenant é a tela; a action confere de novo. */
  tenantId?: string;
}) {
  const router = useRouter();
  const parametros = useSearchParams();
  const [termo, setTermo] = useState(busca);
  const [isPending, startTransition] = useTransition();

  function buscar() {
    const url = new URLSearchParams(parametros.toString());
    if (termo.trim()) url.set("q", termo.trim());
    else url.delete("q");
    router.push(`/admin/afiliados?${url.toString()}`);
  }

  function ativar(userId: string) {
    startTransition(async () => {
      const r = await ativarAfiliadoAction({ userId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Afiliado ativado com o código ${r.data.codigo}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <Moldura>
        <section className="space-y-3 p-4 md:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") buscar();
                }}
                placeholder="Nome, telefone ou código"
                className="pl-9"
              />
            </div>
            <Button type="button" onClick={buscar} className="shrink-0">
              Buscar
            </Button>
          </div>

          {candidatos.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <p className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                Contas que ainda não são afiliadas
              </p>
              <ul className="space-y-1.5">
                {candidatos.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      <b className="font-semibold">{c.name}</b>
                      {c.phone && (
                        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                          {formatPhone(c.phone)}
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => ativar(c.id)}
                      className="h-8 shrink-0"
                    >
                      <UserPlus aria-hidden className="mr-1.5 h-3.5 w-3.5" />
                      Tornar afiliado
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </Moldura>

      {afiliados.length === 0 ? (
        <Moldura>
          <p className="p-6 text-center text-sm text-muted-foreground">
            {busca
              ? "Nenhum afiliado com esse nome ou código."
              : "Nenhum afiliado ainda. Busque uma conta acima para começar."}
          </p>
        </Moldura>
      ) : (
        <div className="space-y-3">
          {!busca && total > porPagina && (
            <p className="rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
              Mostrando os {porPagina} mais recentes de {total}. Busque pelo
              nome ou pelo código para achar alguém específico.
            </p>
          )}
          {afiliados.map((a) => (
            <CartaoDoAfiliado key={a.id} afiliado={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function CartaoDoAfiliado({ afiliado }: { afiliado: AfiliadoNaLista }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [codigo, setCodigo] = useState(afiliado.codigo);
  const [editandoCodigo, setEditandoCodigo] = useState(false);
  const [quantidade, setQuantidade] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [ajustando, setAjustando] = useState(false);

  function trocarStatus(status: AfiliadoNaLista["status"]) {
    startTransition(async () => {
      const r = await definirStatusDoAfiliadoAction({
        userId: afiliado.userId,
        status,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        status === "ACTIVE" ? "Afiliado reativado" : "Afiliado suspenso",
      );
      router.refresh();
    });
  }

  function salvarCodigo() {
    startTransition(async () => {
      const r = await alterarCodigoDoAfiliadoAction({
        userId: afiliado.userId,
        codigo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Código agora é ${r.data.codigo}`);
      setEditandoCodigo(false);
      router.refresh();
    });
  }

  function ajustar(sinal: 1 | -1) {
    const n = Number.parseInt(quantidade, 10);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Informe quantas entradas");
      return;
    }
    if (motivo.trim().length < 3) {
      toast.error("Escreva o motivo do ajuste");
      return;
    }
    startTransition(async () => {
      const r = await ajustarEntradasAction({
        userId: afiliado.userId,
        quantidade: n * sinal,
        motivo,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        r.data.aplicadas === 0
          ? "Nada a tirar: as entradas dele já foram usadas"
          : `${r.data.aplicadas > 0 ? "+" : ""}${r.data.aplicadas} entrada(s)`,
      );
      setMotivo("");
      setAjustando(false);
      router.refresh();
    });
  }

  return (
    <Moldura>
      <section className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-base font-bold">
              {afiliado.nome}
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase",
                  afiliado.status === "ACTIVE" &&
                    "bg-emerald-500/15 text-emerald-400",
                  afiliado.status === "SUSPENDED" &&
                    "bg-amber-500/15 text-amber-400",
                  afiliado.status === "INACTIVE" &&
                    "bg-white/[0.06] text-muted-foreground",
                )}
              >
                {ROTULO_DO_STATUS[afiliado.status]}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {afiliado.telefone ? formatPhone(afiliado.telefone) : "sem telefone"}
              {" · desde "}
              {new Date(afiliado.desde).toLocaleDateString("pt-BR")}
            </p>
          </div>

          <div className="flex shrink-0 gap-1.5">
            {afiliado.status === "ACTIVE" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => trocarStatus("SUSPENDED")}
                className="h-8"
              >
                Suspender
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                disabled={isPending}
                onClick={() => trocarStatus("ACTIVE")}
                className="h-8"
              >
                Reativar
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {editandoCodigo ? (
            <>
              <Input
                value={codigo}
                onChange={(e) => setCodigo(normalizarCodigo(e.target.value))}
                className="h-9 max-w-[220px] font-mono tracking-widest uppercase"
                maxLength={20}
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={isPending}
                onClick={salvarCodigo}
              >
                <Check aria-hidden className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => {
                  setCodigo(afiliado.codigo);
                  setEditandoCodigo(false);
                }}
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditandoCodigo(true)}
              title="Alterar o código"
              className="rounded-lg border border-primary/30 bg-primary/[0.07] px-3 py-1.5 font-mono text-sm font-bold tracking-widest text-primary transition-colors hover:bg-primary/15"
            >
              {afiliado.codigo}
            </button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Metrica rotulo="Indicados" valor={String(afiliado.indicados)} />
          <Metrica
            rotulo="Qualificados"
            valor={String(afiliado.qualificados)}
          />
          <Metrica
            rotulo="Disponíveis"
            valor={String(afiliado.disponiveis)}
            destaque
          />
          <Metrica rotulo="Reservadas" valor={String(afiliado.reservadas)} />
          <Metrica rotulo="Usadas" valor={String(afiliado.usadas)} />
        </dl>

        {ajustando ? (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
                inputMode="numeric"
                className="h-9 w-20 font-mono"
              />
              <Input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Motivo do ajuste (obrigatório)"
                className="h-9 min-w-[200px] flex-1"
                maxLength={200}
              />
              <Button
                type="button"
                size="sm"
                className="h-9"
                disabled={isPending}
                onClick={() => ajustar(1)}
              >
                <Plus aria-hidden className="mr-1 h-3.5 w-3.5" />
                Somar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9"
                disabled={isPending}
                onClick={() => ajustar(-1)}
              >
                <Minus aria-hidden className="mr-1 h-3.5 w-3.5" />
                Tirar
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => setAjustando(false)}
              >
                Cancelar
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              O ajuste fica no histórico com o seu nome e o motivo. Tirar só
              alcança entrada ainda disponível: o que já foi usado num sorteio
              não volta.
            </p>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() => setAjustando(true)}
          >
            <Ticket aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            Ajustar entradas
          </Button>
        )}
      </section>
    </Moldura>
  );
}

function Metrica({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
      <dt className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
        {rotulo}
      </dt>
      <dd
        className={cn(
          "mt-0.5 text-sm font-bold tabular-nums",
          destaque && "text-emerald-400",
        )}
      >
        {valor}
      </dd>
    </div>
  );
}
