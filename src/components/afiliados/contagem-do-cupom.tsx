"use client";

// A contagem regressiva do Cupom de Entrada.
//
// O cupom vale 72 horas. Sem a contagem, o prazo seria uma linha miúda que
// ninguém lê, e a pessoa descobriria a validade no dia em que o cupom sumiu.
// Com ela, o cartão do cupom passa a ter urgência, que é o ponto do prazo.
//
// Cliente porque o relógio anda: o servidor renderiza um instante, e é o
// navegador que precisa virar 02:00:01 em 02:00:00 na frente da pessoa.

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";

import { tempoRestante } from "@/lib/afiliados";
import { cn } from "@/lib/utils";

/** Abaixo disto o prazo vira vermelho: é a última noite do cupom. */
const HORAS_DE_URGENCIA = 12;

export function ContagemDoCupom({
  expiraEm,
  className,
}: {
  /** ISO. Nulo é cupom sem validade, e aí nada é desenhado. */
  expiraEm: string | null;
  className?: string;
}) {
  // Começa nulo e só ganha valor depois de montar. O servidor e o cliente
  // renderizariam segundos diferentes, e o React reclamaria da diferença;
  // pior, o primeiro quadro mostraria um tempo já velho.
  const [restante, setRestante] = useState<ReturnType<
    typeof tempoRestante
  > | null>(null);

  useEffect(() => {
    if (!expiraEm) return;
    const prazo = new Date(expiraEm);
    const tique = () => setRestante(tempoRestante(prazo));
    tique();
    const id = setInterval(tique, 1000);
    return () => clearInterval(id);
  }, [expiraEm]);

  if (!expiraEm || !restante) return null;

  if (restante.acabou) {
    return (
      <span className={cn("text-[11px] font-semibold text-red-400", className)}>
        Expirado
      </span>
    );
  }

  const urgente = restante.horas < HORAS_DE_URGENCIA;
  const dois = (n: number) => String(n).padStart(2, "0");

  return (
    <span
      className={cn(
        "flex items-center gap-1 text-[11px] font-semibold tabular-nums",
        urgente ? "text-red-400" : "text-muted-foreground",
        className,
      )}
      // O texto do leitor de tela não vira a cada segundo: "faltam 49 horas"
      // basta, e o relógio soletrado de segundo em segundo seria ruído.
      aria-label={`Vence em ${restante.horas} horas`}
    >
      <Timer aria-hidden className="h-3 w-3" />
      <span aria-hidden>
        {dois(restante.horas)}:{dois(restante.minutos)}:{dois(restante.segundos)}
      </span>
    </span>
  );
}
