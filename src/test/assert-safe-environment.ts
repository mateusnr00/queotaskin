// BARREIRA DE ISOLAMENTO TESTE × PRODUÇÃO.  FAIL CLOSED.
//
// Nenhum teste destrutivo, seed, PoC ou script de escrita roda antes de
// `assertSafeEnvironment()` provar, em CINCO camadas independentes, que o
// banco alvo é descartável. Se QUALQUER camada não puder ser provada, a
// função LANÇA. Nunca `catch { continue }`: erro de verificação é recusa.
//
// A ordem importa: as camadas 1 a 4 são só parsing, sem abrir conexão. Só
// depois de o host estar provado local (camada 3) é que a camada 5 conecta
// e lê a sentinela. Assim nunca tocamos um host de produção nem para checar.
//
// Foi a AUSÊNCIA de uma barreira assim que deixou 91 campanhas e 184 usuários
// entrarem no banco de produção. Aqui a regra é fail-closed por desenho.

import { execSync } from "node:child_process";

export const SENTINELA_MARKER = "QUEOTA_TEST_DATABASE_V1";
export const SENTINELA_TABELA = "_test_environment_sentinel";

const HOSTS_LOCAIS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

// Nomes de banco aceitos para escrita destrutiva. NUNCA "postgres" (default
// do Supabase em produção), "production", "defaultdb".
const BANCOS_DE_TESTE = new Set(["queotaskin", "queota_test", "queota_teste"]);

const FRAGMENTOS_DE_PRODUCAO = [
  "supabase.co", "supabase.com", "neon.tech", "amazonaws.com",
  "rds.amazonaws.com", "railway.app", "railway.internal", "render.com",
  "pooler.", ".vercel-storage.com", "planetscale", "cockroachlabs",
];

export class AmbienteInseguroError extends Error {
  constructor(camada: string, motivo: string) {
    super(`[assertSafeEnvironment] BLOQUEADO na ${camada}: ${motivo}`);
    this.name = "AmbienteInseguroError";
  }
}

function mascarar(url: string): string {
  return url.replace(/(:\/\/[^:@/]+:)[^@]*@/, "$1***@");
}

export interface OpcoesDaBarreira {
  /** Injeta as variáveis para teste da própria barreira, sem tocar o processo. */
  env?: Record<string, string | undefined>;
  /** Injeta o leitor da sentinela para testar sem banco real. */
  lerSentinela?: (databaseUrl: string) => string | null;
}

/**
 * Prova, ou lança. Retorna um diagnóstico legível quando passa.
 */
export function assertSafeEnvironment(opcoes: OpcoesDaBarreira = {}): {
  host: string;
  banco: string;
  url: string;
} {
  const env = opcoes.env ?? process.env;

  // CAMADA 1 - ambiente explicitamente de teste.
  if (env.NODE_ENV !== "test") {
    throw new AmbienteInseguroError("camada 1 (NODE_ENV)", `NODE_ENV="${env.NODE_ENV}" (esperado "test")`);
  }

  // CAMADA 2 - opt-in explícito e obrigatório.
  if (env.ALLOW_DESTRUCTIVE_TESTS !== "true") {
    throw new AmbienteInseguroError("camada 2 (opt-in)", "ALLOW_DESTRUCTIVE_TESTS != 'true'");
  }

  // Fonte da conexão.
  const bruto = env.DATABASE_URL ?? "";
  if (!bruto) throw new AmbienteInseguroError("camada 3 (URL)", "DATABASE_URL vazia");

  const minusc = bruto.toLowerCase();
  for (const frag of FRAGMENTOS_DE_PRODUCAO) {
    if (minusc.includes(frag)) {
      throw new AmbienteInseguroError("camada 3 (host)", `URL contém marca de produção "${frag}"`);
    }
  }

  // DIRECT_URL (usada por `prisma migrate`) também não pode apontar para
  // produção, mesmo que a DATABASE_URL esteja limpa.
  const direto = (env.DIRECT_URL ?? "").toLowerCase();
  for (const frag of FRAGMENTOS_DE_PRODUCAO) {
    if (direto.includes(frag)) {
      throw new AmbienteInseguroError("camada 3 (DIRECT_URL)", `DIRECT_URL contém marca de produção "${frag}"`);
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(bruto);
  } catch {
    throw new AmbienteInseguroError("camada 3 (URL)", "DATABASE_URL ilegível");
  }

  // CAMADA 3 - host em allowlist de loopback.
  const host = parsed.hostname;
  if (!HOSTS_LOCAIS.has(host)) {
    throw new AmbienteInseguroError("camada 3 (host)", `host não-local: "${host}"`);
  }

  // CAMADA 4 - nome do banco em allowlist.
  const banco = parsed.pathname.replace(/^\//, "").split("?")[0];
  if (!BANCOS_DE_TESTE.has(banco)) {
    throw new AmbienteInseguroError("camada 4 (banco)", `nome de banco não permitido: "${banco}"`);
  }

  // CAMADA 5 - SENTINELA no banco. Obrigatória.
  const leitor = opcoes.lerSentinela ?? lerSentinelaComPsql;
  let marker: string | null;
  try {
    marker = leitor(bruto);
  } catch (e) {
    throw new AmbienteInseguroError("camada 5 (sentinela)", `falha ao ler sentinela: ${(e as Error).message}`);
  }
  if (marker !== SENTINELA_MARKER) {
    throw new AmbienteInseguroError(
      "camada 5 (sentinela)",
      marker === null ? "sentinela ausente" : `sentinela divergente: "${marker}"`,
    );
  }

  return { host, banco, url: mascarar(bruto) };
}

/**
 * Lê a sentinela via psql. Só é chamada DEPOIS das camadas 1-4, então o host
 * já está provado local. Timeout curto, e qualquer erro vira null (a camada
 * trata null como "não prova", fail-closed).
 */
function lerSentinelaComPsql(databaseUrl: string): string | null {
  try {
    // libpq (psql) não entende query params do Prisma como `?schema=public`.
    // Passa só o que ele aceita: esquema://user:pass@host:porta/banco.
    const u = new URL(databaseUrl);
    const limpa = `${u.protocol}//${u.username}${u.password ? ":" + u.password : ""}${u.username ? "@" : ""}${u.host}${u.pathname}`;
    const out = execSync(
      `psql "${limpa}" -tAc "SELECT marker FROM ${SENTINELA_TABELA} LIMIT 1" 2>/dev/null`,
      { timeout: 5000, encoding: "utf8" },
    ).trim();
    return out || null;
  } catch {
    return null;
  }
}
