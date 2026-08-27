import { onlyDigits } from "@/lib/cpf";

// Telefone com país.
//
// O número continua guardado só em dígitos e SEM o código do país, num campo,
// e o país num outro. A alternativa seria gravar tudo junto no formato E.164
// ("+5562999999999"), o que é mais canônico, mas exigiria reescrever as
// linhas que já existem e todo lugar que hoje lê `phone` como número
// nacional. Com o país à parte, cadastro antigo continua válido sem tocar em
// dado nenhum: o default da coluna é BR, que é o que todos eles são, porque
// até agora o formulário só aceitava DDD mais 8 ou 9 dígitos.
//
// Sem bandeira em emoji: o Windows não tem fonte de bandeiras, e o emoji
// aparece como as duas letras do país. Como o código ISO já é exibido, a
// bandeira só somava um caractere que se comporta diferente em cada sistema.
//
// A lista não é a ONU inteira. São os países de onde a operação
// realisticamente recebe cliente, mais a linha "outro país" no fim, que
// afrouxa a validação para qualquer número de 6 a 15 dígitos. Uma lista de
// duzentos itens num seletor de cadastro é rolagem, não escolha.

export type Pais = {
  /** ISO 3166-1 alfa-2, que é o que vai para o banco. */
  iso: string;
  nome: string;
  /** Código internacional, sem o "+". */
  ddi: string;
  /** Quantos dígitos o número nacional pode ter, inclusive. */
  digitos: [number, number];
  /** Como escrever o número na tela; "#" é um dígito. */
  mascara?: string;
};

export const PAISES: Pais[] = [
  { iso: "BR", nome: "Brasil", ddi: "55", digitos: [10, 11], mascara: "(##) #####-####" },
  { iso: "PT", nome: "Portugal", ddi: "351", digitos: [9, 9], mascara: "### ### ###" },
  { iso: "US", nome: "Estados Unidos", ddi: "1", digitos: [10, 10], mascara: "(###) ###-####" },
  { iso: "AR", nome: "Argentina", ddi: "54", digitos: [10, 11] },
  { iso: "PY", nome: "Paraguai", ddi: "595", digitos: [9, 9] },
  { iso: "UY", nome: "Uruguai", ddi: "598", digitos: [8, 9] },
  { iso: "CL", nome: "Chile", ddi: "56", digitos: [9, 9] },
  { iso: "CO", nome: "Colômbia", ddi: "57", digitos: [10, 10] },
  { iso: "PE", nome: "Peru", ddi: "51", digitos: [9, 9] },
  { iso: "BO", nome: "Bolívia", ddi: "591", digitos: [8, 8] },
  { iso: "MX", nome: "México", ddi: "52", digitos: [10, 10] },
  { iso: "ES", nome: "Espanha", ddi: "34", digitos: [9, 9] },
  { iso: "IT", nome: "Itália", ddi: "39", digitos: [9, 11] },
  { iso: "GB", nome: "Reino Unido", ddi: "44", digitos: [10, 10] },
  { iso: "CA", nome: "Canadá", ddi: "1", digitos: [10, 10], mascara: "(###) ###-####" },
  { iso: "JP", nome: "Japão", ddi: "81", digitos: [9, 10] },
  // Escotilha de saída. Sem ela, quem mora fora da lista não conclui o
  // cadastro, e um seletor que não tem o país de quem está preenchendo é
  // pior que não ter seletor nenhum.
  { iso: "XX", nome: "Outro país", ddi: "", digitos: [6, 15] },
];

export const PAIS_PADRAO = "BR";

export function paisPorIso(iso: string | null | undefined): Pais {
  return (
    PAISES.find((p) => p.iso === iso) ??
    PAISES.find((p) => p.iso === PAIS_PADRAO)!
  );
}

/** True quando o número tem uma quantidade de dígitos plausível no país. */
export function telefoneValido(numero: string, iso: string): boolean {
  const digitos = onlyDigits(numero);
  const [min, max] = paisPorIso(iso).digitos;
  return digitos.length >= min && digitos.length <= max;
}

/**
 * Aplica a máscara do país enquanto a pessoa digita. País sem máscara
 * cadastrada devolve os dígitos crus: melhor sem enfeite do que com um
 * agrupamento inventado, que atrapalha quem sabe o próprio número de cor.
 */
export function formatarTelefone(numero: string, iso: string): string {
  const digitos = onlyDigits(numero);
  const { mascara } = paisPorIso(iso);
  if (!mascara) return digitos;

  let saida = "";
  let i = 0;
  for (const c of mascara) {
    if (i >= digitos.length) break;
    if (c === "#") {
      saida += digitos[i];
      i++;
    } else {
      saida += c;
    }
  }
  // Sobra de dígitos que a máscara não previu vai no fim, sem corte: cortar
  // silenciosamente gravaria um número diferente do que a pessoa digitou.
  return saida + digitos.slice(i);
}

/** Número pronto para leitura, com o código do país quando não é o padrão. */
export function telefoneComPais(
  numero: string | null | undefined,
  iso: string | null | undefined
): string {
  if (!numero) return "";
  const pais = paisPorIso(iso);
  const formatado = formatarTelefone(numero, pais.iso);
  if (pais.iso === PAIS_PADRAO) return formatado;
  return pais.ddi ? `+${pais.ddi} ${formatado}` : formatado;
}
