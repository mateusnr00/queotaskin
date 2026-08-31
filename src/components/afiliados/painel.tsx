"use client";

// A parte da página de afiliados que precisa do navegador: copiar o link e o
// código. Todo o resto é servidor, e continua servidor.
//
// O feedback de cópia é o detalhe que decide se a pessoa acredita que o
// clique funcionou. Sem ele, ela clica duas, três vezes, e vai conferir no
// WhatsApp se colou. Aqui o botão troca de rótulo e de cor por dois
// segundos, e volta.

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

export function BotaoDeCopiar({
  valor,
  rotulo = "Copiar",
  className,
  aoCopiar,
}: {
  valor: string;
  rotulo?: string;
  className?: string;
  /** Para registrar o evento de analytics de quem chama. */
  aoCopiar?: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      // Navegador sem permissão de área de transferência (http, iOS antigo).
      // O texto continua visível e selecionável na tela, que é o plano B.
      return;
    }
    aoCopiar?.();
    setCopiado(true);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setCopiado(false), 2000);
  }, [valor, aoCopiar]);

  return (
    <button
      type="button"
      onClick={copiar}
      aria-live="polite"
      className={cn(
        "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold tracking-wide uppercase transition-colors",
        copiado
          ? "bg-emerald-500 text-white"
          : "bg-primary text-primary-foreground hover:opacity-95",
        className,
      )}
    >
      {copiado ? (
        <Check aria-hidden className="h-3.5 w-3.5" />
      ) : (
        <Copy aria-hidden className="h-3.5 w-3.5" />
      )}
      {copiado ? "Copiado" : rotulo}
    </button>
  );
}
