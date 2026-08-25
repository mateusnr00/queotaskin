"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Botão de copiar com feedback. Usado nos dados de entrega do ganhador. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de clipboard o texto continua selecionável na tela.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-emerald-500" />
          Copiado
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          {label}
        </>
      )}
    </button>
  );
}
