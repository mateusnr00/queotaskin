import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
