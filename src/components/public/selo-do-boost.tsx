"use client";

// O selo do boost ativo, visível enquanto a pessoa navega.
//
// Pequeno de propósito. O boost dura quinze minutos e o que ele precisa é
// lembrar, não anunciar: uma faixa grande no topo de toda página viraria
// ruído em dois minutos e seria fechada no terceiro. Aqui é uma pílula com o
// multiplicador e o tempo, do tamanho de um botão do cabeçalho.
//
// O prazo vem do servidor. A contagem só desenha.

import { Zap } from "lucide-react";

import { ROTULO_DA_RARIDADE } from "@/lib/xp/caixa-de-level-up";
import { useContagem, type BoostNaTela } from "@/components/public/caixas-de-level-up";
import { cn } from "@/lib/utils";

export function SeloDoBoost({
  boost,
  className,
}: {
  boost: BoostNaTela | null;
  className?: string;
}) {
  const contagem = useContagem(boost?.expiraEm ?? null);
  if (!boost || contagem.acabou) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1",
        className,
      )}
      style={{
        borderColor: `color-mix(in srgb, ${boost.cor} 40%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${boost.cor} 8%, transparent)`,
      }}
      title={`Boost ${ROTULO_DA_RARIDADE[boost.raridade]} de ${boost.multiplicador}x XP na próxima compra`}
    >
      <Zap aria-hidden className="h-3.5 w-3.5" style={{ color: boost.cor }} />
      <span className="text-xs font-bold tabular-nums" style={{ color: boost.cor }}>
        {boost.multiplicador}x XP
      </span>
      <span className="hidden text-[10px] text-muted-foreground sm:inline">
        próxima compra
      </span>
      <span className="font-mono text-xs font-semibold tabular-nums">
        {contagem.texto}
      </span>
    </span>
  );
}
