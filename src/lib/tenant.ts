// Resolução de tenant por host.
//
// A plataforma é multi-tenant: cada admin cliente compra o domínio dele e
// aponta pro mesmo deploy Vercel. As páginas precisam saber "qual tenant
// é esse?" pra filtrar sorteios, usuários, etc.
//
// A tabela TenantHost mapeia host → tenant (PUBLIC ou ADMIN). Quando uma
// request chega, descobrimos o tenant olhando o Host header e procurando
// nessa tabela. Cacheamos por request via React `cache()` pra evitar N
// queries no mesmo render.

import { cache } from "react";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { isHostDeDesenvolvimento } from "@/lib/host";
import { ForbiddenError, NotFoundError } from "@/lib/errors";
import { type TenantHostKind } from "@prisma/client";

export type TenantContext = {
  id: string;
  slug: string;
  name: string;
  hostKind: TenantHostKind;
  host: string;
};

async function readHost(): Promise<string> {
  const h = await headers();
  // A porta sai: TenantHost guarda o domínio puro ("queotaskin.com"), e um
  // host com porta nunca casaria com o registro. Só aparece fora da Vercel
  // — em teste local com domínio real, por exemplo — mas o lookup falhando
  // devolve 404 em toda página, o que é um jeito ruim de descobrir isso.
  return (h.get("host") ?? "")
    .toLowerCase()
    .trim()
    .replace(/:\d+$/, "");
}

// Lookup do tenant pelo host. Cached por request — múltiplas chamadas no
// mesmo render só fazem 1 query.
export const getCurrentTenant = cache(async (): Promise<TenantContext | null> => {
  const host = await readHost();
  if (!host) return null;

  // Pula o split em dev/preview: localhost e *.vercel.app não estão
  // mapeados em TenantHost, então iam dar null e quebrar tudo. Em vez
  // disso pegamos o tenant default (= o único cadastrado em dev).
  if (isHostDeDesenvolvimento(host)) {
    const fallback = await prisma.tenant.findFirst({
      orderBy: { createdAt: "asc" },
      include: { hosts: { take: 1, where: { kind: "PUBLIC" } } },
    });
    if (!fallback) return null;
    return {
      id: fallback.id,
      slug: fallback.slug,
      name: fallback.name,
      hostKind: "PUBLIC",
      host,
    };
  }

  const tenantHost = await prisma.tenantHost.findUnique({
    where: { host },
    include: { tenant: true },
  });
  if (!tenantHost) return null;

  return {
    id: tenantHost.tenant.id,
    slug: tenantHost.tenant.slug,
    name: tenantHost.tenant.name,
    hostKind: tenantHost.kind,
    host,
  };
});

// Mesma coisa, mas garante que existe — lança se não achou. Útil em
// páginas que sabidamente só fazem sentido com tenant resolvido.
export async function getCurrentTenantOrThrow(): Promise<TenantContext> {
  const t = await getCurrentTenant();
  if (!t) {
    throw new Error("Tenant não encontrado pra esse host");
  }
  return t;
}

// Heurística pra detectar host admin sem consultar o banco — usada no
// proxy.ts (Edge runtime, sem acesso a Prisma). Convenção: hosts admin
// começam com "admin." ou "painel.".
export function isAdminHostByConvention(host: string): boolean {
  const h = host.toLowerCase().trim();
  return h.startsWith("admin.") || h.startsWith("painel.");
}

// Tenant que o admin logado está autorizado a operar no contexto atual.
//
// Regras:
// - ADMIN: só pode operar no próprio tenant (user.tenantId). Se está
//   acessando um host de outro tenant, lança ForbiddenError.
// - SUPER_ADMIN: pode operar em qualquer tenant. Usa o tenant do host
//   atual (pra ele poder logar em admin.dominio-do-andre.com e gerenciar
//   o André).
//
// Retorna o id do tenant ativo. Lança se o host não tem tenant cadastrado
// ou se o admin não tem permissão pra esse tenant.
export async function getActiveTenantIdForAdmin(admin: {
  role: "SUPER_ADMIN" | "ADMIN" | string;
  tenantId: string | null;
}): Promise<string> {
  const tenant = await getCurrentTenant();
  if (!tenant) {
    throw new NotFoundError("Tenant não encontrado pra esse host.");
  }

  if (admin.role === "SUPER_ADMIN") {
    return tenant.id;
  }

  // ADMIN comum: só pode operar no tenant dele E o host tem que bater.
  if (admin.tenantId && admin.tenantId === tenant.id) {
    return tenant.id;
  }

  throw new ForbiddenError();
}

// Verifica que uma rifa pertence ao tenant ativo do admin. Lança se não.
// Usada nas server actions de conteúdo (imagens/prêmios/promoções) pra
// impedir cross-tenant via raffleId injetado.
export async function assertRaffleInActiveTenant(
  raffleId: string,
  admin: { role: string; tenantId: string | null }
): Promise<void> {
  const tenantId = await getActiveTenantIdForAdmin(admin);
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { tenantId: true },
  });
  if (!raffle || raffle.tenantId !== tenantId) {
    throw new ForbiddenError();
  }
}
