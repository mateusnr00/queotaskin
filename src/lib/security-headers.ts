// Cabecalhos de seguranca (P1-C §66/§67, fecha F-06). Testavel: next.config
// usa securityHeaders(). CSP em modo compativel com o Next (app router precisa
// de inline para script/style de bootstrap; documentado). frame-ancestors
// substitui X-Frame-Options; object-src/base-uri fecham vetores classicos.
export function securityHeaders(ehProd: boolean): { key: string; value: string }[] {
  const supabase = (() => {
    try { return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "https://*.supabase.co"; }
    catch { return "https://*.supabase.co"; }
  })();

  // 'unsafe-inline' em script/style e inevitavel no Next atual (bootstrap
  // inline sem nonce no app router); documentado. Sem 'unsafe-eval'.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    // Steam CDN: as artes das skins (catálogo, prêmios, títulos premiados) são
    // servidas pelo CDN da Steam - hoje community.akamai.steamstatic.com, além
    // das variantes cloudflare/fastly (*.steamstatic.com) e do legado
    // *.akamaihd.net. Sem liberá-las aqui, o CSP bloqueia TODAS as imagens de
    // skin no navegador e elas somem (a URL continua no banco).
    //
    // HLTV CDN (img-cdn.hltv.org): é onde moram os escudos dos times de CS2
    // (Team.escudo). Quase todos os 46 times apontam para lá; alguns escudos
    // enviados pelo admin ficam no Storage do Supabase (já liberado acima).
    // Sem este host, o navegador bloqueava TODO escudo e o emblema caía na
    // TAG de reserva - foi assim que "os logos dos times sumiram".
    `img-src 'self' data: blob: ${supabase} https://*.supabase.co https://*.steamstatic.com https://*.akamaihd.net https://img-cdn.hltv.org`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self' ${supabase} https://*.supabase.co`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  const headers = [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    { key: "X-Frame-Options", value: "DENY" },
  ];
  if (ehProd) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" });
  }
  return headers;
}
