"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  solicitarOtpDeRecuperacaoAction,
  concluirRecuperacaoAction,
} from "@/server/actions/recuperacao-participante";
import { onlyDigits } from "@/lib/cpf";
import { PAIS_PADRAO } from "@/lib/telefone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// O grant nunca é persistido em localStorage: vive só nesta prop (vinda da URL
// capability) durante o fluxo.
export function RecuperacaoLegadoForm({ caseId, grant }: { caseId: string; grant: string }) {
  const [isPending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  function pedir() {
    const digits = onlyDigits(phone);
    if (digits.length < 6) { toast.error("Telefone inválido"); return; }
    start(async () => {
      const r = await solicitarOtpDeRecuperacaoAction({ caseId, grant, phone: digits, phoneCountry: PAIS_PADRAO });
      if (!r.ok) { toast.error(r.error); return; }
      setChallengeId(r.data.challengeId);
      toast.success("Enviamos um código ao novo telefone.");
    });
  }
  function concluir() {
    if (!challengeId) return;
    start(async () => {
      const r = await concluirRecuperacaoAction({ caseId, grant, challengeId, codigo, phone: onlyDigits(phone), phoneCountry: PAIS_PADRAO });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Telefone verificado. Entre com o novo número.");
      window.location.href = "/login";
    });
  }

  if (challengeId) {
    return (
      <div className="space-y-3">
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
          className="h-12 tabular-nums tracking-[0.4em]" value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <Button onClick={concluir} disabled={isPending || codigo.length !== 6}>
          {isPending ? "Confirmando..." : "Confirmar e concluir"}
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Input inputMode="tel" autoComplete="tel" placeholder="Novo telefone (com DDD)" className="h-12"
        value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Button onClick={pedir} disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar código"}
      </Button>
    </div>
  );
}
