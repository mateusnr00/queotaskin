// URL absoluta pro painel admin do tenant atual.
//
// Em produção (multi-tenant), o admin de cada tenant fica em "admin.<host>":
// `sorteios.vip` vira `admin.sorteios.vip`, `dominio-do-andre.com` vira
// `admin.dominio-do-andre.com`. Em dev/preview tudo vive no mesmo host,
// então retornamos só "/admin" relativo.

import { headers } from "next/headers";

async function readHost(): Promise<string> {
  const h = await headers();
  return (h.get("host") ?? "").toLowerCase().trim();
}

function isLocalOrPreview(host: string): boolean {
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.endsWith(".vercel.app")
  );
}

function isAdminHost(host: string): boolean {
  return host.startsWith("admin.") || host.startsWith("painel.");
}

export async function adminHref(): Promise<string> {
  const host = await readHost();
  if (!host || isLocalOrPreview(host)) return "/admin";
  // Se já estamos no host admin, link relativo basta.
  if (isAdminHost(host)) return "/admin";
  const base = host.replace(/^www\./, "");
  return `https://admin.${base}/admin`;
}

export async function isAdminOnSeparateHost(): Promise<boolean> {
  const host = await readHost();
  if (!host || isLocalOrPreview(host)) return false;
  return !isAdminHost(host);
}
