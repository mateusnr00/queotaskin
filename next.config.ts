import type { NextConfig } from "next";

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
  images: {
    remotePatterns: padroesDeImagem(),
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
