"use client";

// Marcar a entrega como feita, e desfazer.
//
// Desfazer não é enfeite: são vários cards parecidos numa lista, e o erro mais
// provável aqui é marcar o card errado. Sem volta, um toque torto vira um
// registro que ninguém consegue corrigir pela tela.
//
// A observação é opcional e só aparece na hora de marcar. Pedir texto antes de
// deixar concluir transformaria um toque em formulário, e na maioria das
// entregas não há nada a dizer além de "saiu".

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PackageCheck, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { marcarEntregaAction } from "@/server/actions/entregas";

export function BotaoDeEntrega({
  raffleId,
  entregue,
}: {
  raffleId: string;
  entregue: boolean;
}) {
  const router = useRouter();
  const [salvando, comTransicao] = useTransition();
  const [abrindoNota, setAbrindoNota] = useState(false);
  const [observacao, setObservacao] = useState("");

  function salvar(marcar: boolean) {
    comTransicao(async () => {
      const r = await marcarEntregaAction({
        raffleId,
        entregue: marcar,
        observacao: marcar ? observacao : null,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setAbrindoNota(false);
      setObservacao("");
      toast.success(marcar ? "Entrega registrada." : "Entrega desmarcada.");
      router.refresh();
    });
  }

  if (entregue) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={salvando}
        onClick={() => salvar(false)}
        className="text-muted-foreground"
      >
        <Undo2 className="h-4 w-4" />
        Desmarcar
      </Button>
    );
  }

  if (!abrindoNota) {
    return (
      <Button
        type="button"
        size="sm"
        disabled={salvando}
        onClick={() => setAbrindoNota(true)}
      >
        <PackageCheck className="h-4 w-4" />
        Marcar como entregue
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
      <Input
        autoFocus
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar(true);
          if (e.key === "Escape") setAbrindoNota(false);
        }}
        placeholder="Observação (opcional)"
        maxLength={500}
        className="h-9 w-full sm:w-56"
      />
      <Button type="button" size="sm" disabled={salvando} onClick={() => salvar(true)}>
        <Check className="h-4 w-4" />
        Confirmar
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={salvando}
        onClick={() => setAbrindoNota(false)}
      >
        Cancelar
      </Button>
    </div>
  );
}
