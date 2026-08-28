// Validação dos identificadores de rastreamento.
//
// Existe por causa de um erro que a interface convida a cometer: o campo se
// chama "ID" e aceita qualquer texto, então a pessoa cola o bloco inteiro que
// o Google entrega, com <script src=...> e tudo. O campo aceita, salva, e o
// rastreamento simplesmente não funciona, sem nenhum aviso. Vi exatamente isso
// acontecer numa plataforma concorrente: o mesmo <script> colado em dois
// campos diferentes, os dois inertes.
//
// Aqui o formato de cada provedor é conhecido, então dá para dizer na hora que
// o que foi colado não é um id, e dizer o que fazer com ele.

export type Provedor = "meta" | "ga4" | "tiktok";

interface Formato {
  /** O que um id válido parece. */
  regex: RegExp;
  /** Exemplo curto, para o campo. */
  exemplo: string;
  /** O que dizer quando não bate. */
  comoAchar: string;
}

const FORMATOS: Record<Provedor, Formato> = {
  meta: {
    // O pixel da Meta é numérico, hoje com 15 ou 16 dígitos.
    regex: /^\d{10,20}$/,
    exemplo: "1234567890123456",
    comoAchar:
      "O ID do pixel é só números. Ache em Gerenciador de Eventos, na Meta.",
  },
  ga4: {
    regex: /^G-[A-Z0-9]{6,12}$/i,
    exemplo: "G-XXXXXXXXXX",
    comoAchar:
      'O ID do GA4 começa com "G-". Ache em Administrador, Fluxos de dados.',
  },
  tiktok: {
    regex: /^[A-Z0-9]{15,25}$/i,
    exemplo: "CXXXXXXXXXXXXXXXXXXX",
    comoAchar:
      "O ID do pixel do TikTok é uma sequência de letras e números, sem espaço.",
  },
};

export interface Conferencia {
  ok: boolean;
  /** O valor limpo, pronto para salvar. */
  valor: string;
  erro?: string;
}

/** True quando o texto parece o bloco de instalação, e não o id. */
export function pareceScript(texto: string): boolean {
  return /<\s*script|googletagmanager\.com|gtag\(|fbq\(|ttq\./i.test(texto);
}

/**
 * Tenta achar o id dentro de um bloco de instalação colado.
 *
 * Em vez de só recusar, aproveita o que a pessoa colou: quem cola o script
 * inteiro tem o id ali dentro, e mandar voltar ao Google para procurar de novo
 * é trabalho que o campo pode poupar.
 */
export function extrairId(texto: string, provedor: Provedor): string | null {
  const padroes: Record<Provedor, RegExp> = {
    meta: /\bfbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]/i,
    ga4: /\b(G-[A-Z0-9]{6,12})\b/i,
    tiktok: /\bttq\.load\(\s*['"]([A-Z0-9]{15,25})['"]/i,
  };
  const achado = texto.match(padroes[provedor]);
  return achado?.[1] ?? null;
}

/**
 * Confere um id. Vazio é válido: é assim que se desliga o rastreamento.
 */
export function conferirId(bruto: string, provedor: Provedor): Conferencia {
  const texto = bruto.trim();
  if (texto === "") return { ok: true, valor: "" };

  const formato = FORMATOS[provedor];

  if (formato.regex.test(texto)) {
    return { ok: true, valor: texto };
  }

  if (pareceScript(texto)) {
    const extraido = extrairId(texto, provedor);
    if (extraido) {
      return {
        ok: false,
        valor: extraido,
        erro: `Isso é o bloco de instalação, e não o ID. Achamos ${extraido} dentro dele.`,
      };
    }
    return {
      ok: false,
      valor: "",
      erro: `Isso é o bloco de instalação, e não o ID. ${formato.comoAchar}`,
    };
  }

  return {
    ok: false,
    valor: "",
    erro: `Formato inválido. ${formato.comoAchar} Exemplo: ${formato.exemplo}`,
  };
}

/** O exemplo do provedor, para o placeholder do campo. */
export function exemploDoId(provedor: Provedor): string {
  return FORMATOS[provedor].exemplo;
}
