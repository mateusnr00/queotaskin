"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { aprovarRecuperacaoLegadoAction } from "@/server/actions/admin-recovery";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminStepUp } from "@/components/admin/admin-step-up";

interface CasoUI {
  id: string; status: string; riskLevel: string; reason: string | null;
  openedAt: string; resolvedAt: string | null; resolvedBy: string | null;
  nomeMascarado: string; cpfMascarado: string | null; telefoneMascarado: string | null;
}

export function PainelDeRecuperacao({ casos }: { casos: CasoUI[] }) {
  const [isPending, start] = useTransition();
  const [aprovando, setAprovando] = useState<string | null>(null);
  const [grant, setGrant] = useState<string | null>(null);

  function aprovar(caseId: string, totp: string) {
    start(async () => {
      const r = await aprovarRecuperacaoLegadoAction({ caseId, totp });
      if (!r.ok) { toast.error(r.error); return; }
      setAprovando(null);
      setGrant(r.data.grant); // o grant aparece UMA vez, para o suporte repassar
      toast.success("Caso aprovado. Repasse o link ao titular.");
    });
  }

  if (grant) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-semibold">Link de recuperação (mostrado uma vez):</p>
        <code className="block break-all rounded bg-muted/40 p-2 text-xs">/recuperar-conta?case=…&grant={grant}</code>
        <p className="text-xs text-muted-foreground">Envie ao titular por canal confiável. O código não é o telefone: ele ainda prova o novo número por OTP.</p>
        <Button size="sm" onClick={() => setGrant(null)}>Fechar</Button>
      </div>
    );
  }

  if (!casos.length) return <p className="text-sm text-muted-foreground">Nenhum caso.</p>;

  return (
    <div className="space-y-3">
      {casos.map((c) => (
        <div key={c.id} className="rounded-xl border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-semibold">{c.nomeMascarado}</span>{" "}
              <span className="text-muted-foreground">CPF {c.cpfMascarado ?? "-"} · tel {c.telefoneMascarado ?? "-"}</span>
            </div>
            <span className="rounded-full border px-2 py-0.5 text-xs">{c.status} · {c.riskLevel}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Aberto {new Date(c.openedAt).toLocaleString("pt-BR")} · motivo: {c.reason ?? "-"}</p>
          {(c.status === "OPEN" || c.status === "IN_REVIEW") && (
            aprovando === c.id ? (
              <div className="mt-2">
                <AdminStepUp titulo="Confirmar aprovação" pending={isPending}
                  onConfirmar={(totp) => aprovar(c.id, totp)} onCancelar={() => setAprovando(null)} />
              </div>
            ) : (
              <Button size="sm" className="mt-2" onClick={() => setAprovando(c.id)}>Aprovar</Button>
            )
          )}
        </div>
      ))}
    </div>
  );
}
