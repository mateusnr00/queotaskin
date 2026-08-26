import slugify from "slugify";

// Slug seguro para URLs, em PT-BR remove acentos e converte para kebab-case.
// Símbolos que o slugify traduziria para palavra, e que no nome de uma skin
// não querem dizer nada: a barra separa arma e padrão ("AWP | Dragon Lore") e
// a estrela marca item raro. No locale pt o "|" vira "ou", e sem tirá-lo
// antes toda campanha nasceria em /s/awp-ou-dragon-lore.
//
// Precisa sair ANTES do slugify: a opção "remove" dele age sobre o texto já
// traduzido, quando o "ou" já existe.
const SIMBOLOS_SEM_LEITURA = /[|★™]/g;

export function toSlug(input: string): string {
  return slugify(input.replace(SIMBOLOS_SEM_LEITURA, " "), {
    lower: true,
    strict: true, // remove caracteres não-alfanuméricos
    locale: "pt",
    trim: true,
  });
}

// Adiciona sufixo curto aleatório quando o slug colide no banco.
// Mantemos a função de geração isolada da camada de persistência,
// quem chama é responsável por checar unicidade e (se preciso) re-tentar.
export function toSlugWithSuffix(input: string, suffix: string): string {
  return `${toSlug(input)}-${suffix.toLowerCase()}`;
}
