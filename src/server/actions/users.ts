"use server";

// Server actions de usuários (admin). Apenas role ADMIN pode chamar.
//
// Regras:
// - Celular e CPF são únicos no banco; conflito devolve erro amigável
//   identificando qual campo está duplicado.
// - Um admin NÃO pode rebaixar a si mesmo (anti-lockout: se for o único
//   admin e mudar de role, ninguém mais consegue entrar no painel).
//
// Não permitimos editar e-mail aqui — login do sistema é por nome+celular,
// e-mail é só contato opcional.

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getAdminOrThrow } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { userEditSchema } from "@/lib/validations/auth";
import type { ActionResult } from "@/server/actions/auth";

export async function updateUserAction(
  raw: unknown
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await getAdminOrThrow();
    const tenantId = await getActiveTenantIdForAdmin(session.user);

    const parsed = userEditSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: "Dados inválidos",
        fieldErrors: parsed.error.flatten().fieldErrors,
      };
    }

    const { id, name, cpf, phone, role } = parsed.data;

    // Anti-lockout: o próprio admin não pode se rebaixar.
    if (session.user.id === id && role !== "ADMIN" && role !== "SUPER_ADMIN") {
      return {
        ok: false,
        error:
          "Você não pode remover o próprio papel de admin. Peça pra outro admin fazer isso.",
      };
    }

    // O usuário editado precisa ter relação com o tenant atual (membro ou
    // comprador). Bloqueia admins de bagunçar contas de outros tenants.
    const target = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        tenantId: true,
        reservations: {
          where: { raffle: { tenantId } },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!target) return { ok: false, error: "Usuário não encontrado" };
    const belongsToTenant =
      target.tenantId === tenantId || target.reservations.length > 0;
    if (!belongsToTenant && session.user.role !== "SUPER_ADMIN") {
      return { ok: false, error: "Usuário não pertence a esse tenant" };
    }

    // Só SUPER_ADMIN pode mudar role. ADMIN comum mantém a role atual.
    const finalRole =
      session.user.role === "SUPER_ADMIN" ? role : target.role;
    // SUPER_ADMIN não pode ser revogado por ADMIN comum (defesa extra).
    if (
      target.role === "SUPER_ADMIN" &&
      finalRole !== "SUPER_ADMIN" &&
      session.user.id !== target.id
    ) {
      return {
        ok: false,
        error: "SUPER_ADMIN só pode ser revogado pelo próprio dono.",
      };
    }

    try {
      await prisma.user.update({
        where: { id },
        data: {
          name,
          cpf: cpf || null,
          phone: phone || null,
          role: finalRole,
          // Se promovendo pra ADMIN/AFFILIATE e ainda não pertence a um tenant,
          // linka ao tenant atual.
          ...((finalRole === "ADMIN" || finalRole === "AFFILIATE") &&
          !target.tenantId
            ? { tenantId }
            : {}),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        // err.meta.target indica qual coluna conflitou (cpf ou phone).
        const target = err.meta?.target;
        const targetStr = Array.isArray(target)
          ? target.join(",")
          : String(target ?? "");
        if (targetStr.includes("phone")) {
          return { ok: false, error: "Celular já está em uso por outra conta" };
        }
        if (targetStr.includes("cpf")) {
          return { ok: false, error: "CPF já está em uso por outra conta" };
        }
        return { ok: false, error: "Já existe um usuário com esses dados" };
      }
      throw err;
    }

    revalidatePath("/admin/usuarios");
    // Clientes é a lista onde essa edição costuma começar (alguém trocou de
    // número e pediu para atualizar); sem isto ela continuaria mostrando o
    // dado antigo depois de salvar.
    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/usuarios/${id}/editar`);

    return { ok: true, data: { id } };
  } catch (err) {
    console.error("[updateUserAction]", err);
    return { ok: false, error: "Erro ao salvar usuário" };
  }
}
