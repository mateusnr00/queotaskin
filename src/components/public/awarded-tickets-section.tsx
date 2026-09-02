"use client";

// Seção pública "🏆 Títulos Premiados". Modo padrão (list): card inline
// com lista vertical (uma linha por título) + toggle "Mostrar mais/menos"
// quando tem muitos. Modo modal: vira um botão que abre Dialog com a mesma
// lista. Linha do contemplado ganha highlight emerald sólido.

import type { SkinRarity } from "@prisma/client";
import type { TimeDeCS2 } from "@/lib/times-cs2";
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
import { casasDoTitulo } from "@/lib/titulo";
import {
  ContadorDePremios,
  LinhaDePremio,
} from "@/components/public/linha-de-premio";
import { cn } from "@/lib/utils";

const COLLAPSED_VISIBLE = 5;

export interface PublicAwardedTicket {
  number: number;
  prizeDescription: string;
  skinRarity: SkinRarity | null;
  /** A foto da skin, copiada do catálogo na hora do cadastro. */
  skinImageUrl: string | null;
  participantName: string | null;
  /** Time do ganhador, resolvido no servidor. Nulo quando não há conta. */
  time: TimeDeCS2 | null;
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
  // A largura do número vem do tamanho da campanha, pela mesma regra da fita
  // do sorteio e do comprovante. Aqui ela era contada sobre `totalNumbers - 1`,
  // herdado de quando os títulos começavam no zero: numa campanha de cem, que
  // vai de 1 a 100, isso dava duas casas e o 100 saía com três, um dígito a
  // mais que todos os outros da mesma lista.
  const padDigits = casasDoTitulo(totalNumbers);
  const visible =
    expanded || tickets.length <= COLLAPSED_VISIBLE
      ? tickets
      : tickets.slice(0, COLLAPSED_VISIBLE);
  const canCollapse = tickets.length > COLLAPSED_VISIBLE;

  const list = (
    <ul className="space-y-1.5">
      {visible.map((t) => (
        <LinhaDePremio
          key={t.number}
          numero={String(t.number).padStart(padDigits, "0")}
          premio={t.prizeDescription}
          raridade={t.skinRarity}
          ganhador={t.participantName}
          time={t.time}
          rotuloVago="Disponível"
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
            "w-full h-12 justify-between",
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
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <Trophy className="h-5 w-5 shrink-0 text-amber-500" />
            Títulos Premiados
          </h2>
          <ContadorDePremios feitos={winnersCount} total={total} />
        </div>
        {/* Quanto já saiu, numa barra fina. O contador diz o número; a barra
            diz de relance se a lista está intocada ou quase no fim, que é a
            leitura que faz alguém decidir comprar agora. */}
        <div
          role="progressbar"
          aria-valuenow={winnersCount}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Títulos premiados já contemplados"
          className="h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-amber-500 transition-[width] duration-500"
            style={{ width: `${total > 0 ? (winnersCount / total) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {winnersCount === total
            ? "Todos já saíram."
            : "Comprou o número, levou a skin na hora."}
        </p>
      </div>
      {list}
      {expander}
    </section>
  );
}
