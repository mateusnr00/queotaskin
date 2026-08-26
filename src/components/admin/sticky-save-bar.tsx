"use client";

import type { ReactNode } from "react";

// Rodapé de salvar do editor de sorteio, fixado na base da janela.
//
// Antes só Geral e Títulos tinham barra fixa; as outras abas terminavam num
// botão solto no fim do card, que rolava para fora da tela em aba longa,
// então o único elemento sempre visível na página era o de excluir o
// sorteio, bem o oposto do que merece essa posição.
//
// A barra não centraliza o salvamento: cada aba mantém a própria server
// action. Ela só padroniza onde o botão fica.
//
// Precisa ficar FORA do <Card> da aba: o Card tem overflow-hidden, e um
// ancestral com overflow recortado desativa position:sticky no filho, a
// barra viraria um rodapé comum, sem grudar.
export function StickySaveBar({
  status,
  children,
}: {
  /** Texto à esquerda: o que está pendente, ou como aquela aba salva. */
  status: ReactNode;
  /** O botão de salvar da aba. Ausente quando não há o que salvar. */
  children?: ReactNode;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-4 border-t bg-background/85 px-4 py-3.5 shadow-[0_-12px_24px_-12px_rgba(0,0,0,0.12)] backdrop-blur-md md:-mx-6 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">{status}</div>
        {children}
      </div>
    </div>
  );
}
