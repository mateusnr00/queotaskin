// A qual host o otimizador do next/image pode ir buscar imagem.
//
// O otimizador responde 400 Bad Request para qualquer host que não esteja em
// images.remotePatterns (ver next.config.ts) — foi o que deixou a capa da
// campanha quebrada mesmo com o upload correto e a URL certa no banco.
//
// As capas enviadas pelo painel vivem no Storage do Supabase e estão na
// lista. Mas o painel também aceita colar uma URL qualquer, e essa pode
// apontar para qualquer lugar da internet. Autorizar "qualquer host" no
// config transformaria o otimizador num proxy aberto de imagens, então em
// vez disso essas são servidas como vieram, sem otimização.

function hostDoSupabase(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

const SUPABASE_HOST = hostDoSupabase();

/**
 * true quando a URL pode passar pelo otimizador do Next. Na dúvida devolve
 * false: imagem sem otimizar aparece, imagem com 400 não.
 */
export function podeOtimizar(url: string): boolean {
  if (!SUPABASE_HOST) return false;
  try {
    return new URL(url).hostname === SUPABASE_HOST;
  } catch {
    // Caminho relativo (/algo.png) é servido pela própria aplicação.
    return url.startsWith("/");
  }
}
