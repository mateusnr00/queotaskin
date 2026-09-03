// UM WHATSAPP SÓ, EM TODO O SITE.
//
// São oito telas com botão de WhatsApp. Com cada uma escolhendo o próprio
// ícone, basta uma escolher o balão genérico do lucide para o site prometer
// "chat" numa tela e WhatsApp na outra. Este arquivo lê o código-fonte e
// recusa a segunda implementação, que é o momento em que a divergência
// nasce, e não meses depois quando alguém repara.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = path.join(process.cwd(), "src");
const ICONE = path.join(RAIZ, "components/icones/whatsapp.tsx");

function arquivosDeCodigo(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = path.join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivosDeCodigo(caminho, achados);
    else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome))
      achados.push(caminho);
  }
  return achados;
}

const arquivos = arquivosDeCodigo(RAIZ).map((caminho) => ({
  caminho,
  relativo: path.relative(RAIZ, caminho),
  fonte: readFileSync(caminho, "utf8"),
}));

describe("o ícone do WhatsApp", () => {
  it("vem do conjunto de marcas, e não de um desenho nosso", () => {
    const fonte = readFileSync(ICONE, "utf8");
    expect(fonte).toContain("@remixicon/react");
    expect(fonte).toContain("RiWhatsappFill");
    // Traço desenhado à mão é o que havia antes: um path nosso tentando
    // parecer a marca. O glifo oficial não precisa de <path> nenhum aqui.
    expect(fonte).not.toContain("<path");
    expect(fonte).not.toContain("<svg");
  });

  it("só existe uma implementação dele no projeto", () => {
    const outros = arquivos.filter(
      (a) =>
        a.caminho !== ICONE &&
        /RiWhatsapp|FaWhatsapp|fa-whatsapp/.test(a.fonte),
    );
    expect(outros.map((a) => a.relativo)).toEqual([]);
  });

  it("nenhum ícone genérico é usado como logo do WhatsApp", () => {
    // MessageCircle e Phone existem no site para outras coisas. O que este
    // teste recusa é um deles no MESMO arquivo que abre link de WhatsApp.
    const suspeitos = arquivos.filter((a) => {
      const abreWhatsapp = /wa\.me|api\.whatsapp|chat\.whatsapp/.test(a.fonte);
      const usaGenerico = /<(MessageCircle|MessagesSquare)\b/.test(a.fonte);
      return abreWhatsapp && usaGenerico;
    });
    expect(suspeitos.map((a) => a.relativo)).toEqual([]);
  });

  it("toda tela que LEVA ao WhatsApp usa o componente comum", () => {
    const semOComum = arquivos.filter((a) => {
      if (a.caminho === ICONE) return false;
      if (!a.relativo.endsWith(".tsx")) return false;
      // `href` de propósito: o que importa é levar ao WhatsApp, não citá-lo.
      // O campo das Configurações tem "chat.whatsapp.com" num placeholder, e
      // um placeholder não é um botão.
      const levaAoWhatsapp =
        /href=[^\n]*(wa\.me|api\.whatsapp|chat\.whatsapp)/.test(a.fonte) ||
        /href=\{(link|whatsapp|wa)[A-Za-z]*\}/.test(a.fonte);
      return levaAoWhatsapp && !a.fonte.includes("IconeDoWhatsapp");
    });
    expect(semOComum.map((a) => a.relativo)).toEqual([]);
  });
});

describe("os links de WhatsApp", () => {
  it("todo link externo de WhatsApp sai com noopener e noreferrer", () => {
    const semProtecao: string[] = [];
    for (const a of arquivos) {
      if (!a.relativo.endsWith(".tsx")) continue;
      // Cada <a ...> que aponta para o WhatsApp precisa das duas palavras.
      const tags = a.fonte.match(/<a\b[^>]*>/g) ?? [];
      for (const tag of tags) {
        const paraWhatsapp = /wa\.me|api\.whatsapp|chat\.whatsapp|linkDoGrupo|whatsappUrl/.test(tag);
        if (!paraWhatsapp) continue;
        if (!/target="_blank"/.test(tag)) continue;
        if (!/noopener/.test(tag) || !/noreferrer/.test(tag)) {
          semProtecao.push(`${a.relativo}: ${tag.slice(0, 80)}`);
        }
      }
    }
    expect(semProtecao).toEqual([]);
  });
});
