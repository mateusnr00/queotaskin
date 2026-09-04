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
  /** Id do pixel da Meta, ou null. Vazio desliga o rastreamento. */
  metaPixelId: string | null;
  /** Google Analytics 4, ou null. */
  googleAnalyticsId: string | null;
  /** Pixel do TikTok, ou null. */
  tiktokPixelId: string | null;
};

async function readHost(): Promise<string> {
  const h = await headers();
  // A porta sai: TenantHost guarda o domínio puro ("queotaskin.com"), e um
  // host com porta nunca casaria com o registro. Só aparece fora da Vercel,
  // em teste local com domínio real por exemplo, mas o lookup falhando
  // devolve 404 em toda página, o que é um jeito ruim de descobrir isso.
  return (h.get("host") ?? "")
    .toLowerCase()
    .trim()
    .replace(/:\d+$/, "");
}

// Lookup do tenant pelo host. Cached por request, múltiplas chamadas no
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
      metaPixelId: fallback.metaPixelId,
      googleAnalyticsId: fallback.googleAnalyticsId,
      tiktokPixelId: fallback.tiktokPixelId,
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
    metaPixelId: tenantHost.tenant.metaPixelId,
    googleAnalyticsId: tenantHost.tenant.googleAnalyticsId,
    tiktokPixelId: tenantHost.tenant.tiktokPixelId,
  };
});

// Resolve o id do tenant a partir de um host CRU (string), sem depender de
// next/headers. Serve dentro do authorize do Auth.js, onde só existe o header
// Host da conexão (confiável, não é corpo controlado por quem chama) e não o
// contexto de request do App Router.
//
// Dev/preview/teste (localhost, *.vercel.app, host vazio) devolve null: ali
// não há TenantHost cadastrado, e o login por CPF+nome não deve ficar preso a
// uma amarra de tenant que só existe em produção. Em produção, host sem
// registro também devolve null (nenhum tenant a amarrar).
export async function tenantIdDoHost(host: string | null | undefined): Promise<string | null> {
  const limpo = (host ?? "").toLowerCase().trim().replace(/:\d+$/, "");
  if (!limpo || isHostDeDesenvolvimento(limpo)) return null;
  const th = await prisma.tenantHost.findUnique({
    where: { host: limpo },
    select: { tenantId: true },
  });
  return th?.tenantId ?? null;
}

// Mesma coisa, mas garante que existe, lança se não achou. Útil em
// páginas que sabidamente só fazem sentido com tenant resolvido.
export async function getCurrentTenantOrThrow(): Promise<TenantContext> {
  const t = await getCurrentTenant();
  if (!t) {
    throw new Error("Tenant não encontrado pra esse host");
  }
  return t;
}

// Heurística pra detectar host admin sem consultar o banco, usada no
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

  // Operação de painel exige o HOST do painel. No host público a sessão por
  // nome+CPF reconhece o admin (para comprar e, no futuro, o botão de print
  // da campanha), mas não autoriza escrita de painel: senão a senha do
  // painel seria decorativa: bastaria nome+CPF, que são semipúblicos no
  // Brasil, para reescrever config, pagamento e usuários. Dev/preview roda
  // tudo num host só, então a exigência não se aplica ali.
  if (!isHostDeDesenvolvimento(tenant.host) && tenant.hostKind !== "ADMIN") {
    throw new ForbiddenError();
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
): Promise<string> {
  const tenantId = await getActiveTenantIdForAdmin(admin);
  const raffle = await prisma.raffle.findUnique({
    where: { id: raffleId },
    select: { tenantId: true },
  });
  if (!raffle || raffle.tenantId !== tenantId) {
    throw new ForbiddenError();
  }
  // Devolve o tenant em vez de descartá-lo. Quem chama quase sempre precisa
  // dele logo depois, e buscar de novo pagaria outra consulta e poria uma
  // chamada que pode lançar no meio de um caminho que já deu certo.
  return tenantId;
}
