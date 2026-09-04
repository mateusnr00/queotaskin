"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { trocarTelefoneComSenhaAction } from "@/server/actions/auth";
import { onlyDigits } from "@/lib/cpf";
import { PAIS_PADRAO } from "@/lib/telefone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Troca de telefone (§22/§44): sessao valida + SENHA atual. O novo numero entra
// como NAO verificado (telefone nao e fator de login). Revoga sessoes -> novo login.
export function PhoneChangeForm() {
  const [isPending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [senha, setSenha] = useState("");

  function confirmar() {
    const digits = onlyDigits(phone);
    if (digits.length < 6) { toast.error("Telefone invalido"); return; }
    if (!senha) { toast.error("Informe sua senha"); return; }
    start(async () => {
      const r = await trocarTelefoneComSenhaAction({ phone: digits, phoneCountry: PAIS_PADRAO, senha });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Telefone alterado. Entre novamente por seguranca.");
      window.location.href = "/login";
    });
  }

  return (
    <div className="space-y-3">
      <Input inputMode="tel" autoComplete="tel" placeholder="Novo telefone (com DDD)" className="h-12"
        value={phone} onChange={(e) => setPhone(e.target.value)} />
      <Input type="password" autoComplete="current-password" placeholder="Sua senha atual" className="h-12"
        value={senha} onChange={(e) => setSenha(e.target.value)} />
      <p className="text-xs text-muted-foreground">Ao confirmar, suas sessoes serao encerradas.</p>
      <Button onClick={confirmar} disabled={isPending}>{isPending ? "Alterando..." : "Alterar telefone"}</Button>
    </div>
  );
}
