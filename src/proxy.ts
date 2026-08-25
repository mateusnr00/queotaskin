// Next.js 16 renomeou "middleware" → "proxy". O arquivo deve estar em
// src/proxy.ts (App Router) ou app/proxy.ts e exportar default uma função
// que recebe um Request e retorna um Response (ou Next.js MiddlewareResponse).
//
// Responsabilidades:
//
// 1. Auth (NextAuth v5). A regra de "logado vs não logado vs admin" vive em
//    src/auth.config.ts (callback authorized).
//
// 2. Separação por host (multi-tenant). A plataforma roda como vários sites
//    distintos no mesmo deploy. Cada tenant tem um host público
//    (sorteios.vip, dominio-do-andre.com) e um host admin
//    (admin.sorteios.vip, admin.dominio-do-andre.com).
//
//    Convenção: hosts admin começam com "admin." ou "painel.". Tudo o que
//    não começa assim é considerado host público.
//
//      - Host público: /admin* redireciona pro host admin equivalente
//        (admin.<rest>) pra esconder a existência do painel no domínio
//        do participante.
//      - Host admin: rotas públicas (/, /sorteios, /s/, /meus-titulos,
//        /comprovante/) redirecionam pra /admin. Login/registro continuam
//        acessíveis — são necessários pra autenticar antes do painel.
//
//    Como o proxy roda em edge runtime (sem Prisma), não consultamos a
//    tabela TenantHost aqui — a heurística de prefixo já basta pra
//    decidir o split. A resolução completa do tenant acontece nas pages
//    (via getCurrentTenant()).
//
//    Previews da Vercel (*.vercel.app) e localhost ficam de fora do split
//    pra não atrapalhar dev/preview — todas as rotas seguem no mesmo host.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import {
  hostAdminDoPublico,
  isAdminHost,
  isHostDeDesenvolvimento,
  urlDaRequisicao,
} from "@/lib/host";

const { auth } = NextAuth(authConfig);

// Rotas públicas que NÃO devem existir no host admin — quando o usuário
// digita uma delas em admin.<dominio>, joga ele pra /admin.
const PUBLIC_ROUTE_PREFIXES = [
  "/sorteios",
  "/s/",
  "/meus-titulos",
  "/comprovante/",
];

export default auth((req) => {
  const url = req.nextUrl;

  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (isHostDeDesenvolvimento(host)) {
    return NextResponse.next();
  }

  const adminHost = isAdminHost(host);
  const path = url.pathname;
  const isAdminPath = path.startsWith("/admin");

  if (adminHost) {
    // No host admin, qualquer rota pública vira /admin. Login e registro
    // continuam funcionando, são necessários pra autenticar antes do
    // painel.
    const isPublicRoute =
      path === "/" ||
      PUBLIC_ROUTE_PREFIXES.some((p) => path.startsWith(p));
    if (isPublicRoute) {
      return NextResponse.redirect(urlDaRequisicao(req, "/admin"));
    }
    // Cadastro não existe no painel: conta de admin é criada por quem já
    // opera, nunca por auto-serviço. Deixar /registro aberto aqui permitiria
    // criar conta pelo endereço do painel.
    if (path === "/registro") {
      return NextResponse.redirect(urlDaRequisicao(req, "/login"));
    }
    return NextResponse.next();
  }

  // No host público, /admin* redireciona pra admin.<host> pra a pessoa
  // logada continuar a navegação sem fricção.
  if (isAdminPath) {
    const target = urlDaRequisicao(req, path);
    target.host = hostAdminDoPublico(host);
    // O caminho do painel costuma carregar querystring útil (filtros,
    // paginação); ao contrário dos outros redirects, aqui ela é preservada.
    target.search = url.search;
    return NextResponse.redirect(target);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
