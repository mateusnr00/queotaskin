import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Sparkles } from "lucide-react";

import { RaffleForm } from "@/components/admin/raffle-form";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Novo sorteio" };

export default async function NewRafflePage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const skins = await prisma.skinTemplate.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      skinRarity: true,
      skinWear: true,
      skinValueBrl: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/sorteios"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para sorteios
        </Link>

        <div className="rounded-2xl border bg-gradient-to-br from-card to-muted/30 p-5 md:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">
                Novo sorteio
              </h1>
              <p className="text-sm text-muted-foreground">
                Preencha os dados gerais. Imagens, prêmios e promoções são
                adicionados depois que o sorteio for salvo pela primeira vez.
              </p>
            </div>
          </div>
        </div>
      </div>
      <RaffleForm
        mode={{ kind: "create" }}
        skins={skins.map((sk) => ({
          ...sk,
          skinValueBrl: sk.skinValueBrl ? Number(sk.skinValueBrl) : null,
        }))}
      />
    </div>
  );
}
