"use client";

// O pixel da Meta, para medir anúncio.
//
// Só entra quando o painel cadastrou um id. Sem id, nenhum script de terceiro
// é carregado na página de quem compra: rastreamento é escolha de quem opera,
// não padrão do produto.
//
// O PageView dispara a cada troca de página, e não uma vez por carregamento.
// A navegação do App Router não recarrega o site, então sem olhar o caminho a
// Meta veria uma visita só por sessão e o funil ficaria achatado no topo.

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
  }
}

/** Dispara um evento no pixel, se ele existir. Seguro chamar sem pixel. */
export function eventoDaMeta(nome: string, dados?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", nome, dados);
}

export function PixelDaMeta({ id }: { id: string }) {
  const caminho = usePathname();
  const busca = useSearchParams();
  // O primeiro PageView já sai do script de inicialização; sem esta guarda a
  // primeira página contaria duas vezes.
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    eventoDaMeta("PageView");
    // A querystring entra porque a mesma página com utm diferente é outra
    // origem de tráfego, e a Meta precisa ver as duas.
  }, [caminho, busca]);

  return (
    <Script id="pixel-da-meta" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init','${id}');fbq('track','PageView');`}
    </Script>
  );
}
