// Config "edge-safe" do Auth.js v5: NÃO importa Prisma nem bcrypt (que não rodam
// no edge runtime do Next.js). Usado pelo middleware. O auth.ts completo herda
// esta config e adiciona o adapter Prisma + provider Credentials.
//
// Padrão recomendado pela própria doc do NextAuth v5.

import type { NextAuthConfig } from "next-auth";

import { isAdminHost, urlDaRequisicao } from "@/lib/host";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  // Sessão de 30 dias: o participante loga uma vez e permanece por um mês
  // sem precisar reentrar (produto pediu login longo). updateAge de 1 dia faz
  // o token ser renovado no máximo uma vez por dia enquanto ativo.
  // Obs.: vale também para contas de painel; se um dia quiser uma janela mais
  // curta para admin, dá pra encurtar por role no callback de sessão.
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 dias
    updateAge: 24 * 60 * 60, // 1 dia
  },
  callbacks: {
    // Roda em TODA request graças ao middleware, decide se a URL pode passar.
    // Aqui o middleware roda em edge runtime (sem Prisma), então só conferimos
    // se está logado. A checagem de role ADMIN é feita a nível de página via
    // `requireAdmin()` (que consulta o banco), isso garante que promoções
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

      // Quem já está logado não vê login/registro de novo. O destino sai do
      // Host da requisição, não de request.nextUrl: atrás de proxy aquele
      // vira "localhost:3000" e o redirect cai numa origem inexistente.
      //
      // No host do painel o destino é /admin, mandar para "/" ali só
      // provoca um segundo salto, porque a raiz do painel volta para /admin.
      if (isAuthRoute && isLoggedIn) {
        const host = request.headers.get("host") ?? "";
        return Response.redirect(
          urlDaRequisicao(request, isAdminHost(host) ? "/admin" : "/")
        );
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
