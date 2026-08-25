// Config completa do Auth.js v5 — usa Prisma (Node runtime only).
// Re-exporta `auth`, `signIn`, `signOut` e `handlers` que o app usa em todo lugar.
//
// São DOIS caminhos de entrada, para dois públicos:
//
// 1. "credentials" — participante, sem senha, por nome completo + celular.
//    É o fluxo do site público: pedir senha na hora de comprar derrubaria
//    conversão, e a conta só guarda os próprios títulos.
//
// 2. "admin-password" — quem opera o painel, por e-mail + senha com bcrypt.
//    A conta de admin vê CPF, telefone e pagamento de todos os clientes, e
//    nome + celular do dono são informação pública demais para proteger
//    isso. Só existe no host do painel.
//
// Contas ADMIN e SUPER_ADMIN NÃO entram pelo caminho 1. Sem esse bloqueio a
// senha seria decorativa: bastaria voltar ao formulário do site público.

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import { loginSchema, adminLoginSchema } from "@/lib/validations/auth";

// "  João  da  Silva " → "joão da silva" — usado pra comparar nomes
// digitados pelo usuário sem se importar com maiúsculas ou espaços
// extras. Acentos são preservados (joão ≠ joao) pra não dar falso-positivo.
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

const PAPEIS_DE_PAINEL = new Set(["ADMIN", "SUPER_ADMIN"]);

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

        // Quem opera o painel entra só com senha. Deixar passar aqui
        // anularia a proteção: nome e celular do dono são públicos.
        if (PAPEIS_DE_PAINEL.has(user.role)) return null;

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

    Credentials({
      id: "admin-password",
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });

        // Compara sempre, mesmo sem usuário ou sem hash: um retorno rápido
        // aqui revelaria quais e-mails existem pelo tempo de resposta.
        const hash =
          user?.passwordHash ??
          "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu";
        const senhaConfere = await bcrypt.compare(parsed.data.password, hash);

        if (!user || !user.passwordHash || !senhaConfere) return null;
        if (!PAPEIS_DE_PAINEL.has(user.role)) return null;

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
