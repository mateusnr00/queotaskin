// A AUTORIDADE FINANCEIRA NÃO PODE MORAR NUMA URL QUE O ADMIN ESCOLHE.
//
// A verificação server-to-server passou a ser a prova de que o dinheiro
// entrou. Se o `baseUrl` do gateway fosse livre, um admin (ou uma conta admin
// comprometida) apontaria a consulta para um servidor próprio que responde
// "approved" e fabricaria pagamentos. Por isso o HOST é allowlisted por
// provider; a credencial pode variar, a autoridade de rede não.
//
// Localhost entra só para o dublê de testes (a costura *_BASE_URL de
// servidor), nunca para configuração de tenant em produção.

const OFICIAIS: Record<string, readonly string[]> = {
  SYNCPAY: ["api.syncpayments.com.br"],
  SIGILOPAY: ["app.sigilopay.com.br"],
  HORSEPAY: ["api.horsepay.io"],
  NEXUSPAG: ["nexuspag.com", "www.nexuspag.com"],
};

const LOCAIS = new Set(["localhost", "127.0.0.1", "::1"]);

/**
 * O baseUrl configurado é aceitável para este provider?
 *
 * Vazio é aceitável (cai no default oficial do adapter). Só https, e o host
 * precisa estar na allowlist do provider. Host local é aceito apenas quando
 * `permitirLocal` (testes), nunca em validação de produção.
 */
export function baseUrlConfiavel(
  provider: string,
  baseUrl: string | null | undefined,
  opcoes: { permitirLocal?: boolean } = {},
): boolean {
  const bruto = (baseUrl ?? "").trim();
  if (!bruto) return true; // usa o default oficial do adapter

  let url: URL;
  try {
    url = new URL(bruto);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") {
    // exceção: http para host local em teste
    if (!(opcoes.permitirLocal && url.protocol === "http:" && LOCAIS.has(url.hostname))) {
      return false;
    }
  }
  const host = url.hostname.toLowerCase();
  if (opcoes.permitirLocal && LOCAIS.has(host)) return true;

  const oficiais = OFICIAIS[provider.toUpperCase()];
  return oficiais != null && oficiais.includes(host);
}

export function hostsOficiaisDe(provider: string): readonly string[] {
  return OFICIAIS[provider.toUpperCase()] ?? [];
}
