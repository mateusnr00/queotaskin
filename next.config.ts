import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

// O otimizador do next/image só busca imagem de host autorizado; qualquer
// outro responde 400, e a capa aparece quebrada na página. As capas enviadas
// pelo painel ficam no Storage do Supabase, então é esse host que entra aqui,
// restrito ao caminho dos objetos públicos.
function padroesDeImagem() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const pathname = "/storage/v1/object/public/**";
  if (raw) {
    try {
      const { hostname } = new URL(raw);
      return [{ protocol: "https" as const, hostname, pathname }];
    } catch {
      // URL malformada na variável; cai no curinga abaixo.
    }
  }
  // Sem a variável no momento do build (preview, por exemplo) o host exato é
  // desconhecido. O curinga mantém as capas funcionando sem abrir o
  // otimizador para a internet inteira.
  return [{ protocol: "https" as const, hostname: "*.supabase.co", pathname }];
}

const nextConfig: NextConfig = {
  // O sorteio morava em /s/<slug> e passou a morar em /<slug>. Todo endereço
  // já divulgado (story, print, mensagem encaminhada) aponta para o antigo, e
  // link de campanha em rifa circula por semanas depois de publicado. O 301
  // mantém esses links abrindo e diz ao buscador que o endereço mudou de vez.
  //
  // "s" continua na lista de slugs reservados justamente por isto: se um dia
  // uma campanha nascesse com esse slug, ela ficaria presa atrás do redirect.
  async redirects() {
    return [
      { source: "/s/:slug", destination: "/:slug", permanent: true },
    ];
  },
  images: {
    remotePatterns: padroesDeImagem(),
    // A capa da campanha é arte, não foto de catálogo: fundo escuro com
    // gradiente e brilho, que é justamente onde compressão agressiva vira
    // faixa visível. Ela pede 92.
    //
    // A lista precisa existir. No Next 16 o padrão de images.qualities passou
    // a ser [75], e quality fora da lista não dá erro: é rebaixado para o
    // valor mais próximo. Sem isso o quality={92} da capa viraria 75 em
    // silêncio e o ajuste não faria nada.
    //
    // 75 fica porque é o padrão de todo o resto do site, onde ele serve bem.
    qualities: [75, 92],
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders(process.env.VERCEL_ENV === "production") },
    ];
  },
  experimental: {
    serverActions: {
      // O padrão do Next é 1 MB, o que rejeitava foto de skin antes mesmo
      // de a action rodar. A Vercel corta em 4,5 MB de qualquer jeito, então
      // 4 MB é o máximo útil aqui. O cliente ainda encolhe antes de enviar
      // (src/lib/image-normalize.ts); esta folga é para quando não dá.
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
