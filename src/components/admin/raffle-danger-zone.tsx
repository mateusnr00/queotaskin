"use client";

// Bloco "Danger Zone" no rodapé do editor de sorteio. Apaga a rifa
// permanentemente, cascateia tickets, reservas, prêmios, imagens, etc.
// Pra evitar exclusão acidental, exige digitar o título exato antes de
// liberar o botão.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteRaffleAction } from "@/server/actions/raffles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  raffleId: string;
  raffleTitle: string;
}

export function RaffleDangerZone({ raffleId, raffleTitle }: Props) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();

  const matches =
    confirmText.trim().toLowerCase() === raffleTitle.trim().toLowerCase();

  function handleDelete() {
    if (!matches) return;
    startTransition(async () => {
      const result = await deleteRaffleAction({
        id: raffleId,
        confirmTitle: confirmText,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Sorteio excluído");
      router.push("/admin/sorteios");
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive ring-1 ring-destructive/30">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="flex-1 space-y-1">
          <h3 className="text-sm font-semibold tracking-tight text-destructive">
            Excluir sorteio
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Remove permanentemente este sorteio e tudo ligado a ele: imagens,
            prêmios, reservas, pagamentos e tickets vendidos. Esta ação{" "}
            <strong className="text-foreground">não pode ser desfeita</strong>.
            Se você só quer parar as vendas, mude o status para{" "}
            <span className="font-medium">Cancelado</span> em vez disso.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-2 sm:max-w-md">
        <Label htmlFor="confirm-title" className="text-xs">
          Para confirmar, digite o título{" "}
          <span className="font-mono font-semibold text-foreground">
            {raffleTitle}
          </span>
        </Label>
        <Input
          id="confirm-title"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={raffleTitle}
          disabled={isPending}
          className="bg-background"
        />
      </div>

      <div className="mt-4">
        <Button
          type="button"
          variant="destructive"
          onClick={handleDelete}
          disabled={!matches || isPending}
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Excluindo...
            </>
          ) : (
            <>
              <Trash2 className="mr-2 h-4 w-4" />
              Excluir permanentemente
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
