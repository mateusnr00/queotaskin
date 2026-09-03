"use client";

// O botão que enche o catálogo de preços de uma vez.
//
// O despejo traz o mercado inteiro numa resposta só, então não faz sentido
// pendurar isso na criação do sorteio: é uma tarefa de acervo, e o lugar dela
// é o acervo. Depois de rodar, o preço de qualquer skin do catálogo já está no
// banco quando alguém for criar a campanha.
//
// Baixa um arquivo grande e pesa do outro lado, então nada de automático: quem
// clica sabe o que está pedindo.

import { useTransition, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { atualizarPrecosDoCatalogoAction } from "@/server/actions/precos-do-catalogo";
import { cn } from "@/lib/utils";

export function AtualizarPrecos() {
  const [pendente, iniciar] = useTransition();
  const [resumo, setResumo] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setResumo(null);
            const r = await atualizarPrecosDoCatalogoAction();
            if (!r.ok) {
              toast.error(r.error);
              setResumo(r.error);
              return;
            }
            const { skinsComPreco, atualizados, dolar, fonte } = r.data;
            toast.success(`${skinsComPreco} skins com preço atualizado`);
            setResumo(
              `${skinsComPreco} skins e ${atualizados} desgastes pela fonte ${fonte}, com o dólar a ${dolar.toLocaleString(
                "pt-BR",
                { style: "currency", currency: "BRL", minimumFractionDigits: 4 },
              )}.`,
            );
          })
        }
      >
        <RefreshCw
          aria-hidden
          className={cn("mr-1.5 h-3.5 w-3.5", pendente && "motion-safe:animate-spin")}
        />
        {pendente ? "Buscando preços..." : "Atualizar preços"}
      </Button>
      {resumo && (
        <p className="max-w-xs text-right text-[11px] leading-relaxed text-muted-foreground">
          {resumo}
        </p>
      )}
    </div>
  );
}
