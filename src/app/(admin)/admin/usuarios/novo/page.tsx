import Link from "next/link";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { ChevronLeft, UserPlus } from "lucide-react";

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
        <CabecalhoDeAdmin
          etiqueta="Acessos"
          icone={<UserPlus aria-hidden className="h-3 w-3" />}
          titulo="Nova conta"
          descricao="Cadastre um cliente à mão ou dê acesso ao painel para alguém da equipe."
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Usuários", href: "/admin/usuarios" },
            { rotulo: "Nova conta" },
          ]}
        />
      </div>

      <UserCreateForm souDono={session.user.role === "SUPER_ADMIN"} />
    </div>
  );
}
