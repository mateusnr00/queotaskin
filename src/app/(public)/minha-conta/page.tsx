import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AlertTriangle, TicketCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";
import { STEAM_DELIVERY_NOTICE } from "@/lib/cs2";
import { formatPhone } from "@/lib/cpf";
import { SteamTradeUrlForm } from "@/components/forms/steam-trade-url-form";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Minha conta" };

// Área da conta do participante. O único dado editável aqui é o link de
// troca da Steam — é por ele que a skin ganha chega. Nome e celular são o
// próprio login (passwordless), então mudá-los trocaria as credenciais;
// isso fica com o admin.
export default async function MyAccountPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?redirect=/minha-conta");
  }

  const tenant = await getCurrentTenant();
  if (!tenant) notFound();

  // TenantContext é enxuto de propósito (cacheado por request). O aviso de
  // entrega é específico desta página, então vem numa query própria.
  const settings = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { steamDeliveryNotice: true },
  });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      phone: true,
      email: true,
      steamTradeUrl: true,
      steamId: true,
      createdAt: true,
    },
  });
  if (!user) notFound();

  const paidReservations = await prisma.reservation.count({
    where: {
      userId: session.user.id,
      status: "PAID",
      raffle: { tenantId: tenant.id },
    },
  });

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4 py-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Minha conta</h1>
        <p className="text-sm text-muted-foreground">
          Olá, {user.name.split(" ")[0]}! Mantenha seus dados de entrega em dia.
        </p>
      </header>

      {!user.steamTradeUrl && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="text-sm">
            <p className="font-semibold text-amber-700 dark:text-amber-300">
              Falta o seu link de troca da Steam
            </p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              Sem ele não conseguimos enviar a skin caso você seja sorteado.
              Leva 30 segundos para cadastrar.
            </p>
          </div>
        </div>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-1 text-base font-bold">Entrega na Steam</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {settings?.steamDeliveryNotice || STEAM_DELIVERY_NOTICE}
        </p>
        <SteamTradeUrlForm
          current={user.steamTradeUrl}
          notice="Steam → Inventário → Ofertas de troca → Quem pode enviar ofertas."
        />
        {user.steamId && (
          <p className="mt-3 text-xs text-muted-foreground">
            SteamID64 identificado:{" "}
            <span className="font-mono">{user.steamId}</span>
          </p>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-base font-bold">Dados de acesso</h2>
        <dl className="grid gap-2 sm:grid-cols-2">
          <Row label="Nome" value={user.name} />
          <Row label="Celular" value={user.phone ? formatPhone(user.phone) : "—"} />
          <Row label="E-mail" value={user.email ?? "—"} />
          <Row label="Campanhas pagas" value={String(paidReservations)} />
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Seu login é feito com nome + celular. Para corrigir algum desses
          dados, fale com o suporte.
        </p>
      </section>

      <Link
        href="/meus-titulos"
        className={cn(buttonVariants({ variant: "outline" }), "w-full")}
      >
        <TicketCheck className="mr-2 h-4 w-4" />
        Ver meus títulos
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <dt className="text-[0.65rem] tracking-wider text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
    </div>
  );
}
