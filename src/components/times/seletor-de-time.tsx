"use client";

// A escolha do time, em grade.
//
// Grade de botões, e não um `select`: são trinta times com emblema, e o valor
// da escolha está em reconhecer o escudo, coisa que a lista nativa do celular
// não mostra. Salva no clique, sem botão de confirmar, porque é uma escolha
// só e voltar atrás é outro clique.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { timesPorRegiao, type TimeDeCS2 } from "@/lib/times-cs2";
import { salvarTimeDoCoracaoAction } from "@/server/actions/time-do-coracao";
import { EmblemaDoTime } from "@/components/times/emblema-do-time";

export function SeletorDeTime({ atual }: { atual: string | null }) {
  const router = useRouter();
  const [salvando, comTransicao] = useTransition();
  // O escolhido vive no cliente para a marca de seleção aparecer no clique, e
  // não só quando o servidor responder. O `router.refresh` depois reconcilia.
  const [escolhido, setEscolhido] = useState(atual);
  const { br, inter } = timesPorRegiao();

  function escolher(id: string | null) {
    const anterior = escolhido;
    setEscolhido(id);
    comTransicao(async () => {
      const r = await salvarTimeDoCoracaoAction(id);
      if (!r.ok) {
        // Devolve o estado anterior: deixar a marca no time novo depois de o
        // servidor recusar mostraria uma escolha que não existe no banco.
        setEscolhido(anterior);
        toast.error(r.error);
        return;
      }
      toast.success(id ? "Time salvo." : "Você não torce para ninguém agora.");
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-4", salvando && "pointer-events-none opacity-70")}>
      <Grupo titulo="Brasil" times={br} escolhido={escolhido} aoEscolher={escolher} />
      <Grupo titulo="Internacionais" times={inter} escolhido={escolhido} aoEscolher={escolher} />

      {escolhido && (
        <button
          type="button"
          onClick={() => escolher(null)}
          className="text-xs font-semibold text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Não quero exibir time
        </button>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  times,
  escolhido,
  aoEscolher,
}: {
  titulo: string;
  times: readonly TimeDeCS2[];
  escolhido: string | null;
  aoEscolher: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
        {titulo}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {times.map((time) => {
          const ativo = time.id === escolhido;
          return (
            <button
              key={time.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => aoEscolher(time.id)}
              className={cn(
                // 44px de altura mínima: é um alvo de toque, e a grade tem
                // trinta deles um do lado do outro.
                "flex min-h-11 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                ativo
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
              )}
            >
              <EmblemaDoTime time={time} tamanho="lg" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                {time.nome}
              </span>
              {ativo && (
                <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
