import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { requireAdmin } from "@/lib/auth-helpers";
import { UserCreateForm } from "@/components/admin/user-create-form";

export const metadata: Metadata = { title: "Nova conta" };

export default async function NovoUsuarioPage() {
  const session = await requireAdmin();

  return (
    <div className="space-y-6">
      <Link
        href="/admin/clientes"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Voltar para clientes
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Nova conta
        </h1>
        <p className="text-sm text-muted-foreground">
          Cadastre um cliente à mão ou dê acesso ao painel para alguém da
          equipe.
        </p>
      </div>

      <UserCreateForm souDono={session.user.role === "SUPER_ADMIN"} />
    </div>
  );
}
