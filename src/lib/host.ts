// Regra de "este host é o painel?", num lugar só.
//
// O proxy decide o roteamento por host e a tela de login decide qual
// formulário mostrar. Se cada um carregasse a própria definição, bastaria
// mudar uma para o painel passar a exibir o formulário sem senha, falha
// silenciosa e do lado errado. Por isso a regra vive aqui e é importada
// pelos dois.
//
// Sem Prisma de propósito: o proxy roda em edge runtime, onde não há
// acesso ao banco. A resolução completa do tenant acontece nas páginas.

/** Convenção de subdomínio do painel. */
export function isAdminHost(host: string): boolean {
  const h = host.toLowerCase();
  return h.startsWith("admin.") || h.startsWith("painel.");
}

/**
 * Hosts de desenvolvimento e preview, onde o split não se aplica: ali tudo
 * roda no mesmo endereço e separar quebraria o fluxo de teste.
 *
 * "Dev" NUNCA é inferido só do Host, que o cliente controla. Em produção na
 * Vercel o alias <projeto>.vercel.app é alcançável, e tratá-lo como dev
 * desligaria o split de host, o host-binding da escrita de painel e a recusa
 * de login admin sem senha, abrindo o painel do tenant principal a quem só
 * tem nome+CPF. VERCEL_ENV vem do servidor (não spoofável): em produção
 * nenhum host é "dev", os domínios reais resolvem por TenantHost e o alias
 * .vercel.app simplesmente não resolve. Preview e local seguem com host único.
 */
export function isHostDeDesenvolvimento(host: string): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  const h = host.toLowerCase();
  return (
    h.endsWith(".vercel.app") ||
    h.startsWith("localhost") ||
    h.startsWith("127.0.0.1")
  );
}

/** "admin.queotaskin.com" → "queotaskin.com" */
export function hostPublicoDoAdmin(adminHost: string): string {
  return adminHost.replace(/^(admin|painel)\./i, "");
}

/**
 * Monta uma URL de redirecionamento a partir do que o navegador realmente
 * pediu.
 *
 * `request.nextUrl` carrega o host que o servidor acha que tem, e ele nem
 * sempre é o do navegador: atrás de um proxy sai "localhost:3000", e o
 * usuário é mandado para uma origem que não existe. O cabeçalho Host, e o
 * x-forwarded-proto, quando presente, descrevem a requisição de verdade.
 */
export function urlDaRequisicao(
  request: { nextUrl: URL; headers: Headers },
  pathname: string,
): URL {
  const url = new URL(request.nextUrl.toString());
  url.pathname = pathname;
  url.search = "";
  const host = request.headers.get("host");
  if (host) url.host = host;
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) url.protocol = `${proto.split(",")[0]!.trim()}:`;
  return url;
}
