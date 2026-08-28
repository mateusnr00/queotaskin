"use client";

// Seção pública "🏆 Títulos Premiados". Modo padrão (list): card inline
// com lista vertical (uma linha por título) + toggle "Mostrar mais/menos"
// quando tem muitos. Modo modal: vira um botão que abre Dialog com a mesma
// lista. Linha do contemplado ganha highlight emerald sólido.

import { useState } from "react";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  ContadorDePremios,
  LinhaDePremio,
} from "@/components/public/linha-de-premio";
import { cn } from "@/lib/utils";

const COLLAPSED_VISIBLE = 5;

export interface PublicAwardedTicket {
  number: number;
  prizeDescription: string;
  participantName: string | null;
}

interface Props {
  tickets: PublicAwardedTicket[];
  totalNumbers: number;
  viewMode: "list" | "modal";
}

export function AwardedTicketsSection({
  tickets,
  totalNumbers,
  viewMode,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  if (tickets.length === 0) return null;

  const winnersCount = tickets.filter((t) => t.participantName).length;
  const total = tickets.length;
  // Padding do número segue a quantidade total de cotas: 100 → 099, 99999
  // → 99999, igual SkinsLendarias.
  const padDigits = Math.max(2, String(Math.max(totalNumbers - 1, 0)).length);
  const visible =
    expanded || tickets.length <= COLLAPSED_VISIBLE
      ? tickets
      : tickets.slice(0, COLLAPSED_VISIBLE);
  const canCollapse = tickets.length > COLLAPSED_VISIBLE;

  const list = (
    <ul className="space-y-2">
      {visible.map((t) => (
        <LinhaDePremio
          key={t.number}
          numero={String(t.number).padStart(padDigits, "0")}
          premio={t.prizeDescription}
          ganhador={t.participantName}
          rotuloVago="Em jogo"
        />
      ))}
    </ul>
  );

  const expander = canCollapse && (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
    >
      {expanded ? (
        <>
          <ChevronUp className="h-4 w-4" />
          Mostrar menos
        </>
      ) : (
        <>
          <ChevronDown className="h-4 w-4" />
          Mostrar mais
        </>
      )}
    </button>
  );

  if (viewMode === "modal") {
    return (
      <Dialog>
        <DialogTrigger
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-full h-12 justify-between"
          )}
        >
          <span className="inline-flex items-center gap-2 font-semibold">
            <Trophy className="h-4 w-4 text-amber-500" />
            Títulos Premiados
          </span>
          <ContadorDePremios feitos={winnersCount} total={total} />
        </DialogTrigger>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="inline-flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              Títulos Premiados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {list}
            {expander}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    // Mesma casca das Caixas surpresas: as duas seções ficam encostadas na
    // página da campanha, e raio de canto, respiro e tamanho de título
    // diferentes faziam parecer que vieram de produtos diferentes. O h2 também
    // devolve a seção para a navegação por cabeçalho do leitor de tela.
    <section className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Trophy className="h-5 w-5 shrink-0 text-amber-500" />
          Títulos Premiados
        </h2>
        <ContadorDePremios feitos={winnersCount} total={total} />
      </div>
      {list}
      {expander}
    </section>
  );
}
