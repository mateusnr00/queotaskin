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
    <div className="space-y-4 rounded-2xl border bg-card p-4 md:p-5">
      <div className="space-y-1 text-center">
        <h2 className="text-base font-bold">Pague com Pix</h2>
        <p className="text-xs text-muted-foreground">
          Escaneie o QR Code no app do seu banco ou copie o código.
        </p>
      </div>

      <div className="flex justify-center">
        {/* Fundo branco fixo: o QR precisa de contraste alto para a câmera
            ler, e no tema escuro ele sumiria contra o card. */}
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
        <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Ou copie e cole no app
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
        <Button
          type="button"
          onClick={copy}
          size="lg"
          className="h-12 w-full text-base font-semibold"
        >
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

      <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
        Assim que o pagamento cair, esta página se atualiza sozinha e mostra
        os seus números. Não feche até lá.
      </p>
    </div>
  );
}
