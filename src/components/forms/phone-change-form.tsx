"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  solicitarOtpTrocaTelefoneAction,
  trocarTelefoneAction,
} from "@/server/actions/auth";
import { onlyDigits } from "@/lib/cpf";
import { PAIS_PADRAO } from "@/lib/telefone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Troca de telefone (§18): sessao valida + OTP no NOVO numero. Ao concluir,
// TODAS as sessoes sao revogadas e o usuario precisa entrar de novo.
export function PhoneChangeForm() {
  const [isPending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");

  function pedirCodigo() {
    const digits = onlyDigits(phone);
    if (digits.length < 6) return toast.error("Telefone invalido");
    start(async () => {
      const r = await solicitarOtpTrocaTelefoneAction({ phone: digits, phoneCountry: PAIS_PADRAO });
      if (!r.ok) { toast.error(r.error); return; }
      setChallengeId(r.data.challengeId);
      toast.success("Enviamos um codigo ao novo telefone.");
    });
  }

  function confirmar() {
    if (!challengeId) return;
    start(async () => {
      const r = await trocarTelefoneAction({ challengeId, codigo, phone: onlyDigits(phone), phoneCountry: PAIS_PADRAO });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Telefone alterado. Entre novamente por seguranca.");
      window.location.href = "/login";
    });
  }

  if (challengeId) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Digite o codigo enviado ao novo telefone. Ao confirmar, suas sessoes
          serao encerradas e voce precisara entrar de novo.
        </p>
        <Input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000"
          className="h-12 tabular-nums tracking-[0.4em]" value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
        <div className="flex gap-3">
          <Button onClick={confirmar} disabled={isPending || codigo.length !== 6}>
            {isPending ? "Confirmando..." : "Confirmar troca"}
          </Button>
          <Button variant="ghost" onClick={() => { setChallengeId(null); setCodigo(""); }}>Cancelar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Input inputMode="tel" autoComplete="tel" placeholder="Novo telefone (com DDD)"
        className="h-12" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Button onClick={pedirCodigo} disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar codigo ao novo telefone"}
      </Button>
    </div>
  );
}
