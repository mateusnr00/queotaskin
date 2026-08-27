"use client";

// Normalização de imagem no navegador, antes do upload.
//
// Por que isso existe: o corpo de uma Server Action é limitado a 1 MB pelo
// Next e a 4,5 MB pela Vercel. Render de skin em PNG passa dos dois com
// facilidade, e o corte acontece no framework, a action nem roda, então a
// validação dela nunca chega a produzir uma mensagem útil. Em vez de brigar
// com o teto, encolhemos o arquivo antes de ele virar requisição.
//
// Efeito colateral bem-vindo: o tipo de saída é sempre image/webp, então o
// arquivo passa por qualquer lista de tipos permitidos no caminho (action e
// bucket), independente do formato que a pessoa escolheu no computador.

const MAX_DIMENSION = 1600;
const TARGET_BYTES = 1_200_000;
// Abaixo disso não vale reencodar: já cabe no envio e mexer só perderia
// qualidade. Um PNG pequeno de logo sai intacto por aqui.
const PASSTHROUGH_BYTES = 400_000;

export interface NormalizeOptions {
  /**
   * Lado maior permitido, em pixels. Sem isto vale MAX_DIMENSION, que serve
   * para capa e foto de catálogo, imagens que aparecem dentro de um card.
   *
   * Fundo de tela é outra coisa: ele é esticado até a largura do monitor, e
   * 1600px num monitor de 2560 é a imagem ampliada em 1,6 vez, que é
   * exatamente a aparência de "sem qualidade".
   */
  ladoMaximo?: number;
  /**
   * Desenha a imagem centralizada num quadro exato deste tamanho, em vez de
   * apenas encolher mantendo a proporção original.
   *
   * É o que faz miniatura e capa terem todas o mesmo formato: sem o quadro,
   * cada foto enviada chega com a proporção que o autor escolheu, e a lista
   * do catálogo vira um mosaico de imagens tortas, umas achatadas e outras
   * espremidas.
   *
   * O que sobra fica transparente, não preto: a moldura tem cor de fundo
   * própria e um preenchimento opaco criaria uma tarja visível em volta da
   * skin.
   */
  quadro?: { largura: number; altura: number };
}

/**
 * Onde desenhar uma imagem de `origem` dentro de `quadro`, cabendo inteira e
 * centralizada.
 *
 * Separada do desenho porque é a única parte com risco de erro: canvas não
 * reclama de coordenada errada, ele desenha torto e o defeito só aparece
 * olhando a imagem. Assim dá para provar a conta sem navegador.
 */
export function encaixarNoQuadro(
  origem: { largura: number; altura: number },
  quadro: { largura: number; altura: number }
): { x: number; y: number; largura: number; altura: number } {
  if (origem.largura <= 0 || origem.altura <= 0) {
    return { x: 0, y: 0, largura: quadro.largura, altura: quadro.altura };
  }
  const escala = Math.min(
    quadro.largura / origem.largura,
    quadro.altura / origem.altura
  );
  const largura = Math.round(origem.largura * escala);
  const altura = Math.round(origem.altura * escala);
  return {
    x: Math.round((quadro.largura - largura) / 2),
    y: Math.round((quadro.altura - altura) / 2),
    largura,
    altura,
  };
}

export interface NormalizeResult {
  file: File;
  /** false = o arquivo original foi mantido como veio. */
  normalized: boolean;
  originalBytes: number;
}

interface Decoded {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

function loadViaImgTag(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode falhou"));
    img.src = url;
  });
}

async function decode(file: File): Promise<Decoded> {
  // createImageBitmap cobre PNG/JPEG/WebP/GIF/AVIF/BMP sem tocar no DOM.
  // SVG fica de fora porque nem todo navegador o aceita por esse caminho.
  if (typeof createImageBitmap === "function" && file.type !== "image/svg+xml") {
    try {
      const bmp = await createImageBitmap(file);
      return {
        source: bmp,
        width: bmp.width,
        height: bmp.height,
        release: () => bmp.close(),
      };
    } catch {
      // Formato que o bitmap não abriu; tenta pelo <img>, que às vezes vai.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await loadViaImgTag(url);
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) throw new Error("dimensões vazias");
    return { source: img, width, height, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(file: File, blob: Blob, ext: string): File {
  const base = file.name.replace(/\.[^.]+$/, "") || "imagem";
  return new File([blob], `${base}.${ext}`, { type: blob.type });
}

/**
 * Reduz e reencoda a imagem para caber no envio. Se qualquer etapa falhar
 * (formato que o navegador não decodifica, canvas indisponível), devolve o
 * arquivo original, quem valida de verdade é o servidor, e é melhor tentar
 * enviar do que barrar aqui.
 */
export async function normalizeImage(
  file: File,
  { quadro, ladoMaximo = MAX_DIMENSION }: NormalizeOptions = {}
): Promise<NormalizeResult> {
  const originalBytes = file.size;
  const keep = (): NormalizeResult => ({ file, normalized: false, originalBytes });

  if (!file.type.startsWith("image/") && !/\.[a-z0-9]+$/i.test(file.name)) {
    return keep();
  }
  // Com quadro pedido, os atalhos abaixo não valem: um arquivo pequeno já
  // caberia no envio, mas continuaria com a proporção errada, que é
  // justamente o que o quadro existe para resolver.
  if (!quadro) {
    // GIF animado perderia o movimento no canvas (só o primeiro quadro sai).
    // Se já cabe no envio, deixa passar inteiro.
    if (file.type === "image/gif" && originalBytes <= TARGET_BYTES) return keep();
    if (originalBytes <= PASSTHROUGH_BYTES && file.type !== "image/svg+xml") {
      return keep();
    }
  }

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    return keep();
  }

  try {
    const canvas = document.createElement("canvas");
    if (quadro) {
      canvas.width = quadro.largura;
      canvas.height = quadro.altura;
    } else {
      const scale = Math.min(
        1,
        ladoMaximo / Math.max(decoded.width, decoded.height)
      );
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return keep();

    if (quadro) {
      // Cabe inteira e centralizada, sem cortar. Preencher o quadro cortando
      // as bordas pareceria melhor numa miniatura e destruiria a arte numa
      // imagem que já vem com moldura e texto, que é o caso das artes de
      // sorteio.
      const dentro = encaixarNoQuadro(
        { largura: decoded.width, altura: decoded.height },
        { largura: canvas.width, altura: canvas.height }
      );
      ctx.drawImage(
        decoded.source,
        dentro.x,
        dentro.y,
        dentro.largura,
        dentro.altura
      );
    } else {
      ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    }

    // WebP preserva transparência, que render de skin costuma ter. Se o
    // navegador não encodar WebP, toBlob devolve PNG e o JPEG entra como
    // segunda tentativa.
    //
    // A escada começa alta quando há quadro pedido, porque ali a imagem é
    // arte de campanha: fundo escuro com gradiente e brilho, onde compressão
    // agressiva vira faixa visível. E custa pouco: medido num quadro
    // 1800x1350 desse tipo, 0.85 dá 37 KB e 0.95 dá 66 KB, os dois muito
    // abaixo do teto de envio. Trocar 29 KB por não ter banda no gradiente é
    // barato.
    //
    // Vale lembrar que esta não é a única perda do caminho: o otimizador do
    // next/image reencoda de novo na hora de servir, e é por isso que a capa
    // pede quality={92} lá (ver next.config.ts).
    const escada = quadro ? [0.95, 0.85, 0.7] : [0.85, 0.7, 0.55];
    for (const quality of escada) {
      const blob = await toBlob(canvas, "image/webp", quality);
      if (blob && blob.type === "image/webp" && blob.size <= TARGET_BYTES) {
        return { file: renamed(file, blob, "webp"), normalized: true, originalBytes };
      }
    }
    const jpeg = await toBlob(canvas, "image/jpeg", 0.82);
    if (jpeg && jpeg.size <= TARGET_BYTES) {
      return { file: renamed(file, jpeg, "jpg"), normalized: true, originalBytes };
    }
    return keep();
  } catch {
    return keep();
  } finally {
    decoded.release();
  }
}
