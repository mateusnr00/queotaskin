// Palavras que um slug de sorteio não pode usar.
//
// Existe porque a URL do sorteio deixou de morar em /s/<slug> e passou a
// morar na raiz. Sem o prefixo, o slug disputa o primeiro segmento do
// caminho com todas as rotas do site, e o Next resolve a rota estática
// antes da dinâmica. Ou seja: uma campanha com slug "login" nasceria
// inalcançável em silêncio. O painel mostraria o endereço, o dono
// divulgaria, e quem clicasse cairia na tela de entrar.
//
// Barrar na criação é a única defesa possível. Depois que o sorteio existe
// e o link circulou, não há conserto que não quebre o link de alguém.
//
// Arquivo estático de public/ não entra na lista porque não precisa: o slug
// é validado contra /^[a-z0-9]+(?:-[a-z0-9]+)*$/, que não aceita ponto, e
// todo arquivo de lá tem extensão. Se um dia entrar arquivo sem extensão,
// o nome dele passa a ser obrigatório aqui.

/** Primeiro segmento de caminho que já pertence a alguma rota do site. */
const ROTAS_DO_SITE = [
  "admin",
  "api",
  "comprovante",
  "login",
  "meus-titulos",
  "minha-conta",
  "registro",
  "s", // o redirect de compatibilidade; ver next.config.ts
  "sorteios",
  "trocar-senha",
] as const;

// Nomes que o site ainda não usa, mas que são candidatos naturais a virar
// rota. Reservar agora custa uma palavra; reservar depois custa quebrar o
// link de uma campanha que já está circulando.
const RESERVADAS_PARA_O_FUTURO = [
  "ajuda",
  "conta",
  "contato",
  "termos",
  "privacidade",
  "sitemap",
  "robots",
  "manifest",
  "ganhadores",
  "sair",
] as const;

export const SLUGS_RESERVADOS: readonly string[] = [
  ...ROTAS_DO_SITE,
  ...RESERVADAS_PARA_O_FUTURO,
];

/** Só para o teste que cruza esta lista com as pastas de rota reais. */
export const ROTAS_DO_SITE_RESERVADAS: readonly string[] = ROTAS_DO_SITE;

export function slugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.includes(slug.trim().toLowerCase());
}

/**
 * Devolve um slug livre da lista de reservados, acrescentando um sufixo.
 * Usado quando o slug foi gerado do título e não digitado pelo admin: aí
 * recusar seria implicar com uma escolha que ninguém fez.
 */
export function desviarDeReservado(slug: string): string {
  return slugReservado(slug) ? `${slug}-sorteio` : slug;
}
