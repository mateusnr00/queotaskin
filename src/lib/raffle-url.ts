// URL pública de um sorteio. Sempre path-based:
//   https://<host-público-do-tenant>/s/<slug>
//
// Em multi-tenant, o host depende do tenant — sorteio do Mateus é
// https://sorteios.vip/s/<slug>, sorteio do André é
// https://dominio-do-andre.com/s/<slug>. Por isso resolvemos o host
// atual via headers() em vez de usar NEXT_PUBLIC_APP_URL.
//
// O prefixo /s/ cria um namespace pra evitar colisão com rotas reservadas
// (/admin, /login, /api, /comprovante, etc.).

import { headers } from "next/headers";

export async function raffleUrl(slug: string): Promise<string> {
  const h = await headers();
  const rawHost = (h.get("host") ?? "").toLowerCase().trim();
  // Se estamos no host admin (admin.<dominio> ou painel.<dominio>), o link
  // público é no host equivalente sem o prefixo admin/painel.
  const publicHost = rawHost.replace(/^(admin|painel)\./, "");
  if (!publicHost) {
    const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    return `${base}/s/${slug}`;
  }
  // Em dev/localhost mantém http; resto https.
  const proto =
    publicHost.startsWith("localhost") || publicHost.startsWith("127.0.0.1")
      ? "http"
      : "https";
  return `${proto}://${publicHost}/s/${slug}`;
}
