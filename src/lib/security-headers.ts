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
    `img-src 'self' data: blob: ${supabase} https://*.supabase.co`,
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
