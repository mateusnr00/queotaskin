"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { iniciarEnrollmentMfaAction, confirmarEnrollmentMfaAction } from "@/server/actions/admin-mfa";
import { Input } from "@/components/ui/input";
import { BotaoDeGrade } from "@/components/forms/botao-de-grade";

export function MfaEnrollForm() {
  const [pending, start] = useTransition();
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);

  function iniciar() {
    start(async () => {
      const r = await iniciarEnrollmentMfaAction();
      if (!r.ok) { toast.error(r.error); return; }
      setUri(r.data.uri);
      setSecret(r.data.secret);
    });
  }
  function confirmar() {
    start(async () => {
      const r = await confirmarEnrollmentMfaAction({ codigo });
      if (!r.ok) { toast.error(r.error); return; }
      setRecovery(r.data.recoveryCodes);
      toast.success("MFA ativada.");
    });
  }

  if (recovery) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Guarde estes codigos de recuperacao (mostrados so agora):</p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm">
          {recovery.map((c) => <li key={c} className="rounded-lg border bg-muted/40 px-3 py-2">{c}</li>)}
        </ul>
        <Link href="/admin" className="inline-block text-sm underline">Ir para o painel</Link>
      </div>
    );
  }

  if (!uri) {
    return <BotaoDeGrade disabled={pending} onClick={iniciar}>{pending ? "..." : "Comecar configuracao"}</BotaoDeGrade>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Adicione ao app autenticador por este codigo:
      </p>
      <code className="block break-all rounded-lg border bg-muted/40 p-3 text-xs">{secret}</code>
      <p className="text-[11px] text-muted-foreground break-all">{uri}</p>
      <Input inputMode="numeric" maxLength={6} placeholder="000000" value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        className="h-12 tabular-nums tracking-[0.4em]" />
      <BotaoDeGrade disabled={pending || codigo.length !== 6} onClick={confirmar}>
        {pending ? "..." : "Confirmar e ativar"}
      </BotaoDeGrade>
    </div>
  );
}
