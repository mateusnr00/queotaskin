"use client";

// Exibição da senha temporária, depois de criar um admin ou de gerar uma
// senha nova.
//
// Aparece uma vez e some quando a pessoa fecha. O banco guarda só o hash, e
// recarregar a página não traz a senha de volta, então o aviso não é enfeite:
// quem fechar sem copiar precisa gerar outra.

import { useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function SenhaGerada({
  senha,
  email,
  aoFechar,
}: {
  senha: string;
  /** Mostrado junto porque senha sem o login não serve para entrar. */
  email: string | null;
  aoFechar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    const texto = email ? `${email}\n${senha}` : senha;
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success("Copiado");
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Área de transferência bloqueada (contexto sem HTTPS, permissão
      // negada). A senha está na tela, então dá para copiar à mão; falhar em
      // silêncio aqui faria a pessoa achar que copiou.
      toast.error("Não consegui copiar. Selecione e copie à mão.");
    }
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <p className="text-sm font-semibold">Senha de acesso ao painel</p>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-1.5 rounded-lg bg-background/80 p-3 font-mono text-sm">
        {email && (
          <p className="break-all">
            <span className="text-muted-foreground">login: </span>
            {email}
          </p>
        )}
        <p className="break-all">
          <span className="text-muted-foreground">senha: </span>
          <strong>{senha}</strong>
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copiar}>
          {copiado ? (
            <Check className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Copy className="mr-1.5 h-3.5 w-3.5" />
          )}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Anote agora. Ela aparece só desta vez, o sistema guarda apenas o
        embaralhado e não tem como mostrar de novo. No primeiro acesso o painel
        vai exigir que a pessoa escolha a própria senha, então esta aqui deixa
        de valer.
      </p>
    </div>
  );
}
