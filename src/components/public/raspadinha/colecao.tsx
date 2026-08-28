"use client";

// A coleção de raspadinhas de uma reserva.
//
// Cada bilhete é independente: raspar um não mexe nos outros, e o resultado
// de cada um vem do servidor no momento em que aquele bilhete é raspado.
//
// "Raspar todas" não revela tudo de uma vez. Revela em sequência, com um
// intervalo curto entre um e outro, porque a graça de oito bilhetes é ver os
// oito virarem. O intervalo encolhe conforme a quantidade cresce para o
// total ficar entre 1,5s e 3s: com passo fixo, vinte bilhetes levariam meio
// minuto e a pessoa fecharia a aba antes do fim.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  revelarRaspadinhaAction,
  type PremioDaRaspadinha,
} from "@/server/actions/raspadinhas";
import { Bilhete, type EstadoDoBilhete } from "./bilhete";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface RaspadinhaNaTela {
  id: string;
  numero: string;
  status: "DISPONIVEL" | "PREMIADA" | "SEM_PREMIO";
  premio: PremioDaRaspadinha | null;
}

/** O total da sequência de "raspar todas", em ms. */
const SEQUENCIA_MINIMA = 1500;
const SEQUENCIA_MAXIMA = 3000;

function passoDaSequencia(quantas: number): number {
  if (quantas <= 1) return 0;
  const ideal = SEQUENCIA_MAXIMA / quantas;
  return Math.max(SEQUENCIA_MINIMA / quantas, Math.min(420, ideal));
}

export function ColecaoDeRaspadinhas({
  reservationId,
  raspadinhas: iniciais,
  permiteRasparTodas,
}: {
  reservationId: string;
  raspadinhas: RaspadinhaNaTela[];
  permiteRasparTodas: boolean;
}) {
  const [bilhetes, setBilhetes] = useState(iniciais);
  const [revelando, setRevelando] = useState<Set<string>>(new Set());
  const [confirmando, setConfirmando] = useState(false);
  const [emSequencia, setEmSequencia] = useState(false);
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const r of relogios.current) clearTimeout(r);
    },
    [],
  );

  /** Pede o resultado ao servidor. É a única fonte da verdade. */
  const revelar = useCallback(
    async (id: string) => {
      setRevelando((s) => new Set(s).add(id));
      try {
        const r = await revelarRaspadinhaAction({
          reservationId,
          raspadinhaId: id,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setBilhetes((atuais) =>
          atuais.map((b) =>
            b.id === id
              ? { ...b, status: r.data.status, premio: r.data.premio }
              : b,
          ),
        );
        // Um toque curtíssimo só quando premiou, e só onde existe. Não é
        // requisito: o aparelho que não tem simplesmente ignora.
        if (r.data.status === "PREMIADA" && typeof navigator !== "undefined") {
          navigator.vibrate?.(18);
        }
      } catch {
        // A ação lança quando a rede cai, e aí o `if` acima nunca roda: sem
        // este catch o bilhete ficaria girando para sempre.
        toast.error("Não foi possível revelar agora. Tente de novo");
      } finally {
        setRevelando((s) => {
          const proximo = new Set(s);
          proximo.delete(id);
          return proximo;
        });
      }
    },
    [reservationId],
  );

  const disponiveis = bilhetes.filter((b) => b.status === "DISPONIVEL");
  const premiadas = bilhetes.filter((b) => b.status === "PREMIADA");
  const tudoRevelado = disponiveis.length === 0;

  function rasparTodas() {
    setConfirmando(false);
    setEmSequencia(true);
    const fila = disponiveis.map((b) => b.id);
    const passo = passoDaSequencia(fila.length);
    fila.forEach((id, i) => {
      relogios.current.push(
        setTimeout(() => {
          void revelar(id);
          if (i === fila.length - 1) {
            relogios.current.push(setTimeout(() => setEmSequencia(false), 700));
          }
        }, i * passo),
      );
    });
  }

  function estadoDe(b: RaspadinhaNaTela): EstadoDoBilhete {
    if (revelando.has(b.id)) return "revelando";
    if (b.status === "PREMIADA") return "premiada";
    if (b.status === "SEM_PREMIO") return "sem-premio";
    return "disponivel";
  }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider">
            Suas raspadinhas
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {tudoRevelado
              ? `${bilhetes.length} revelada${bilhetes.length === 1 ? "" : "s"}`
              : `${disponiveis.length} disponíve${disponiveis.length === 1 ? "l" : "is"}`}
          </p>
        </div>

        {permiteRasparTodas && disponiveis.length > 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={emSequencia}
            onClick={() => setConfirmando(true)}
          >
            {emSequencia ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Raspar todas
          </Button>
        )}
      </header>

      {/* Um por linha no celular e no máximo dois em qualquer largura.
      
          Três colunas pareciam melhor aproveitamento até a medição: o
          comprovante é uma coluna de 512px, e dividido em três dava bilhetes
          de 152x98. Nesse tamanho o cabeçalho e o rodapé comem a altura
          inteira e a área raspável fica com ZERO pixel de altura, ou seja,
          não há o que raspar. Duas colunas dão 245px, e a área volta a ter
          uns 80px. */}
      <div className="grid gap-3 sm:grid-cols-2">
        {bilhetes.map((b, i) => (
          <Bilhete
            key={b.id}
            numero={b.numero}
            posicao={i + 1}
            estado={estadoDe(b)}
            premio={b.premio}
            aoRevelar={() => void revelar(b.id)}
            compacto={bilhetes.length > 2}
          />
        ))}
      </div>

      {tudoRevelado && (
        <Resumo total={bilhetes.length} premiadas={premiadas.length} />
      )}

      <Dialog open={confirmando} onOpenChange={setConfirmando}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Revelar todas?</DialogTitle>
            <DialogDescription>
              Suas {disponiveis.length} raspadinhas vão ser reveladas em
              sequência. Não dá para voltar atrás.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button onClick={rasparTodas}>Raspar todas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

/** O fecho, depois que a última virou. */
function Resumo({ total, premiadas }: { total: number; premiadas: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border bg-card px-4 py-3 text-center"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {total} raspadinha{total === 1 ? "" : "s"} revelada
        {total === 1 ? "" : "s"}
      </p>
      {premiadas > 0 ? (
        <p className="mt-1 text-sm font-bold text-[color:var(--ouro-claro)]">
          {premiadas} prêmio{premiadas === 1 ? "" : "s"} encontrado
          {premiadas === 1 ? "" : "s"}
        </p>
      ) : (
        // Sem "quase ganhou" e sem consolo inventado: não deu, e ponto.
        <p className="mt-1 text-sm text-muted-foreground">
          Nenhum prêmio desta vez.
        </p>
      )}
    </div>
  );
}
