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
//      - Host público: /admin* responde 404, igualzinho a um caminho que
//        não existe. O painel não é anunciado no domínio do participante.
//      - Host admin: só o painel e o que serve pra entrar nele existem.
//        Qualquer outro caminho redireciona pra /admin.
//
//        A regra era o contrário disso: uma lista de rotas públicas
//        conhecidas (/, /sorteios, /s/, /meus-titulos, /comprovante/) que
//        eram mandadas pro painel. Isso funcionava enquanto o sorteio
//        morava em /s/<slug>. Com o sorteio na raiz, o conjunto de
//        caminhos públicos passou a ser aberto: /<qualquer-coisa> é uma
//        campanha. Não dá pra listar o que é público, então lista-se o que
//        é do painel, que é fechado e pequeno.
//
//    Como o proxy roda em edge runtime (sem Prisma), não consultamos a
//    tabela TenantHost aqui, a heurística de prefixo já basta pra
//    decidir o split. A resolução completa do tenant acontece nas pages
//    (via getCurrentTenant()).
//
//    Previews da Vercel (*.vercel.app) e localhost ficam de fora do split
//    pra não atrapalhar dev/preview, todas as rotas seguem no mesmo host.

import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import {
  COOKIE_DE_INDICACAO,
  DIAS_DO_COOKIE_DE_INDICACAO,
  normalizarCodigo,
} from "@/lib/afiliados";
import {
  isAdminHost,
  isHostDeDesenvolvimento,
  urlDaRequisicao,
} from "@/lib/host";

const { auth } = NextAuth(authConfig);

// O que existe no host admin. Tudo o que não casa com esta lista é
// entendido como endereço público (inclusive /<slug> de campanha) e vai
// pro painel.
//
// /login e /trocar-senha ficam porque são o caminho de entrada no painel.
// /api segue porque o cron e os webhooks batem no mesmo deploy, e um
// redirect no lugar de 200 quebraria os dois em silêncio.
const CAMINHOS_DO_PAINEL = [
  "/admin",
  "/login",
  "/trocar-senha",
  "/api",
  "/_next",
];

function ehCaminhoDoPainel(path: string): boolean {
  return CAMINHOS_DO_PAINEL.some(
    (base) => path === base || path.startsWith(`${base}/`),
  );
}

/**
 * Guarda o código de quem indicou, quando ele chega pela URL.
 *
 * A pessoa clica em /?ref=MATEUS7K, olha a campanha, some, e volta três dias
 * depois para criar conta. Sem guardar, o cadastro sairia sem vínculo e quem
 * indicou não receberia nada por um trabalho que fez.
 *
 * Cookie próprio, e não sessionStorage como as marcas de anúncio (lib/utm):
 * aquilo vale uma visita, isto precisa atravessar dias e o fechar do
 * navegador. Trinta dias, lax, e sem httpOnly=false: quem lê é o servidor, no
 * cadastro. Nunca sobrescreve por conta própria um vínculo já existente, e
 * isso é decidido no cadastro, onde o banco sabe quem já tem afiliado.
 */
function guardarIndicacao(req: { nextUrl: URL }, resposta: NextResponse) {
  const bruto = req.nextUrl.searchParams.get("ref");
  if (!bruto) return resposta;
  const codigo = normalizarCodigo(bruto);
  if (!codigo) return resposta;

  resposta.cookies.set(COOKIE_DE_INDICACAO, codigo, {
    maxAge: DIAS_DO_COOKIE_DE_INDICACAO * 24 * 60 * 60,
    sameSite: "lax",
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return resposta;
}

export default auth((req) => {
  const url = req.nextUrl;

  const host = (req.headers.get("host") ?? "").toLowerCase();
  if (isHostDeDesenvolvimento(host)) {
    // O cookie de indicação vem ANTES do desvio de desenvolvimento: em dev
    // tudo roda num host só, e sair daqui cedo demais deixaria o link de
    // afiliado sem efeito justamente onde ele é testado.
    return guardarIndicacao(req, NextResponse.next());
  }

  const adminHost = isAdminHost(host);
  const path = url.pathname;
  const isAdminPath = path.startsWith("/admin");

  if (adminHost) {
    // Cadastro não existe no painel: conta de admin é criada por quem já
    // opera, nunca por auto-serviço. Deixar /registro aberto aqui permitiria
    // criar conta pelo endereço do painel. Vem antes do desvio geral porque
    // mandar pra /login é mais útil que mandar pro painel de quem nem entrou.
    if (path === "/registro") {
      return NextResponse.redirect(urlDaRequisicao(req, "/login"));
    }
    if (!ehCaminhoDoPainel(path)) {
      return NextResponse.redirect(urlDaRequisicao(req, "/admin"));
    }
    return NextResponse.next();
  }

  // No host público, /admin* NÃO EXISTE. Nem redireciona.
  //
  // Redirecionava para admin.<host>, para a pessoa logada continuar a
  // navegação sem fricção, e o preço disso era entregar o endereço do painel a
  // qualquer um que digitasse /admin no site: o navegador ia para
  // admin.<domínio> e a barra de endereços passava a mostrar onde fica a porta
  // de entrada. Quem cuida do painel já sabe o endereço e o tem salvo; para
  // todo o resto, saber que ele existe só serve para tentar entrar.
  //
  // A resposta é a mesma de qualquer caminho inexistente: 404, sem cabeçalho,
  // sem redirect, sem diferença entre "/admin" e "/qualquer-coisa". Isso vale
  // inclusive para quem está logado como admin, porque o navegador de quem
  // olha por cima do ombro não sabe quem está logado.
  if (isAdminPath) {
    // 404 direto, e não um rewrite para a página de erro do app.
    //
    // Rewrite exige URL ABSOLUTA (o Next recusa caminho relativo), e a origem
    // que ela carrega decide se o pedido é resolvido aqui dentro ou buscado
    // como se fosse outro servidor. Quando o AUTH_URL aponta para o host do
    // painel, tanto `req.url` quanto `req.nextUrl` saem com aquela origem, e o
    // Next tenta buscar /_not-found no OUTRO domínio: sai 500 em vez de 404,
    // conferido aqui. Numa rota que existe para esconder o painel, um 500
    // entrega justamente o que o 404 esconderia.
    //
    // O preço é o corpo vazio: um caminho que não existe devolve a página de
    // erro desenhada, e este devolve nada. Quem estiver sondando percebe a
    // diferença, mas o que ele queria (o endereço do painel) não está em lugar
    // nenhum da resposta.
    return new NextResponse(null, { status: 404 });
  }

  return guardarIndicacao(req, NextResponse.next());
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
