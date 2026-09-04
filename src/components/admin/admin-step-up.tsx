"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Modal/painel reutilizavel de step-up de admin (§27). Coleta o TOTP (ou
// recovery code) e devolve ao chamador, que inclui na server action critica.
// O backend continua sendo a autoridade: pular este componente e chamar a
// action sem step-up FALHA (guardarAcaoCritica). Nao ha "recent auth" client.
export function AdminStepUp({
  titulo = "Confirmacao de seguranca",
  onConfirmar,
  onCancelar,
  pending = false,
}: {
  titulo?: string;
  onConfirmar: (totp: string) => void;
  onCancelar?: () => void;
  pending?: boolean;
}) {
  const [totp, setTotp] = useState("");
  const valido = /^[0-9]{6}$/.test(totp) || totp.trim().length >= 8;
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
      <p className="text-sm font-semibold">{titulo}</p>
      <p className="text-xs text-muted-foreground">
        Digite o codigo do seu app autenticador (ou um codigo de recuperacao).
      </p>
      <Input
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        className="h-11 tabular-nums tracking-[0.3em]"
        value={totp}
        onChange={(e) => setTotp(e.target.value.replace(/\s/g, ""))}
      />
      <div className="flex gap-2">
        <Button size="sm" disabled={pending || !valido} onClick={() => onConfirmar(totp)}>
          {pending ? "Confirmando..." : "Confirmar"}
        </Button>
        {onCancelar && (
          <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
        )}
      </div>
    </div>
  );
}
