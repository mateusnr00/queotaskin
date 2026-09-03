import { describe, expect, it } from "vitest";

import {
  decidirAtualizacaoDaDescricao,
  lerFichaDaDescricao,
  montarDescricaoPadrao,
} from "./descricao-padrao";

const SITE = "Qué Ota? Skin";

/**
 * Troca o espaço não separável por um comum, só para o teste poder escrever
 * os valores esperados de forma legível.
 *
 * `Intl.NumberFormat` põe U+00A0 depois do "R$", e é ele mesmo que tem de ir
 * para a descrição: é o caractere que impede o navegador de quebrar a linha
 * entre o símbolo e o número.
 */
const semNbsp = (s: string) => s.replace(/\u00a0/g, " ");

describe("montarDescricaoPadrao", () => {
  it("monta o texto do exemplo, com nome e valor no lugar", () => {
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "★ Sport Gloves | Amphibious (Field-Tested)",
      precoBrl: 2139.27,
      nomeDoSite: SITE,
    });

    expect(semNbsp(texto)).toBe(
      [
        "PRÊMIO:",
        "★ Sport Gloves | Amphibious (Field-Tested)",
        "",
        "VALOR STEAM: R$ 2.139,27",
        "",
        "O sorteio acontece diretamente na Qué Ota? Skin após o encerramento da rifa.",
        "O resultado e o vencedor ficam disponíveis no próprio site.",
        "",
        "Boa sorte! 🍀",
      ].join("\n"),
    );
  });

  it("o preço sai em real brasileiro, com ponto de milhar e vírgula decimal", () => {
    // "R$2139.27" seria o formato de outro país no meio de uma página em
    // português.
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "AK-47 | Redline (Field-Tested)",
      precoBrl: 2139.27,
      nomeDoSite: SITE,
    });
    expect(semNbsp(texto)).toContain("VALOR STEAM: R$ 2.139,27");
    expect(texto).not.toContain("2139.27");
  });

  it("arredonda para dois dígitos como qualquer preço do site", () => {
    expect(
      semNbsp(montarDescricaoPadrao({ nomeDaSkin: "X", precoBrl: 1234.5, nomeDoSite: SITE })),
    ).toContain("R$ 1.234,50");
    expect(
      semNbsp(montarDescricaoPadrao({ nomeDaSkin: "X", precoBrl: 7, nomeDoSite: SITE })),
    ).toContain("R$ 7,00");
  });

  it("o espaço depois do R$ é o não separável, para não quebrar linha no meio do preço", () => {
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "AK-47 | Redline (Field-Tested)",
      precoBrl: 2139.27,
      nomeDoSite: SITE,
    });
    expect(texto).toContain("R$\u00a02.139,27");
  });

  it("a estrela da faca atravessa intacta", () => {
    // Ela é parte do nome de mercado, e some se alguém tratar o texto como
    // ASCII em algum ponto do caminho.
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "★ Karambit | Doppler (Factory New)",
      precoBrl: 5000,
      nomeDoSite: SITE,
    });
    expect(texto).toContain("★ Karambit | Doppler (Factory New)");
  });

  it("o desgaste entre parênteses é preservado", () => {
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "AWP | Asiimov (Battle-Scarred)",
      precoBrl: 100,
      nomeDoSite: SITE,
    });
    expect(texto).toContain("AWP | Asiimov (Battle-Scarred)");
  });

  it("sem preço, a linha do valor não existe, e não vira null nem R$ 0,00", () => {
    // Publicar "VALOR STEAM: R$ 0,00" afirma um preço errado; não dizer nada
    // apenas não afirma.
    for (const preco of [null, undefined, 0, -1, NaN]) {
      const texto = montarDescricaoPadrao({
        nomeDaSkin: "★ Bayonet | Lore (Field-Tested)",
        precoBrl: preco as number | null,
        nomeDoSite: SITE,
      });
      expect(texto).toContain("★ Bayonet | Lore (Field-Tested)");
      expect(texto).not.toMatch(/VALOR STEAM/);
      expect(semNbsp(texto)).not.toMatch(/null|undefined|NaN|R\$ 0,00/);
    }
  });

  it("sem nome de skin não há descrição a gerar", () => {
    // O campo fica como está: preencher com um texto sem prêmio seria pior
    // que deixá-lo vazio.
    expect(montarDescricaoPadrao({ nomeDaSkin: "", precoBrl: 100, nomeDoSite: SITE })).toBe("");
    expect(montarDescricaoPadrao({ nomeDaSkin: "   ", precoBrl: 100, nomeDoSite: SITE })).toBe("");
  });

  it("a marca vem de fora: outro painel gera o texto com o nome dele", () => {
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "AK-47 | Redline (Field-Tested)",
      precoBrl: 50,
      nomeDoSite: "Outra Loja",
    });
    expect(texto).toContain("diretamente na Outra Loja após");
    expect(texto).not.toContain("Qué Ota");
  });

  it("é determinística: mesmos dados, texto idêntico", () => {
    // É disso que o formulário depende para saber se alguém editou o campo.
    const dados = {
      nomeDaSkin: "★ Sport Gloves | Amphibious (Field-Tested)",
      precoBrl: 2139.27,
      nomeDoSite: SITE,
    };
    expect(montarDescricaoPadrao(dados)).toBe(montarDescricaoPadrao(dados));
  });

  it("trocar a skin muda o texto, e trocar o preço também", () => {
    const base = { nomeDaSkin: "AK-47 | Redline (Field-Tested)", precoBrl: 100, nomeDoSite: SITE };
    expect(montarDescricaoPadrao({ ...base, nomeDaSkin: "AWP | Asiimov (Field-Tested)" }))
      .not.toBe(montarDescricaoPadrao(base));
    expect(montarDescricaoPadrao({ ...base, precoBrl: 200 }))
      .not.toBe(montarDescricaoPadrao(base));
  });

  it("os blocos ficam separados por uma linha em branco", () => {
    // A página renderiza com whitespace-pre-wrap: o espaçamento que se digita
    // aqui é o espaçamento que aparece lá.
    const texto = montarDescricaoPadrao({
      nomeDaSkin: "AK-47 | Redline (Field-Tested)",
      precoBrl: 100,
      nomeDoSite: SITE,
    });
    expect(texto.split("\n\n")).toHaveLength(4);
  });
});

describe("decidir entre escrever e oferecer", () => {
  const nomeDoSite = "Qué Ota? Skin";
  const daAwp = montarDescricaoPadrao({
    nomeDaSkin: "AWP | Dragon Lore (Field-Tested)",
    precoBrl: 2139.27,
    nomeDoSite,
  });
  const daFaca = montarDescricaoPadrao({
    nomeDaSkin: "★ Karambit | Doppler (Factory New)",
    precoBrl: 4800,
    nomeDoSite,
  });

  it("escreve no campo vazio", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: "",
        ultimaGerada: "",
        nova: daAwp,
      }),
    ).toBe("aplicar");
  });

  // O caso 5 do pedido: trocar a skin com o texto ainda padrão atualiza nome
  // e preço, sem perguntar nada.
  it("reescreve quando o campo ainda tem o texto que ele mesmo gerou", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: daAwp,
        ultimaGerada: daAwp,
        nova: daFaca,
      }),
    ).toBe("aplicar");
  });

  // O caso 6: o texto de quem escreveu não é substituído em silêncio.
  it("oferece, em vez de apagar, o que foi personalizado", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: "Sorteio da facão, entrego no mesmo dia. Chama no zap.",
        ultimaGerada: daAwp,
        nova: daFaca,
      }),
    ).toBe("oferecer");
  });

  it("uma vírgula a mais no texto padrão já conta como personalização", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: `${daAwp}\n\nEntrego em até 24h.`,
        ultimaGerada: daAwp,
        nova: daFaca,
      }),
    ).toBe("oferecer");
  });

  it("não oferece o texto que já está escrito", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: daFaca,
        ultimaGerada: daAwp,
        nova: daFaca,
      }),
    ).toBe("nada");
  });

  it("espaço sobrando no fim não é personalização", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: `${daAwp}\n  `,
        ultimaGerada: daAwp,
        nova: daFaca,
      }),
    ).toBe("aplicar");
  });

  it("sem skin escolhida, o texto vazio não mexe em nada", () => {
    expect(
      decidirAtualizacaoDaDescricao({
        atual: "O meu texto",
        ultimaGerada: "",
        nova: "",
      }),
    ).toBe("nada");
  });
});

describe("ler a ficha da descrição", () => {
  const padrao = montarDescricaoPadrao({
    nomeDaSkin: "AK-47 | Redline (Field-Tested)",
    precoBrl: 128.45,
    nomeDoSite: "Qué Ota? Skin",
  });

  it("separa prêmio, valor e o resto do texto", () => {
    const ficha = lerFichaDaDescricao(padrao);
    expect(ficha).not.toBeNull();
    expect(ficha!.premio).toBe("AK-47 | Redline (Field-Tested)");
    expect(semNbsp(ficha!.valor ?? "")).toBe("R$ 128,45");
    expect(ficha!.corpo).toBe(
      "O sorteio acontece diretamente na Qué Ota? Skin após o encerramento da rifa.\nO resultado e o vencedor ficam disponíveis no próprio site.\n\nBoa sorte! 🍀",
    );
  });

  it("sem preço, a ficha tem prêmio e nenhum valor", () => {
    const ficha = lerFichaDaDescricao(
      montarDescricaoPadrao({
        nomeDaSkin: "Glock-18 | Fade",
        precoBrl: null,
        nomeDoSite: "Qué Ota? Skin",
      }),
    );
    expect(ficha!.premio).toBe("Glock-18 | Fade");
    expect(ficha!.valor).toBeNull();
    expect(ficha!.corpo).toContain("Boa sorte!");
  });

  // Sem isto, a descrição escrita à mão apareceria repartida em rótulos que
  // ninguém escreveu.
  it("texto que não saiu do template não vira ficha", () => {
    expect(lerFichaDaDescricao("Sorteio da facão, chama no direct.")).toBeNull();
    expect(lerFichaDaDescricao("")).toBeNull();
    expect(lerFichaDaDescricao(null)).toBeNull();
    expect(lerFichaDaDescricao("PRÊMIO: na mesma linha não conta")).toBeNull();
  });

  it("quem trocou só o final continua com prêmio e valor em destaque", () => {
    const meu = `PRÊMIO:\n★ Karambit | Doppler\n\nVALOR STEAM: R$ 4.800,00\n\nEntrego em até 24h, e o pagamento é só via Pix.`;
    const ficha = lerFichaDaDescricao(meu);
    expect(ficha!.premio).toBe("★ Karambit | Doppler");
    expect(ficha!.corpo).toBe("Entrego em até 24h, e o pagamento é só via Pix.");
  });

  it("o ★ e o desgaste atravessam a leitura intactos", () => {
    const ficha = lerFichaDaDescricao(
      montarDescricaoPadrao({
        nomeDaSkin: "★ Sport Gloves | Amphibious (Field-Tested)",
        precoBrl: 9990.5,
        nomeDoSite: "Qué Ota? Skin",
      }),
    );
    expect(ficha!.premio).toBe("★ Sport Gloves | Amphibious (Field-Tested)");
    expect(semNbsp(ficha!.valor ?? "")).toBe("R$ 9.990,50");
  });

  it("o valor lido é o que foi GRAVADO, e não um preço recalculado", () => {
    // Campanha publicada com um preço não muda de valor quando a Steam muda.
    const antiga = `PRÊMIO:\nAWP | Asiimov\n\nVALOR STEAM: R$ 1,00\n\nBoa sorte! 🍀`;
    expect(lerFichaDaDescricao(antiga)!.valor).toBe("R$ 1,00");
  });
});
