"use client";

// Contador regressivo até a reserva expirar. Mostra MM:SS (ou HH:MM:SS
// se faltar mais de 1 hora). Quando chega em 00:00:
//  - Para o intervalo (evita loop ocioso)
//  - Troca para o aviso de expirado
//  - Pede um router.refresh() pra reconciliar com o estado do servidor
//    (a reserva vira EXPIRED quando o cron passar ou no próximo acesso à rifa)
//
// O `expiresAt` chega como ISO string serializada do Server Component,
// nunca passar Date direto via props (não é serializável).
//
// Deixou de ser um cartão inteiro. Ele e o valor a pagar eram dois quadros
// grandes e coloridos, um em cima do outro, disputando a mesma atenção;
// agora os dois dividem um cartão só, porque respondem à mesma pergunta:
// quanto custa e até quando.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";

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
      <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-destructive">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="text-xs leading-relaxed">
          <strong className="font-semibold">Reserva expirada.</strong> Os
          números voltaram para venda.
        </div>
      </div>
    );
  }

  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Expira em
      </p>
      <p
        className={cn(
          "text-2xl font-bold leading-tight tabular-nums tracking-tight md:text-3xl",
          // Vermelho só nos dois minutos finais. Vermelho o tempo todo é
          // alarme constante, e alarme constante deixa de ser alarme.
          urgent ? "text-destructive" : "text-foreground"
        )}
        aria-live="polite"
        // O servidor desenha o tempo no instante do pedido e o navegador
        // hidrata uns milissegundos depois. Quando o segundo vira entre os
        // dois, o texto difere e o React acusa erro de hidratação: medido,
        // acontecia em uma abertura a cada três. Não é defeito de layout, é
        // a natureza de um relógio, e é para isso que serve este atributo.
        suppressHydrationWarning
      >
        {formatRemaining(remaining)}
      </p>
    </div>
  );
}
