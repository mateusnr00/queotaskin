"use client";

// Contador regressivo até a reserva expirar. Mostra MM:SS (ou HH:MM:SS
// se faltar mais de 1 hora). Quando chega em 00:00:
//  - Para o intervalo (evita loop ocioso)
//  - Troca o card para o estado "Expirado"
//  - Pede um router.refresh() pra reconciliar com o estado do servidor
//    (a reserva vira EXPIRED quando o cron passar ou no próximo acesso à rifa)
//
// O `expiresAt` chega como ISO string serializada do Server Component,
// nunca passar Date direto via props (não é serializável).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";

import { cn } from "@/lib/utils";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

export function ReservationCountdown({
  expiresAtIso,
}: {
  expiresAtIso: string;
}) {
  const router = useRouter();
  const expiresAt = new Date(expiresAtIso).getTime();

  // Calcula uma vez para o render inicial (evita pulinho do "00:00" → tempo real)
  const [remaining, setRemaining] = useState<number>(() =>
    Math.max(0, expiresAt - Date.now())
  );

  useEffect(() => {
    if (remaining <= 0) {
      router.refresh();
      return;
    }
    const id = setInterval(() => {
      const ms = expiresAt - Date.now();
      setRemaining(ms);
      if (ms <= 0) {
        clearInterval(id);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(id);
    // expiresAt é estável; remaining muda mas só precisamos do setup uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  const expired = remaining <= 0;
  const urgent = !expired && remaining < 2 * 60_000; // < 2 min

  if (expired) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Reserva expirada</div>
          <div className="text-destructive/80 text-xs mt-0.5">
            Os números foram liberados e voltaram para venda. Você precisa
            fazer uma nova reserva.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 text-center space-y-1.5",
        urgent
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-400/40 bg-amber-50 dark:bg-amber-950/40"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-wider",
          urgent ? "text-destructive" : "text-amber-700 dark:text-amber-300"
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        Pague antes de expirar
      </div>
      <div
        className={cn(
          "text-4xl font-bold tabular-nums tracking-tight",
          urgent ? "text-destructive" : "text-amber-900 dark:text-amber-200"
        )}
        aria-live="polite"
      >
        {formatRemaining(remaining)}
      </div>
      <div className="text-xs text-muted-foreground">
        Após esse tempo, os números voltam para venda.
      </div>
    </div>
  );
}
