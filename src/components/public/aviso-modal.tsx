"use client";

// Pop-up de aviso/promoção (estilo restaurante): uma imagem clicável com um
// "X" no canto para fechar. Aparece uma vez por imagem: a dispensa é lembrada
// no navegador pela própria URL, então trocar a arte no painel faz o aviso
// voltar a aparecer, sem depender de "versão".
//
// A leitura do localStorage sai por useSyncExternalStore: no servidor o
// snapshot é `null` (mostra), e no cliente já vem o valor real na primeira
// renderização, sem setState em efeito e sem flash. localStorage pode falhar
// (aba anônima, storage bloqueado): nesse caso o aviso simplesmente aparece.

import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

const CHAVE = "queota:aviso:dispensado";

function lerDispensado(): string | null {
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}
// Sem assinatura: não precisamos reagir a mudanças entre abas.
const semAssinatura = () => () => {};

export function AvisoModal({
  imagemUrl,
  aspecto,
  destino,
}: {
  imagemUrl: string;
  aspecto: "5:3" | "9:16";
  destino: string | null;
}) {
  const dispensado = useSyncExternalStore(
    semAssinatura,
    lerDispensado,
    () => null, // snapshot do servidor
  );
  const [fechado, setFechado] = useState(false);
  const aberto = !fechado && dispensado !== imagemUrl;

  // Trava o scroll do fundo enquanto o aviso está aberto.
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function fechar() {
    try {
      window.localStorage.setItem(CHAVE, imagemUrl);
    } catch {
      /* storage indisponível: só fecha nesta sessão */
    }
    setFechado(true);
  }

  if (!aberto) return null;

  const razao =
    aspecto === "9:16"
      ? "aspect-[9/16] w-[min(86vw,340px)] max-h-[82vh]"
      : "aspect-[5/3] w-[min(92vw,560px)]";

  const imagem = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imagemUrl}
      alt="Aviso"
      className="h-full w-full rounded-2xl object-cover shadow-2xl"
    />
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Aviso"
      onClick={fechar}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in-0 duration-200"
    >
      {/* Clicar NA imagem não deve fechar como clicar no fundo: o fundo fecha;
          a imagem, quando tem link, navega. */}
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative ${razao} animate-in zoom-in-95 duration-200`}
      >
        {destino ? (
          <a
            href={destino}
            target="_blank"
            rel="noopener noreferrer"
            onClick={fechar}
            className="block h-full w-full"
          >
            {imagem}
          </a>
        ) : (
          imagem
        )}

        {/* X no canto direito da imagem. */}
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar aviso"
          className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/80 text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
