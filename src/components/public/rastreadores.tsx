"use client";

// Os rastreadores de terceiro: Google Analytics 4 e pixel do TikTok.
//
// Mesma regra do pixel da Meta, que já existia: só entra quando o painel
// cadastrou um id. Sem id, nenhum script de terceiro é carregado na página de
// quem compra. Rastreamento é escolha de quem opera, e não padrão do produto.
//
// Os três disparam PageView a cada troca de página, e não uma vez por
// carregamento. A navegação do App Router não recarrega o site, e sem olhar o
// caminho cada ferramenta veria uma visita só por sessão, achatando o funil
// inteiro no topo.

import Script from "next/script";
import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    ttq?: {
      track: (nome: string, dados?: Record<string, unknown>) => void;
      page: () => void;
    };
  }
}

/** Dispara um evento no GA4, se ele existir. Seguro chamar sem GA4. */
export function eventoDoGa4(nome: string, dados?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", nome, dados);
}

/** Dispara um evento no TikTok, se ele existir. */
export function eventoDoTiktok(nome: string, dados?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.ttq) return;
  window.ttq.track(nome, dados);
}

/** Roda o efeito a cada troca de rota, pulando a primeira renderização. */
function useTrocaDeRota(aoTrocar: () => void) {
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
    aoTrocar();
    // A querystring entra porque a mesma página com utm diferente é outra
    // origem de tráfego, e a ferramenta precisa ver as duas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caminho, busca]);
}

export function GoogleAnalytics({ id }: { id: string }) {
  useTrocaDeRota(() => {
    if (!window.gtag) return;
    window.gtag("event", "page_view", {
      page_path: window.location.pathname + window.location.search,
    });
  });

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
window.gtag=gtag;
gtag('js',new Date());
gtag('config','${id}');`}
      </Script>
    </>
  );
}

export function PixelDoTiktok({ id }: { id: string }) {
  useTrocaDeRota(() => window.ttq?.page());

  return (
    <Script id="pixel-do-tiktok" strategy="afterInteractive">
      {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${id}');ttq.page();
}(window, document, 'ttq');`}
    </Script>
  );
}
