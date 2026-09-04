"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { redefinirSenhaPorRecuperacaoAction } from "@/server/actions/recuperacao-participante";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// O grant nunca e persistido em localStorage: vive so nesta prop (da URL
// capability) durante o fluxo. Define uma NOVA SENHA.
export function RecuperacaoLegadoForm({ caseId, grant }: { caseId: string; grant: string }) {
  const [isPending, start] = useTransition();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmar, setConfirmar] = useState("");

  function concluir() {
    if (novaSenha.length < 8) { toast.error("Minimo 8 caracteres"); return; }
    if (novaSenha !== confirmar) { toast.error("As senhas nao conferem"); return; }
    start(async () => {
      const r = await redefinirSenhaPorRecuperacaoAction({ caseId, grant, novaSenha, confirmarSenha: confirmar });
      if (!r.ok) { toast.error(r.error); return; }
      toast.success("Senha redefinida. Entre com CPF e a nova senha.");
      window.location.href = "/login";
    });
  }

  return (
    <div className="space-y-3">
      <Input type="password" autoComplete="new-password" placeholder="Nova senha (min. 8)" className="h-12"
        value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
      <Input type="password" autoComplete="new-password" placeholder="Confirmar nova senha" className="h-12"
        value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
      <Button onClick={concluir} disabled={isPending}>{isPending ? "Salvando..." : "Redefinir senha"}</Button>
    </div>
  );
}
