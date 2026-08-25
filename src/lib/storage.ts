// Helpers de armazenamento de imagens — usa Supabase Storage com a service
// role key (server-only). Bucket configurado via SUPABASE_STORAGE_BUCKET.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { nanoid } from "nanoid";

let cached: SupabaseClient | null = null;

// Strip BOM (U+FEFF) e whitespace das envs. Sem isso, um valor colado
// no painel da Vercel a partir de um arquivo com BOM gera o erro
// "Cannot convert argument to a ByteString because the character at
// index 0 has a value of 65279" no upload — porque o cliente Supabase
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
  const client = getStorageClient();
  const bucket = readEnv("SUPABASE_STORAGE_BUCKET");
  if (!client || !bucket) {
    throw new Error(
      "Storage não configurado. Defina NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_STORAGE_BUCKET."
    );
  }

  const ext = guessExtension(file);
  const path = `raffles/${raffleId}/${nanoid(10)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await client.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
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

function guessExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/jpeg" || file.type === "image/jpg") return "jpg";
  return "bin";
}
