// O texto que toda campanha de skin já nasce tendo.
//
// Antes o campo vinha vazio, e quem cria digitava de novo, a cada sorteio, as
// mesmas quatro linhas: o prêmio, o valor, como o sorteio acontece e um "boa
// sorte". Digitar de novo é onde entra erro de digitação, valor desatualizado
// e campanha publicada sem descrição nenhuma.
//
// TEXTO PURO, E NÃO MARKDOWN.
//
// A página do sorteio renderiza a descrição com `whitespace-pre-wrap`, sem
// interpretar marcação: quebra de linha e "★" atravessam intactos, e um
// `**PRÊMIO**` apareceria com os asteriscos à mostra. A ênfase aqui é a caixa
// alta dos rótulos, que é o que texto puro oferece. Introduzir Markdown
// exigiria um renderizador novo na página pública, e uma segunda forma de
// escrever descrição no mesmo campo.
//
// O NOME DO SITE VEM DE FORA.
//
// A plataforma serve mais de um painel. "Qué Ota? Skin" escrito aqui dentro
// viraria a marca errada no dia em que outro painel gerar uma descrição.

import { formatBRL } from "@/lib/format";

// OS RÓTULOS SÃO O CONTRATO ENTRE QUEM GERA E QUEM LÊ.
//
// A página do sorteio mostra prêmio e preço como ficha, e não como duas
// linhas de parágrafo. Para isso ela reconhece o texto que saiu daqui, e
// reconhecer é comparar com estas mesmas constantes: rótulo escrito à mão
// nos dois lugares vira ficha que some no dia em que um dos dois muda.
const ROTULO_DO_PREMIO = "PRÊMIO";
const ROTULO_DO_PRECO = "PREÇO STEAM:";

// OS RÓTULOS DE ANTES, QUE CONTINUAM NO BANCO.
//
// Campanha publicada guarda o texto com que foi publicada, e ele não é
// reescrito por causa de uma mudança de template. Sem reconhecer a forma
// antiga, toda campanha já no ar perderia a ficha e voltaria a ser parágrafo
// corrido. Só a LEITURA conhece estes; nada novo é gerado com eles.
const ROTULO_ANTIGO_DO_PREMIO = "PRÊMIO:";
const ROTULO_ANTIGO_DO_VALOR = "VALOR STEAM:";

export interface DadosDaDescricaoPadrao {
  /**
   * O nome como a página vai mostrar, já com o desgaste entre parênteses:
   * "★ Sport Gloves | Amphibious (Field-Tested)".
   */
  nomeDaSkin: string;
  /** O preço de referência da Steam, em reais. Nulo quando não houver. */
  precoBrl?: number | null;
  /** O nome do painel, para o texto não trazer marca fixa. */
  nomeDoSite: string;
}

/**
 * Monta a descrição padrão de um sorteio de skin.
 *
 * Determinística: mesmos dados, mesmo texto. É o que permite ao formulário
 * comparar o que está no campo com o que ele geraria e saber se alguém mexeu.
 *
 * DADO QUE FALTA VIRA LINHA AUSENTE, NUNCA "null".
 *
 * Sem preço, a linha do valor simplesmente não existe: um "VALOR STEAM:
 * R$ 0,00" publicado é pior que a ausência dele, porque afirma um preço
 * errado em vez de não afirmar nada. Sem nome de skin não há descrição a
 * gerar, e a função devolve vazio para o campo continuar como estava.
 */
export function montarDescricaoPadrao({
  nomeDaSkin,
  precoBrl,
  nomeDoSite,
}: DadosDaDescricaoPadrao): string {
  const nome = nomeDaSkin?.trim();
  if (!nome) return "";

  const site = nomeDoSite?.trim() || "no site";
  const temPreco =
    typeof precoBrl === "number" && Number.isFinite(precoBrl) && precoBrl > 0;

  const blocos = [
    ROTULO_DO_PREMIO,
    nome,
    ...(temPreco ? [`${ROTULO_DO_PRECO} ${formatBRL(precoBrl!)}`] : []),
    `O sorteio acontece diretamente na ${site}, de forma automática após o encerramento da campanha.`,
    "O resultado e o vencedor ficam disponíveis no próprio site.",
    "Boa sorte! 🍀",
  ];

  return blocos.join("\n\n");
}

/** O que fazer com a descrição quando a skin ou o preço mudam. */
export type DecisaoDaDescricao = "aplicar" | "oferecer" | "nada";

/**
 * Decide entre escrever o texto novo no campo, oferecê-lo, ou não fazer nada.
 *
 * A regra inteira, num lugar só e sem React em volta:
 *
 * - campo vazio, ou igual ao último texto que o formulário escreveu:
 *   ninguém personalizou, pode escrever.
 * - campo diferente: é texto de quem digitou. Oferece.
 * - texto novo igual ao que já está lá: nada a fazer, nem oferta.
 *
 * A comparação é feita com as pontas aparadas porque um espaço ou uma quebra
 * de linha sobrando no fim não é personalização.
 */
export function decidirAtualizacaoDaDescricao({
  atual,
  ultimaGerada,
  nova,
}: {
  atual: string;
  ultimaGerada: string;
  nova: string;
}): DecisaoDaDescricao {
  if (!nova.trim()) return "nada";
  const agora = atual.trim();
  if (agora === nova.trim()) return "nada";
  if (agora === "" || agora === ultimaGerada.trim()) return "aplicar";
  return "oferecer";
}

// OS RÓTULOS SÃO O CONTRATO ENTRE O GERADOR E A PÁGINA.
//
// A página do sorteio mostra prêmio e valor como ficha, e não como duas
// linhas de parágrafo. Para isso ela precisa reconhecer o texto que saiu
// daqui, e reconhecer é comparar com estas mesmas constantes: rótulo escrito
// à mão nos dois lugares vira ficha que some no dia em que um dos dois muda.

export interface FichaDaDescricao {
  /** O nome do prêmio, já com o desgaste. */
  premio: string;
  /** O valor formatado, exatamente como foi gravado. Nulo quando não houver. */
  valor: string | null;
  /** O que vem depois da ficha, para sair como texto corrido. */
  corpo: string;
}

/**
 * Lê a ficha de uma descrição que saiu do template padrão.
 *
 * Devolve `null` para qualquer outro texto, e é isso que mantém a descrição
 * escrita à mão intacta: sem ficha, a página cai no parágrafo de sempre. O
 * reconhecimento é só do começo, então quem apagou o "boa sorte" e escreveu
 * as próprias regras continua com prêmio e valor em destaque.
 *
 * Trabalha sobre o texto GRAVADO, e não sobre a skin: campanha antiga
 * continua mostrando o valor com que foi publicada, mesmo que o preço de
 * referência tenha mudado depois.
 */
export function lerFichaDaDescricao(
  texto: string | null | undefined,
): FichaDaDescricao | null {
  const limpo = (texto ?? "").trim();
  if (!limpo) return null;

  const blocos = limpo.split("\n\n");

  // Forma nova: "PRÊMIO" sozinho num bloco, o nome no bloco seguinte.
  if (blocos[0].trim() === ROTULO_DO_PREMIO) {
    const premio = (blocos[1] ?? "").trim();
    if (!premio) return null;
    return montarFicha(premio, blocos.slice(2), ROTULO_DO_PRECO);
  }

  // Forma antiga: "PRÊMIO:" e o nome na linha de baixo, no mesmo bloco.
  if (blocos[0].startsWith(`${ROTULO_ANTIGO_DO_PREMIO}\n`)) {
    const premio = blocos[0].slice(ROTULO_ANTIGO_DO_PREMIO.length).trim();
    if (!premio) return null;
    return montarFicha(premio, blocos.slice(1), ROTULO_ANTIGO_DO_VALOR);
  }

  return null;
}

/** O preço, quando ele abre o que sobrou; o resto vira corpo. */
function montarFicha(
  premio: string,
  resto: string[],
  rotuloDoPreco: string,
): FichaDaDescricao {
  let valor: string | null = null;
  if (resto[0]?.startsWith(`${rotuloDoPreco} `)) {
    valor = resto[0].slice(rotuloDoPreco.length).trim() || null;
    resto = resto.slice(1);
  }
  return { premio, valor, corpo: resto.join("\n\n").trim() };
}

