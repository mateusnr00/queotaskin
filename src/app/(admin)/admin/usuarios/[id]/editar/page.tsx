import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ChevronLeft } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { UserEditForm } from "@/components/admin/user-edit-form";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Editar usuário" };

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      cpf: true,
      phone: true,
      role: true,
      email: true,
      passwordHash: true,
      showModBadge: true,
      tenantId: true,
      createdAt: true,
      _count: { select: { reservations: true } },
      reservations: {
        where: { raffle: { tenantId } },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!user) notFound();
  // Só permite editar se o user pertence ao tenant atual (membro ou
  // já comprou em alguma rifa), exceto SUPER_ADMIN que vê todos.
  const belongsToTenant =
    user.tenantId === tenantId || user.reservations.length > 0;
  if (!belongsToTenant && session.user.role !== "SUPER_ADMIN") {
    notFound();
  }

  // Conta sem CPF (criada antes do passwordless por CPF): admin precisa
  // preencher um CPF válido antes de salvar, o schema exige.
  const isSelf = session?.user?.id === user.id;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/usuarios"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{user.name}</h1>
        <p className="text-sm text-muted-foreground">
          {user._count.reservations} reserva(s) · cadastrado em{" "}
          {formatDateTime(user.createdAt)}
          {user.email ? ` · ${user.email}` : ""}
        </p>
      </div>

      <UserEditForm
        isSelf={isSelf}
        souDono={session.user.role === "SUPER_ADMIN"}
        temSenha={Boolean(user.passwordHash)}
        defaultValues={{
          id: user.id,
          name: user.name,
          email: user.email ?? "",
          cpf: user.cpf ?? "",
          phone: user.phone ?? "",
          role: user.role,
          showModBadge: user.showModBadge,
        }}
      />
    </div>
  );
}
