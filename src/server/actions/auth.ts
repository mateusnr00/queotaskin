"use server";

// Server Actions de autenticação. Fluxo PASSWORDLESS por nome + celular:
// - registerAction: cria conta com {name, cpf, phone}. Sem senha, sem e-mail.
//   O CPF é digitado pelo usuário (validado por dígito verificador) e gravado
//   no User.cpf — alimenta o PIX. Não é exibido na UI depois do cadastro.
// - loginAction: autentica via nome + celular. Sem senha.
// - logoutAction: derruba a sessão.
//
// Server Actions = funções TS que rodam SEMPRE no servidor, mesmo quando
// chamadas a partir de componentes client. CSRF é tratado nativamente.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { signIn, signOut } from "@/auth";
import { registerSchema, loginSchema } from "@/lib/validations/auth";

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
      error: "Nome ou celular inválido",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await signIn("credentials", {
      name: parsed.data.name,
      phone: parsed.data.phone,
      redirect: false,
    });
    return { ok: true, data: undefined };
  } catch (err) {
    console.error("[loginAction] falha:", err);
    return { ok: false, error: "Nome ou celular não encontrado" };
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/" });
}
