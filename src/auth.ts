// Config completa do Auth.js v5 — usa Prisma (Node runtime only).
// Re-exporta `auth`, `signIn`, `signOut` e `handlers` que o app usa em todo lugar.
//
// Autenticação é PASSWORDLESS por nome completo + celular: o provider
// Credentials recebe os dois, busca o usuário pelo celular (que é único)
// e confere se o nome bate (case-insensitive, espaços normalizados). Sem
// bcrypt, sem senha — funciona como "login e senha" pro usuário.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";

import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { loginSchema } from "@/lib/validations/auth";

// "  João  da  Silva " → "joão da silva" — usado pra comparar nomes
// digitados pelo usuário sem se importar com maiúsculas ou espaços
// extras. Acentos são preservados (joão ≠ joao) pra não dar falso-positivo.
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      credentials: {
        name: { label: "Nome completo", type: "text" },
        phone: { label: "Celular", type: "tel" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { phone: parsed.data.phone },
        });
        if (!user) return null;

        // Celular bate — agora confere o nome (case-insensitive).
        if (normalizeName(user.name) !== normalizeName(parsed.data.name)) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          image: user.image,
        };
      },
    }),
  ],
});
