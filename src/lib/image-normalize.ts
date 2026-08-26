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
export async function normalizeImage(file: File): Promise<NormalizeResult> {
  const originalBytes = file.size;
  const keep = (): NormalizeResult => ({ file, normalized: false, originalBytes });

  if (!file.type.startsWith("image/") && !/\.[a-z0-9]+$/i.test(file.name)) {
    return keep();
  }
  // GIF animado perderia o movimento no canvas (só o primeiro quadro sai).
  // Se já cabe no envio, deixa passar inteiro.
  if (file.type === "image/gif" && originalBytes <= TARGET_BYTES) return keep();
  if (originalBytes <= PASSTHROUGH_BYTES && file.type !== "image/svg+xml") {
    return keep();
  }

  let decoded: Decoded;
  try {
    decoded = await decode(file);
  } catch {
    return keep();
  }

  try {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return keep();
    ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    // WebP preserva transparência, que render de skin costuma ter. Se o
    // navegador não encodar WebP, toBlob devolve PNG e o JPEG entra como
    // segunda tentativa.
    for (const quality of [0.85, 0.7, 0.55]) {
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
