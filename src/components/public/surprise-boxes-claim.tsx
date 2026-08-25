"use client";

// Tela de "Você tem N caixas pra abrir!" que aparece no comprovante
// pós-pagamento (status PAID) quando a rifa tem Caixas Surpresas ativas
// e o comprador atingiu algum combo.
//
// Cada caixa não-aberta tem botão "Abrir" individual. Se a rifa permite
// "Abrir Todas", aparece também um botão pra abrir todas de uma vez.
// Caixas já abertas viram banners coloridos com o resultado:
//   - OPENED_PRIZE: mostra a descrição do prêmio em destaque
//   - OPENED_EMPTY: "Não foi dessa vez!"
//
// Segurança: a server action openSurpriseBoxAction é a única fonte de
// verdade do resultado. O frontend só renderiza o que o servidor devolve.

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Gift, Loader2 } from "lucide-react";

import {
  openSurpriseBoxAction,
  type OpenedBoxResult,
} from "@/server/actions/surprise-boxes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface SurpriseBoxClaimItem {
  id: string;
  status: "UNOPENED" | "OPENED_PRIZE" | "OPENED_EMPTY";
  prize: { title: string; prize: string } | null;
}

interface Props {
  reservationId: string;
  boxes: SurpriseBoxClaimItem[];
  allowOpenAll: boolean;
}

const INITIAL_VISIBLE = 5;

export function SurpriseBoxesClaim({
  reservationId,
  boxes: initialBoxes,
  allowOpenAll,
}: Props) {
  const [boxes, setBoxes] = useState(initialBoxes);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [allPending, startAllTransition] = useTransition();
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const unopenedCount = useMemo(
    () => boxes.filter((b) => b.status === "UNOPENED").length,
    [boxes]
  );

  async function openOne(boxId: string) {
    setOpeningId(boxId);
    const result = await openSurpriseBoxAction({ reservationId, boxId });
    setOpeningId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    applyResult(boxId, result.data);
  }

  function applyResult(boxId: string, data: OpenedBoxResult) {
    setBoxes((prev) =>
      prev.map((b) =>
        b.id === boxId
          ? {
              ...b,
              status: data.status,
              prize: data.prize
                ? { title: data.prize.title, prize: data.prize.prize }
                : null,
            }
          : b
      )
    );
    if (data.status === "OPENED_PRIZE" && data.prize) {
      toast.success(`Você ganhou: ${data.prize.prize}!`);
    }
  }

  function openAll() {
    const targets = boxes.filter((b) => b.status === "UNOPENED");
    if (targets.length === 0) return;
    startAllTransition(async () => {
      // Serializa as aberturas — evita disparar N requests paralelas que
      // brigariam pelo mesmo pool de prêmios.
      for (const b of targets) {
        const result = await openSurpriseBoxAction({
          reservationId,
          boxId: b.id,
        });
        if (!result.ok) {
          toast.error(result.error);
          continue;
        }
        applyResult(b.id, result.data);
      }
    });
  }

  if (boxes.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Gift className="h-5 w-5 text-amber-500" />
          Você tem{" "}
          <span className="text-amber-600 dark:text-amber-400">
            {unopenedCount}
          </span>{" "}
          caixa{unopenedCount === 1 ? "" : "s"} para abrir!
        </h3>
        {allowOpenAll && unopenedCount > 1 && (
          <Button
            type="button"
            size="sm"
            onClick={openAll}
            disabled={allPending || openingId !== null}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {allPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Abrir todas
          </Button>
        )}
      </div>

      <ul className="space-y-2">
        {boxes.slice(0, visible).map((b) => (
          <li key={b.id}>
            <BoxRow
              box={b}
              opening={openingId === b.id}
              disableAll={allPending}
              onOpen={() => openOne(b.id)}
            />
          </li>
        ))}
      </ul>

      {boxes.length > visible && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + INITIAL_VISIBLE)}
            className="text-sm text-amber-600 hover:text-amber-700 hover:underline"
          >
            Mostrar mais ({boxes.length - visible})
          </button>
        </div>
      )}
    </div>
  );
}

function BoxRow({
  box,
  opening,
  disableAll,
  onOpen,
}: {
  box: SurpriseBoxClaimItem;
  opening: boolean;
  disableAll: boolean;
  onOpen: () => void;
}) {
  if (box.status === "UNOPENED") {
    return (
      <div className="rounded-xl border bg-muted/30 p-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Gift className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">Caixa Surpresa</p>
            <p className="text-xs text-muted-foreground">
              Toque em Abrir pra revelar o prêmio
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={onOpen}
          disabled={opening || disableAll}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          {opening && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
          Abrir
        </Button>
      </div>
    );
  }

  // OPENED: banner laranja gradient com o resultado.
  const won = box.status === "OPENED_PRIZE" && box.prize;
  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 p-3 flex items-center justify-between gap-3 shadow-sm">
      <div className="flex items-center gap-2 min-w-0 text-white">
        <Gift className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">
            {won ? box.prize!.title || "Caixa Surpresa" : "Caixa Surpresa"}
          </p>
          <p className="text-xs leading-tight truncate">
            {won ? box.prize!.prize : "Não foi dessa vez!"}
          </p>
        </div>
      </div>
      <Badge className="bg-white/95 text-amber-700 hover:bg-white tabular-nums text-[10px]">
        ABERTA
      </Badge>
    </div>
  );
}
