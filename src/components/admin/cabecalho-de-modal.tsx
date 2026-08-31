// O topo dos diálogos de dentro da campanha.
//
// São seis (ganhador, caixas surpresas, raspadinhas, ranking, distribuição,
// detalhes da reserva) e cada um tinha nascido com um topo próprio: um com
// ícone colorido, outro só com texto, outro com o ícone dentro do título. Numa
// tela onde eles abrem por cima do mesmo fundo, isso lê como seis produtos
// diferentes em vez de seis partes da mesma campanha.
//
// A peça é de propósito pequena: ícone em selo, título, e uma linha dizendo
// para que serve. O resto de cada diálogo continua sendo assunto dele.

import {
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** O tom do selo do ícone. Segue o significado da ação, não a decoração. */
export type TomDoCabecalho = "marca" | "premio" | "neutro";

const TOM: Record<TomDoCabecalho, string> = {
  marca: "border-primary/30 bg-primary/10 text-primary",
  /** Dourado para o que entrega prêmio: ganhador, caixa, raspadinha. */
  premio: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  neutro: "border-white/10 bg-white/[0.04] text-muted-foreground",
};

export function CabecalhoDeModal({
  icone,
  titulo,
  descricao,
  tom = "marca",
  acessorio,
}: {
  icone: React.ReactNode;
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  tom?: TomDoCabecalho;
  /** Um contador, um selo de estado: o que couber à direita do título. */
  acessorio?: React.ReactNode;
}) {
  return (
    <DialogHeader className="space-y-0">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
            TOM[tom],
          )}
        >
          {icone}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle className="text-base font-bold">{titulo}</DialogTitle>
            {acessorio}
          </div>
          {descricao && (
            <DialogDescription className="mt-0.5 text-xs leading-relaxed">
              {descricao}
            </DialogDescription>
          )}
        </div>
      </div>
    </DialogHeader>
  );
}
