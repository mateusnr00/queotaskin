import slugify from "slugify";

// Slug seguro para URLs, em PT-BR remove acentos e converte para kebab-case.
export function toSlug(input: string): string {
  return slugify(input, {
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
