"use server";

// Server Actions de autenticação. Fluxo PASSWORDLESS por nome + celular:
// - registerAction: cria conta com {name, cpf, phone}. Sem senha, sem e-mail.
//   O CPF é digitado pelo usuário (validado por dígito verificador) e gravado
//   no User.cpf — alimenta o PIX. Não é exibido na UI depois do cadastro.
// - loginAction: autentica via nome + CPF. Sem senha.
// - logoutAction: derruba a sessão.
//
// Server Actions = funções TS que rodam SEMPRE no servidor, mesmo quando
// chamadas a partir de componentes client. CSRF é tratado nativamente.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { auth, signIn, signOut } from "@/auth";
import bcrypt from "bcryptjs";
import {
  registerSchema,
  loginSchema,
  adminLoginSchema,
  changePasswordSchema,
} from "@/lib/validations/auth";

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// Cria nova conta de PARTICIPANT. NÃO loga automaticamente; o componente
// chama loginAction logo depois com os mesmos dados.
export async function registerAction(
  raw: unknown
): Promise<ActionResult<{ userId: string }>> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { name, cpf, phone } = parsed.data;

  try {
    const user = await prisma.user.create({
      data: {
        name,
        cpf,
        phone,
        role: "PARTICIPANT",
      },
      select: { id: true },
    });
    return { ok: true, data: { userId: user.id } };
  } catch (err) {
    // P2002 = unique constraint violation. Phone e cpf são unique.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const target = err.meta?.target;
      const targetStr = Array.isArray(target)
        ? target.join(",")
        : String(target ?? "");
      if (targetStr.includes("phone")) {
        return {
          ok: false,
          error: "Celular já cadastrado. Tente entrar em vez de criar conta.",
        };
      }
      if (targetStr.includes("cpf")) {
        return {
          ok: false,
          error: "Já existe uma conta com esses dados.",
        };
      }
      return { ok: false, error: "Já existe uma conta com esses dados." };
    }
    console.error("[registerAction] erro criando user:", err);
    return { ok: false, error: "Erro ao criar conta" };
  }
}

// Login passwordless via nome + celular. O provider Credentials no auth.ts
// busca pelo celular e confere o nome — sem senha.
export async function loginAction(
  raw: unknown
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Nome ou CPF inválido",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await signIn("credentials", {
      name: parsed.data.name,
      cpf: parsed.data.cpf,
      redirect: false,
    });
    return { ok: true, data: undefined };
  } catch {
    // Sem log do erro: o objeto de credenciais carrega o CPF.
    return { ok: false, error: "Nome ou CPF não encontrado" };
  }
}

// Entrada do painel. Mensagem de erro única de propósito: dizer "e-mail não
// encontrado" entregaria quais contas existem para quem estivesse testando.
export async function adminLoginAction(raw: unknown): Promise<ActionResult> {
  const parsed = adminLoginSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "E-mail ou senha inválidos" };
  }

  try {
    await signIn("admin-password", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
    return { ok: true, data: undefined };
  } catch {
    // Não loga o erro com os dados: a senha vem no objeto de credenciais.
    return { ok: false, error: "E-mail ou senha inválidos" };
  }
}

// Troca da própria senha. Exige a atual mesmo com sessão válida — sessão
// roubada não deve conseguir trocar a senha e trancar o dono para fora.
export async function changeOwnPasswordAction(
  raw: unknown
): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Sessão expirada. Entre de novo." };

  const parsed = changePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, passwordHash: true },
  });
  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return { ok: false, error: "Sem permissão" };
  }
  if (!user.passwordHash) {
    return { ok: false, error: "Esta conta ainda não tem senha definida" };
  }

  const confere = await bcrypt.compare(
    parsed.data.currentPassword,
    user.passwordHash
  );
  if (!confere) return { ok: false, error: "Senha atual incorreta" };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
      mustChangePassword: false,
    },
  });

  return { ok: true, data: undefined };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
