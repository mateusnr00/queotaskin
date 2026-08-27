"use client";

// Bloco de pagamento Pix do comprovante. Recebe a string EMV (copia-cola)
// + um data URL com o QR Code já renderizado no servidor. Em cliente, só
// precisa mostrar a imagem e oferecer botão "Copiar código".
//
// É o único lugar da tela onde há uma ação a fazer, então é o único que
// carrega botão cheio. Antes ele dividia esse peso com "Já paguei", que
// vinha logo abaixo no mesmo tamanho e concorria com a ação principal.
//
// Duas maneiras de pagar, e as duas visíveis ao mesmo tempo, porque a
// escolha depende de onde a pessoa está: quem abre no computador escaneia
// com o celular, quem já está no celular copia e cola.

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CheckPaymentButton } from "@/components/public/check-payment-button";
import { cn } from "@/lib/utils";

interface Props {
  qrDataUrl: string;
  pixCode: string;
  reservationId: string;
}

export function PixPayment({ qrDataUrl, pixCode, reservationId }: Props) {
  const [copied, setCopied] = useState(false);
  // Quando copiar falha, o código aparece inteiro para ser selecionado à mão.
  // Sem isto a saída de emergência não existia: a linha é truncada com
  // reticências, e mandar "selecione o texto manualmente" com metade do
  // código escondido é mandar fazer o impossível.
  //
  // Falha de verdade, e não teórica: navigator.clipboard só existe em
  // contexto seguro. Em https funciona; num http a API nem é definida.
  const [aberto, setAberto] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      toast.success("Código Pix copiado");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setAberto(true);
      toast.error("Não foi possível copiar. O código está aí para selecionar");
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="space-y-4 p-4 md:p-5">
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
              className="h-48 w-48 md:h-56 md:w-56"
              width={224}
              height={224}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Ou copie e cole no app
          </p>
          {/* Uma linha com reticências, e não três linhas de textarea. A
              textarea tinha altura fixa e o código vazava por baixo, cortando
              a última linha ao meio, o que parece defeito. Ninguém lê esse
              código: quem precisa dele usa o botão, e quando o botão falha a
              linha se abre inteira. */}
          <p
            onClick={(e) => {
              setAberto(true);
              const faixa = document.createRange();
              faixa.selectNodeContents(e.currentTarget);
              const selecao = window.getSelection();
              selecao?.removeAllRanges();
              selecao?.addRange(faixa);
            }}
            className={cn(
              "cursor-text select-all rounded-lg border bg-muted/40 px-3 py-2.5 font-mono text-xs text-muted-foreground",
              aberto ? "break-all" : "truncate"
            )}
            title={pixCode}
          >
            {pixCode}
          </p>
          <Button
            type="button"
            onClick={copy}
            className="h-12 w-full text-base font-semibold"
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Código copiado
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copiar código Pix
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Rodapé do mesmo cartão, e não um bloco solto embaixo. Verificar é
          consequência de ter pago, então mora junto do pagamento; solto, ele
          virava uma segunda ação do mesmo tamanho da principal. */}
      <div className="space-y-2.5 border-t bg-muted/30 px-4 py-3 md:px-5">
        <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
          Assim que o pagamento cair, esta página se atualiza sozinha e mostra
          os seus números. Não precisa fechar nem recarregar.
        </p>
        <CheckPaymentButton reservationId={reservationId} />
      </div>
    </section>
  );
}
