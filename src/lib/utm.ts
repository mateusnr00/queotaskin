// As marcas de origem de tráfego que vêm na URL do anúncio.
//
// A Meta acrescenta utm_source, utm_medium e utm_campaign ao link quando o
// anúncio é montado com elas. Quem clica chega na página do sorteio com essas
// marcas na barra de endereço, e elas precisam sobreviver até a reserva: sem
// isso, o painel sabe que houve venda e não sabe de qual anúncio ela veio,
// que é justamente a conta que decide onde gastar.
//
// A Reservation já tinha as três colunas. O que faltava era alguém ler a URL:
// elas nunca eram preenchidas.

export interface MarcasDeOrigem {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

/** Corta no tamanho da coluna, que é 120. */
function limitar(valor: string | null): string | undefined {
  const limpo = (valor ?? "").trim();
  return limpo ? limpo.slice(0, 120) : undefined;
}

/** Lê as marcas de uma querystring. */
export function marcasDaBusca(busca: URLSearchParams): MarcasDeOrigem {
  return {
    utmSource: limitar(busca.get("utm_source")),
    utmMedium: limitar(busca.get("utm_medium")),
    utmCampaign: limitar(busca.get("utm_campaign")),
  };
}

/** Chave do armazenamento de sessão. */
const CHAVE = "qos_utm";

/**
 * Guarda as marcas da URL e devolve o que vale para esta visita.
 *
 * Guardar é necessário porque a compra não acontece na página de chegada: a
 * pessoa clica no anúncio, cai no sorteio com as marcas na URL, navega, e só
 * então reserva. Sem guardar, a reserva sairia sem origem.
 *
 * Fica em sessionStorage e não em cookie: vale enquanto a aba estiver aberta,
 * que é o tempo de uma visita, e não acompanha a pessoa por um ano nem viaja
 * junto de toda requisição.
 *
 * A URL manda sobre o que já estava guardado: quem clica num segundo anúncio
 * no meio da visita veio, agora, do segundo.
 */
export function guardarOuRecuperarMarcas(
  busca: URLSearchParams,
): MarcasDeOrigem {
  const daUrl = marcasDaBusca(busca);
  const temNaUrl = Boolean(daUrl.utmSource || daUrl.utmMedium || daUrl.utmCampaign);

  if (typeof window === "undefined") return daUrl;

  try {
    if (temNaUrl) {
      window.sessionStorage.setItem(CHAVE, JSON.stringify(daUrl));
      return daUrl;
    }
    const guardado = window.sessionStorage.getItem(CHAVE);
    return guardado ? (JSON.parse(guardado) as MarcasDeOrigem) : {};
  } catch {
    // Navegador com armazenamento bloqueado: vale o que está na URL agora.
    return daUrl;
  }
}
