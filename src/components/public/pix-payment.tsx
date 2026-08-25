"use client";

// Bloco de pagamento Pix do comprovante. Recebe a string EMV (copia-cola)
// + um data URL com o QR Code já renderizado no servidor. Em cliente, só
// precisa mostrar a imagem e oferecer botão "Copiar código".

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface Props {
  qrDataUrl: string;
  pixCode: string;
}

export function PixPayment({ qrDataUrl, pixCode }: Props) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      toast.success("Código Pix copiado");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto manualmente");
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="text-center space-y-1">
        <h3 className="font-bold">Pague com Pix</h3>
        <p className="text-xs text-muted-foreground">
          Escaneie o QR Code com o app do seu banco ou copie o código abaixo.
        </p>
      </div>

      <div className="flex justify-center">
        <div className="rounded-xl bg-white p-3 ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="QR Code Pix"
            className="h-56 w-56"
            width={224}
            height={224}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Código Pix copia e cola
        </label>
        <div className="relative">
          <textarea
            readOnly
            value={pixCode}
            rows={3}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            className="w-full font-mono text-[11px] leading-tight rounded-lg border bg-muted/30 p-2 pr-12 break-all resize-none"
          />
        </div>
        <Button type="button" onClick={copy} className="w-full" size="lg">
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4" />
              Copiado
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copiar código Pix
            </>
          )}
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        Após pagar, esta página atualiza automaticamente. Não feche enquanto
        o pagamento estiver pendente.
      </p>
    </div>
  );
}
