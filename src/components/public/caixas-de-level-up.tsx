"use client";

// As Caixas de Level Up em Minha Conta, e a experiência de abrir uma.
//
// O PRÊMIO JÁ ESTÁ DECIDIDO ANTES DA ANIMAÇÃO COMEÇAR.
//
// O clique chama o servidor, o servidor sorteia com o gerador de
// criptografia, grava e responde. Só então a animação roda, mostrando um
// resultado que já existe no banco. Fechar a aba no meio dela não muda nada:
// recarregar mostra o mesmo multiplicador, porque abrir é uma operação de
// servidor e não um efeito de tela.
//
// A CONTAGEM REGRESSIVA DESENHA, NÃO DECIDE
//
// Ela conta a partir do `expiraEm` que veio do servidor. Relógio de navegador
// adiantado faz o número na tela chegar a zero mais cedo, e não estende nem
// encurta o boost de verdade: quem decide se o prazo passou é a confirmação
// do pagamento, no servidor.

import { useEffect, useState, useTransition } from "react";
import { Gift, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Moldura } from "@/components/ui/moldura";
import { ROTULO_DA_RARIDADE } from "@/lib/xp/caixa-de-level-up";
import { abrirCaixaAction } from "@/server/actions/caixa-de-level-up";
import { cn } from "@/lib/utils";

type Raridade = keyof typeof ROTULO_DA_RARIDADE;

export interface CaixaNaTela {
  id: string;
  sourceLevel: number;
  createdAt: string;
}

export interface BoostNaTela {
  boxId: string;
  multiplicador: number;
  raridade: Raridade;
  sourceLevel: number;
  expiraEm: string;
}

/**
 * A cor de cada raridade.
 *
 * Sobe de neutro a quente conforme fica raro, e o ultra raro é o único com
 * brilho: se todos brilhassem, nenhum brilharia.
 */
const TOM: Record<Raridade, { texto: string; borda: string; fundo: string; halo: string }> = {
  COMUM: {
    texto: "text-zinc-300",
    borda: "border-white/15",
    fundo: "bg-white/[0.05]",
    halo: "",
  },
  RARO: {
    texto: "text-sky-300",
    borda: "border-sky-400/35",
    fundo: "bg-sky-400/[0.08]",
    halo: "",
  },
  EPICO: {
    texto: "text-violet-300",
    borda: "border-violet-400/40",
    fundo: "bg-violet-400/[0.09]",
    halo: "",
  },
  LENDARIO: {
    texto: "text-amber-300",
    borda: "border-amber-400/45",
    fundo: "bg-amber-400/[0.10]",
    halo: "shadow-[0_0_30px_-8px_rgba(251,191,36,0.5)]",
  },
  ULTRA_RARO: {
    texto: "text-red-300",
    borda: "border-red-400/50",
    fundo: "bg-red-400/[0.10]",
    halo: "shadow-[0_0_36px_-6px_rgba(248,113,113,0.65)]",
  },
};

/**
 * Quanto falta, em mm:ss, a partir da data que o servidor mandou.
 *
 * O RELÓGIO SÓ COMEÇA DEPOIS DE MONTAR.
 *
 * `agora` nasce nulo de propósito. O servidor renderiza o traço, o cliente
 * renderiza o traço na primeira passada, e só então o número aparece. Ler
 * `Date.now()` no primeiro render dava um texto no servidor e outro no
 * navegador, o que o React acusa como erro de hidratação (#418) e conserta
 * apagando e redesenhando a árvore.
 *
 * Enquanto não montou, `acabou` é falso: esconder o boost por meio segundo
 * durante a hidratação seria pior que mostrar o traço.
 */
export function useContagem(expiraEm: string | null): {
  texto: string;
  acabou: boolean;
} {
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    if (!expiraEm) return;
    // O primeiro valor vai para o tique seguinte, e não direto: chamar
    // setState dentro do efeito, de forma síncrona, encadeia renderizações.
    const primeiro = setTimeout(() => setAgora(Date.now()), 0);
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, [expiraEm]);

  if (!expiraEm) return { texto: "", acabou: true };
  if (agora === null) return { texto: "--:--", acabou: false };

  const restam = new Date(expiraEm).getTime() - agora;
  if (restam <= 0) return { texto: "00:00", acabou: true };

  const minutos = Math.floor(restam / 60_000);
  const segundos = Math.floor((restam % 60_000) / 1000);
  return {
    texto: `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`,
    acabou: false,
  };
}

export function CaixasDeLevelUp({
  caixas,
  boostAtivo,
}: {
  caixas: CaixaNaTela[];
  boostAtivo: BoostNaTela | null;
}) {
  const [pendentes, setPendentes] = useState(caixas);
  const [ativo, setAtivo] = useState(boostAtivo);
  const [revelando, setRevelando] = useState<BoostNaTela | null>(null);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const contagem = useContagem(ativo?.expiraEm ?? null);

  function abrir(caixa: CaixaNaTela) {
    if (abrindo) return;
    setAbrindo(caixa.id);
    iniciar(async () => {
      const r = await abrirCaixaAction({ boxId: caixa.id });
      setAbrindo(null);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      const novo: BoostNaTela = {
        boxId: r.boxId,
        multiplicador: r.multiplicador,
        raridade: r.raridade,
        sourceLevel: r.sourceLevel,
        expiraEm: r.expiraEm,
      };
      setPendentes((antes) => antes.filter((c) => c.id !== caixa.id));
      setAtivo(novo);
      setRevelando(novo);
    });
  }

  // Nada a mostrar: a seção some inteira em vez de virar caixa vazia.
  if (pendentes.length === 0 && !ativo) return null;

  return (
    <>
      <Moldura>
        <section className="space-y-4 p-4 md:p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold">
              <Gift aria-hidden className="h-4 w-4 text-muted-foreground" />
              Recompensas de level
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Cada nível conquistado rende uma caixa. Abrir sorteia um
              multiplicador de XP que vale na próxima compra.
            </p>
          </div>

          {ativo && !contagem.acabou && (
            <BoostEmDestaque boost={ativo} contagem={contagem.texto} />
          )}

          {pendentes.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {pendentes.map((caixa) => (
                <li
                  key={caixa.id}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/[0.08] text-xl">
                    🎁
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      Caixa Level {caixa.sourceLevel}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Recompensa: 1.5x a 3.5x XP
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 shrink-0"
                    disabled={abrindo !== null || (ativo != null && !contagem.acabou)}
                    onClick={() => abrir(caixa)}
                  >
                    {abrindo === caixa.id ? "Abrindo..." : "Abrir caixa"}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {ativo && !contagem.acabou && pendentes.length > 0 && (
            // Explica o botão desligado antes que alguém ache que quebrou.
            <p className="text-[11px] leading-relaxed text-amber-500">
              Use o boost ativo na próxima compra, ou espere ele expirar, para
              abrir outra caixa.
            </p>
          )}
        </section>
      </Moldura>

      {revelando && (
        <Revelacao boost={revelando} aoFechar={() => setRevelando(null)} />
      )}
    </>
  );
}

/** O boost ativo, dentro da seção de recompensas. */
function BoostEmDestaque({
  boost,
  contagem,
}: {
  boost: BoostNaTela;
  contagem: string;
}) {
  const tom = TOM[boost.raridade];
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3",
        tom.borda,
        tom.fundo,
      )}
    >
      <div className="flex items-center gap-2.5">
        <Zap aria-hidden className={cn("h-5 w-5", tom.texto)} />
        <div>
          <p className={cn("text-lg font-black tabular-nums", tom.texto)}>
            {boost.multiplicador}x XP
          </p>
          <p className="text-[11px] text-muted-foreground">
            {ROTULO_DA_RARIDADE[boost.raridade]} · vale na próxima compra
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-lg font-bold tabular-nums">{contagem}</p>
        <p className="text-[10px] tracking-wider text-muted-foreground uppercase">
          para usar
        </p>
      </div>
    </div>
  );
}

/**
 * A revelação.
 *
 * Um suspense curto e o resultado. A animação é enfeite sobre um número que o
 * servidor já decidiu e gravou: ela não sorteia nada, e por isso não tem como
 * mostrar um prêmio diferente do que ficou no banco.
 */
function Revelacao({
  boost,
  aoFechar,
}: {
  boost: BoostNaTela;
  aoFechar: () => void;
}) {
  const [fase, setFase] = useState<"suspense" | "revelado">("suspense");
  const tom = TOM[boost.raridade];

  useEffect(() => {
    const t = setTimeout(() => setFase("revelado"), 1400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Resultado da caixa de level up"
    >
      <div
        className={cn(
          "w-full max-w-sm rounded-[1.75rem] border p-6 text-center transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]",
          tom.borda,
          "bg-[#0e1013]",
          fase === "revelado" && tom.halo,
        )}
      >
        <p className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
          Caixa de Level Up
        </p>

        {fase === "suspense" ? (
          <div className="py-10">
            <span className="inline-block text-6xl motion-safe:animate-bounce">
              🎁
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Abrindo...</p>
          </div>
        ) : (
          <div className="py-6 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-500">
            <Sparkles aria-hidden className={cn("mx-auto h-8 w-8", tom.texto)} />
            <p className={cn("mt-3 text-5xl font-black tabular-nums", tom.texto)}>
              {boost.multiplicador}x
            </p>
            <p
              className={cn(
                "mt-1 text-xs font-bold tracking-[0.18em] uppercase",
                tom.texto,
              )}
            >
              {ROTULO_DA_RARIDADE[boost.raridade]}
            </p>
            <p className="mt-4 text-sm">
              Seu próximo XP vem com{" "}
              <b className="font-bold">{boost.multiplicador}x</b>.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use na próxima compra. O prazo já começou.
            </p>
          </div>
        )}

        <Button
          type="button"
          className="mt-2 w-full"
          disabled={fase === "suspense"}
          onClick={aoFechar}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
