// Helpers de armazenamento de imagens, usa Supabase Storage com a service
// role key (server-only). Bucket configurado via SUPABASE_STORAGE_BUCKET.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

let cached: SupabaseClient | null = null;

// Strip BOM (U+FEFF) e whitespace das envs. Sem isso, um valor colado
// no painel da Vercel a partir de um arquivo com BOM gera o erro
// "Cannot convert argument to a ByteString because the character at
// index 0 has a value of 65279" no upload, porque o cliente Supabase
// usa essas strings como header HTTP (latin1 only).
function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const cleaned = raw.replace(/^\uFEFF/, "").trim();
  return cleaned || undefined;
}

function getStorageClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = readEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false },
  });
  return cached;
}

export function isStorageConfigured(): boolean {
  return Boolean(
    readEnv("NEXT_PUBLIC_SUPABASE_URL") &&
      readEnv("SUPABASE_SERVICE_ROLE_KEY") &&
      readEnv("SUPABASE_STORAGE_BUCKET")
  );
}

export async function uploadRaffleImage(
  raffleId: string,
  file: File
): Promise<{ url: string; path: string }> {
  return uploadImagem(`raffles/${raffleId}`, file);
}

/**
 * Envia uma imagem para uma pasta qualquer do bucket.
 *
 * Nasceu quando o escudo de time precisou subir: a função anterior cravava
 * `raffles/<id>/` no caminho, e escudo não é imagem de campanha. Em vez de uma
 * segunda função com as mesmas checagens copiadas, esta virou a de baixo e a
 * de campanha passou a chamá-la. Checagem de segurança duplicada é checagem
 * que um dia diverge.
 *
 * @param pasta Prefixo no bucket, sem barra no fim. Ex.: "times".
 */
export async function uploadImagem(
  pasta: string,
  file: File
): Promise<{ url: string; path: string }> {
  const client = getStorageClient();
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  if (!client || !bucket) {
    throw new Error(
      "Storage não configurado. Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET."
    );
  }

  // SVG é imagem, mas carrega conteúdo ativo (<script>, onload). Servido do
  // bucket como image/svg+xml, executaria se aberto direto numa aba. A arte de
  // capa/skin não precisa de SVG, então recusamos aqui, no ponto único por
  // onde todo upload passa.
  if (
    file.type.toLowerCase() === "image/svg+xml" ||
    file.name.toLowerCase().endsWith(".svg")
  ) {
    throw new Error("Imagens SVG não são aceitas. Envie PNG, JPG ou WebP.");
  }

  const ext = guessExtension(file);
  const path = `${pasta}/${nanoid(10)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType: guessContentType(file),
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/**
 * Envia um áudio para uma pasta do bucket.
 *
 * Separada de uploadImagem de propósito: o que se aceita aqui é outra lista,
 * e o motivo é o mesmo que recusa SVG lá. O bucket é público e serve o
 * arquivo com o tipo que a gente mandar; aceitar "qualquer coisa que o
 * navegador chamou de áudio" deixaria subir um HTML servido como HTML no
 * nosso domínio de storage. Por isso a extensão manda, e é uma lista curta.
 */
const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
};

/** As extensões que o upload de áudio aceita, para a mensagem e o `accept`. */
export const EXTENSOES_DE_AUDIO = Object.keys(AUDIO_MIME);

export async function uploadAudio(
  pasta: string,
  file: File,
): Promise<{ url: string; path: string }> {
  const client = getStorageClient();
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  if (!client || !bucket) {
    throw new Error(
      "Storage não configurado. Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET.",
    );
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const contentType = AUDIO_MIME[ext];
  if (!contentType) {
    throw new Error(
      `Formato de áudio não aceito. Envie ${EXTENSOES_DE_AUDIO.join(", ")}.`,
    );
  }

  const path = `${pasta}/${nanoid(10)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw new Error(`Falha no upload: ${error.message}`);

  const { data } = client.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

export async function deleteRaffleImage(path: string): Promise<void> {
  const client = getStorageClient();
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  if (!client || !bucket) return; // best-effort
  await client.storage.from(bucket).remove([path]);
}

/**
 * Copia um arquivo dentro do bucket e devolve a URL pública da cópia.
 *
 * Existe porque a capa do sorteio nasce da arte da skin, e apontar as duas
 * para o MESMO objeto fazia uma apagar a outra: remover ou trocar a capa
 * chama deleteRaffleImage, que apaga o arquivo, e a arte da skin continuava
 * no banco apontando para um arquivo que não existe mais. Apagar um sorteio
 * inteiro fazia isso com todas as artes que ele tinha usado.
 *
 * Com a cópia, cada um tem o seu arquivo e um ciclo de vida não encosta no
 * outro. Devolve null quando não dá para copiar, e aí quem chama decide.
 */
export async function copiarArquivoDoStorage(
  origemUrl: string,
  destinoPrefixo: string,
): Promise<string | null> {
  const client = getStorageClient();
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  if (!client || !bucket) return null;

  const origem = pathFromPublicUrl(origemUrl);
  if (!origem) return null;

  const extensao = origem.slice(origem.lastIndexOf(".")) || ".webp";
  const destino = `${destinoPrefixo}/${nanoid(10)}${extensao}`;

  const { error } = await client.storage.from(bucket).copy(origem, destino);
  if (error) return null;

  const { data } = client.storage.from(bucket).getPublicUrl(destino);
  return data.publicUrl;
}

/**
 * Apaga o arquivo SÓ se mais ninguém apontar para ele.
 *
 * Rede de proteção para o que já está gravado. A cópia acima impede que
 * novas capas compartilhem arquivo com a arte da skin, mas as campanhas
 * criadas antes disso continuam compartilhando, e apagar a imagem de uma
 * delas levaria a arte junto.
 */
export async function apagarArquivoSeOrfao(
  url: string,
  aindaReferenciado: () => Promise<boolean>,
): Promise<void> {
  const path = pathFromPublicUrl(url);
  if (!path) return;
  if (await aindaReferenciado()) return;
  await deleteRaffleImage(path);
}

// Extrai a chave do storage a partir da URL pública (split no bucket).
// Necessário porque guardamos a URL inteira no banco e o delete precisa do path.
export function pathFromPublicUrl(publicUrl: string): string | null {
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  if (!bucket) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = publicUrl.indexOf(marker);
  if (i === -1) return null;
  return publicUrl.slice(i + marker.length);
}

// Extensão -> tipo MIME. O navegador nem sempre preenche file.type (arquivo
// vindo de gerenciador de arquivos, formato que ele não conhece), e mandar
// "application/octet-stream" faz o Storage servir a imagem como download em
// vez de exibi-la. Quando dá para deduzir pelo nome, deduzimos.
const EXT_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jfif: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
};

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/svg+xml": "svg",
  "image/tiff": "tiff",
  "image/x-icon": "ico",
};

function guessExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && Object.hasOwn(EXT_MIME, fromName)) {
    return fromName === "jfif" ? "jpg" : fromName;
  }
  const fromType = MIME_EXT[file.type.toLowerCase()];
  if (fromType) return fromType;
  // Extensão desconhecida mas plausível: preserva em vez de virar ".bin",
  // que quebraria a exibição no navegador.
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  return "bin";
}

function guessContentType(file: File): string {
  if (file.type.toLowerCase().startsWith("image/")) return file.type;
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && EXT_MIME[fromName]) return EXT_MIME[fromName];
  return file.type || "application/octet-stream";
}
