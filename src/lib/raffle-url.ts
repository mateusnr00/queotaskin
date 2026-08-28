// URL pública de um sorteio. Sempre path-based, na raiz do host:
//   https://<host-público-do-tenant>/<slug>
//
// Em multi-tenant, o host depende do tenant, sorteio do Mateus é
// https://queotaskin.com/<slug>, sorteio do André é
// https://dominio-do-andre.com/<slug>. Por isso resolvemos o host
// atual via headers() em vez de usar NEXT_PUBLIC_APP_URL.
//
// Morava em /s/<slug>. O prefixo existia como namespace contra colisão com
// as rotas do site (/admin, /login, /api, /comprovante). Saiu porque o
// endereço é o que a pessoa lê no story e digita no navegador, e "/s/" ali
// não quer dizer nada para ela. O que o prefixo protegia agora é protegido
// na origem, em src/lib/rotas-reservadas.ts: nenhum slug nasce com nome de
// rota. Endereços antigos continuam abrindo por um redirect permanente
// declarado em next.config.ts.

import { headers } from "next/headers";

export async function raffleUrl(slug: string): Promise<string> {
  const h = await headers();
  const rawHost = (h.get("host") ?? "").toLowerCase().trim();
  // Se estamos no host admin (admin.<dominio> ou painel.<dominio>), o link
  // público é no host equivalente sem o prefixo admin/painel.
  const publicHost = rawHost.replace(/^(admin|painel)\./, "");
  if (!publicHost) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    return `${base}/${slug}`;
  }
  // Em dev/localhost mantém http; resto https.
  const proto =
    publicHost.startsWith("localhost") || publicHost.startsWith("127.0.0.1")
      ? "http"
      : "https";
  return `${proto}://${publicHost}/${slug}`;
}
