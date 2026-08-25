// Config "edge-safe" do Auth.js v5: NÃO importa Prisma nem bcrypt (que não rodam
// no edge runtime do Next.js). Usado pelo middleware. O auth.ts completo herda
// esta config e adiciona o adapter Prisma + provider Credentials.
//
// Padrão recomendado pela própria doc do NextAuth v5.

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Roda em TODA request graças ao middleware — decide se a URL pode passar.
    // Aqui o middleware roda em edge runtime (sem Prisma), então só conferimos
    // se está logado. A checagem de role ADMIN é feita a nível de página via
    // `requireAdmin()` (que consulta o banco) — isso garante que promoções
    // valem imediatamente, sem o usuário precisar relogar.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;

      const isAdminRoute = pathname.startsWith("/admin");
      const isAuthRoute =
        pathname === "/login" || pathname === "/registro";

      if (isAdminRoute) {
        return isLoggedIn;
      }

      // Quem já está logado não vê login/registro de novo.
      if (isAuthRoute && isLoggedIn) {
        return Response.redirect(new URL("/", request.nextUrl));
      }

      return true;
    },
    // Copia id/role/tenantId do User para o JWT.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId ?? null;
      }
      return token;
    },
    // Expõe id/role/tenantId na session que o app consome via auth().
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as
          | "SUPER_ADMIN"
          | "ADMIN"
          | "AFFILIATE"
          | "PARTICIPANT";
        session.user.tenantId =
          (token.tenantId as string | null | undefined) ?? null;
      }
      return session;
    },
  },
  providers: [], // sobrescrito no auth.ts (Node runtime)
} satisfies NextAuthConfig;
