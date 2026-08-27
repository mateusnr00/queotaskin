"use client";

// Bloco de pagamento Pix do comprovante. Recebe a string EMV (copia-cola)
// + um data URL com o QR Code já renderizado no servidor.
//
// A ordem dos dois meios de pagar muda com a largura da tela, e isso não é
// enfeite: quem abre no celular não escaneia o QR com o próprio celular que
// está segurando. Medido em 360x640, com o QR fixo no topo o botão "Copiar
// código Pix" começava em 705px, fora da tela, e a pessoa tinha que rolar
// uma tela inteira de imagem inútil para chegar ao que precisava. Agora, no
// celular, copia-e-cola vem primeiro e o QR fica recolhido atrás de um
// botão, para quem quiser pagar de outro aparelho. No desktop a ordem é a
// de antes: lá o QR é o caminho natural, porque o banco está no telefone.
//
// O código Pix virou <button>. Era um <p> com onClick: dava para clicar com
// o mouse e mais nada. Tabulando dentro do <main> existiam dois pontos de
// parada, os dois botões, e o código não era um deles. Quem navega por
// teclado não conseguia nem abrir nem selecionar o código.

import { useState } from "react";
import { Check, ChevronDown, Copy, QrCode } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CheckPaymentButton } from "@/components/public/check-payment-button";
import { cn } from "@/lib/utils";

interface Props {
  qrDataUrl: string;
  pixCode: string;
  reservationId: string;
}

const FOCO =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

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
  // Só governa o celular. No desktop o QR aparece sempre, por CSS.
  const [qrVisivel, setQrVisivel] = useState(false);

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

  function abrirEselecionar(elemento: HTMLElement) {
    setAberto(true);
    const faixa = document.createRange();
    faixa.selectNodeContents(elemento);
    const selecao = window.getSelection();
    selecao?.removeAllRanges();
    selecao?.addRange(faixa);
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="space-y-4 p-4 md:p-5">
        <div className="space-y-1 text-center">
          <h2 className="text-base font-bold">Pague com Pix</h2>
          <p className="text-xs text-muted-foreground">
            Copie o código e cole no app do seu banco. Se estiver pagando por
            outro aparelho, use o QR Code.
          </p>
        </div>

        {/* A inversão. `order` troca a sequência sem duplicar marcação, e
            sem esconder nada de ninguém: os dois meios continuam presentes
            e na mesma árvore, inclusive para o leitor de tela.

            No desktop os dois ficam lado a lado, e não empilhados: medido em
            1280x800, com o QR por cima o botão de copiar começava em 766px e
            a base caía a 814, fora de uma tela de laptop. Lado a lado, a
            largura que sobra num cartão de 512px deixa de ser desperdício e
            os dois caminhos cabem na mesma dobra. */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-5">
          <div className="order-2 space-y-2 md:order-1 md:shrink-0">
            {/* No celular, o QR é escolha. Botão de verdade, com
                aria-expanded, e não uma seta decorativa. */}
            <button
              type="button"
              onClick={() => setQrVisivel((v) => !v)}
              aria-expanded={qrVisivel}
              aria-controls="qr-code-pix"
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground md:hidden",
                FOCO
              )}
            >
              <QrCode className="h-4 w-4" />
              {qrVisivel ? "Esconder o QR Code" : "Pagar por outro aparelho"}
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  qrVisivel && "rotate-180"
                )}
                aria-hidden
              />
            </button>

            <div
              id="qr-code-pix"
              className={cn("justify-center md:flex", qrVisivel ? "flex" : "hidden")}
            >
              {/* Fundo branco fixo: o QR precisa de contraste alto para a
                  câmera ler, e no tema escuro ele sumiria contra o card. */}
              <div className="rounded-xl bg-white p-3 ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrDataUrl}
                  alt="QR Code Pix"
                  className="h-48 w-48"
                  width={192}
                  height={192}
                />
              </div>
            </div>
          </div>

          <div className="order-1 min-w-0 flex-1 space-y-2 md:order-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Código copia e cola
            </p>
            {/* Uma linha com reticências, e não três linhas de textarea. A
                textarea tinha altura fixa e o código vazava por baixo,
                cortando a última linha ao meio, o que parece defeito.
                Ninguém lê esse código: quem precisa dele usa o botão, e
                quando o botão falha a linha se abre inteira. */}
            <button
              type="button"
              onClick={(e) => abrirEselecionar(e.currentTarget)}
              aria-expanded={aberto}
              aria-label="Código Pix. Ative para mostrar inteiro e selecionar à mão."
              className={cn(
                "block w-full cursor-text select-all rounded-lg border bg-muted/40 px-3 py-2.5 text-left font-mono text-xs text-muted-foreground",
                FOCO,
                aberto ? "break-all" : "truncate"
              )}
              title={pixCode}
            >
              {pixCode}
            </button>
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
