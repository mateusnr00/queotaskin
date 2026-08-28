"use client";

// Caixas surpresas na página da campanha.
//
// Existia só o componente de ABRIR a caixa, no comprovante de quem comprou.
// Quem estava decidindo se compra não via nada: cadastrar cinquenta prêmios
// no painel não mudava uma linha da página pública. E é justamente essa
// lista que sustenta a decisão, porque ela mostra o que já saiu e para quem.
//
// Segue o mesmo desenho de Títulos Premiados: contador de sorteados sobre o
// total, lista com "mostrar mais", e a linha ganha destaque quando o prêmio
// já tem dono.

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { CaixaSurpresaArte } from "@/components/public/caixa-surpresa-arte";
import {
  ContadorDePremios,
  LinhaDePremio,
} from "@/components/public/linha-de-premio";
import { cn } from "@/lib/utils";

const VISIVEIS_FECHADO = 5;

export interface CaixaPublica {
  /** O que sai para o ganhador. */
  premio: string;
  /** Nome de quem levou, quando já foi aberta. */
  ganhador: string | null;
}

export function SurpriseBoxesSection({ caixas }: { caixas: CaixaPublica[] }) {
  const [aberto, setAberto] = useState(false);
  if (caixas.length === 0) return null;

  const sorteados = caixas.filter((c) => c.ganhador).length;
  const visiveis =
    aberto || caixas.length <= VISIVEIS_FECHADO
      ? caixas
      : caixas.slice(0, VISIVEIS_FECHADO);
  const daParaFechar = caixas.length > VISIVEIS_FECHADO;

  return (
    <section className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          {/* Mesma arte do contador dos degraus, e não o presente genérico:
              são a mesma caixa, e desenho diferente para a mesma coisa faz
              parecer que são duas. */}
          <CaixaSurpresaArte tamanho={28} />
          Caixas surpresas
          <span className="text-xs font-normal text-muted-foreground">
            ganhadores
          </span>
        </h2>
        {/* Sorteados sobre o total: "12/500" diz de relance quanto ainda há
            em jogo, que é o que interessa a quem está decidindo comprar. */}
        <ContadorDePremios feitos={sorteados} total={caixas.length} />
      </div>

      <ul className="space-y-2">
        {visiveis.map((c, i) => (
          <LinhaDePremio
            key={i}
            premio={c.premio}
            ganhador={c.ganhador}
            rotuloVago="Disponível"
          />
        ))}
      </ul>

      {daParaFechar && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")}
          />
          {aberto ? "Mostrar menos" : `Mostrar mais (${caixas.length - VISIVEIS_FECHADO})`}
        </button>
      )}
    </section>
  );
}
