import { describe, expect, it } from "vitest";

import {
  decidirAtualizacaoDaDescricao,
  lerFichaDaDescricao,
  montarDescricaoPadrao,
} from "./descricao-padrao";

const SITE = "QuéOta Skin";

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
        "PRÊMIO",
        "",
        "★ Sport Gloves | Amphibious (Field-Tested)",
        "",
        "PREÇO STEAM: R$ 2.139,27",
        "",
        "O sorteio acontece diretamente na QuéOta Skin, de forma automática após o encerramento da campanha.",
        "",
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
    expect(semNbsp(texto)).toContain("PREÇO STEAM: R$ 2.139,27");
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
      expect(texto).not.toMatch(/PREÇO STEAM/);
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
    expect(texto).toContain("diretamente na Outra Loja, de forma automática");
    expect(texto).not.toContain("QuéOta");
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
    expect(texto.split("\n\n")).toHaveLength(6);
  });
});

describe("decidir entre escrever e oferecer", () => {
  const nomeDoSite = "QuéOta Skin";
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
    nomeDoSite: "QuéOta Skin",
  });

  it("separa prêmio, valor e o resto do texto", () => {
    const ficha = lerFichaDaDescricao(padrao);
    expect(ficha).not.toBeNull();
    expect(ficha!.premio).toBe("AK-47 | Redline (Field-Tested)");
    expect(semNbsp(ficha!.valor ?? "")).toBe("R$ 128,45");
    expect(ficha!.corpo).toBe(
      "O sorteio acontece diretamente na QuéOta Skin, de forma automática após o encerramento da campanha.\n\nO resultado e o vencedor ficam disponíveis no próprio site.\n\nBoa sorte! 🍀",
    );
  });

  it("sem preço, a ficha tem prêmio e nenhum valor", () => {
    const ficha = lerFichaDaDescricao(
      montarDescricaoPadrao({
        nomeDaSkin: "Glock-18 | Fade",
        precoBrl: null,
        nomeDoSite: "QuéOta Skin",
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
    const meu = `PRÊMIO\n\n★ Karambit | Doppler\n\nPREÇO STEAM: R$ 4.800,00\n\nEntrego em até 24h, e o pagamento é só via Pix.`;
    const ficha = lerFichaDaDescricao(meu);
    expect(ficha!.premio).toBe("★ Karambit | Doppler");
    expect(ficha!.corpo).toBe("Entrego em até 24h, e o pagamento é só via Pix.");
  });

  it("o ★ e o desgaste atravessam a leitura intactos", () => {
    const ficha = lerFichaDaDescricao(
      montarDescricaoPadrao({
        nomeDaSkin: "★ Sport Gloves | Amphibious (Field-Tested)",
        precoBrl: 9990.5,
        nomeDoSite: "QuéOta Skin",
      }),
    );
    expect(ficha!.premio).toBe("★ Sport Gloves | Amphibious (Field-Tested)");
    expect(semNbsp(ficha!.valor ?? "")).toBe("R$ 9.990,50");
  });

  it("o valor lido é o que foi GRAVADO, e não um preço recalculado", () => {
    // Campanha publicada com um preço não muda de valor quando a Steam muda.
    const antiga = `PRÊMIO\n\nAWP | Asiimov\n\nPREÇO STEAM: R$ 1,00\n\nBoa sorte! 🍀`;
    expect(lerFichaDaDescricao(antiga)!.valor).toBe("R$ 1,00");
  });

  // As campanhas que já estão no ar guardam o texto do template anterior. Sem
  // isto, todas elas perderiam a ficha e voltariam a ser parágrafo corrido.
  it("a forma antiga, que está gravada nas campanhas publicadas, continua sendo lida", () => {
    const antes = [
      "PRÊMIO:",
      "M4A4 | Buzz Kill (Field-Tested)",
      "",
      "VALOR STEAM: R$ 1.940,60",
      "",
      "O sorteio acontece diretamente na QuéOta Skin após o encerramento da rifa.",
      "O resultado e o vencedor ficam disponíveis no próprio site.",
      "",
      "Boa sorte! 🍀",
    ].join("\n");
    const ficha = lerFichaDaDescricao(antes);
    expect(ficha!.premio).toBe("M4A4 | Buzz Kill (Field-Tested)");
    expect(ficha!.valor).toBe("R$ 1.940,60");
    expect(ficha!.corpo).toContain("Boa sorte!");
  });
});

describe("o preço da Steam chegando no texto", () => {
  const NOME = "M4A4 | Buzz Kill (Field-Tested)";
  const daBusca = (preco: number | null) =>
    montarDescricaoPadrao({ nomeDaSkin: NOME, precoBrl: preco, nomeDoSite: SITE });

  it('o template fala em "campanha", e a palavra "rifa" não aparece', () => {
    const comPreco = daBusca(1940.6);
    const semPreco = daBusca(null);
    for (const texto of [comPreco, semPreco]) {
      expect(texto).toContain("encerramento da campanha");
      expect(texto.toLowerCase()).not.toContain("rifa");
    }
  });

  it("o nome da skin aparece inteiro, com o desgaste", () => {
    expect(daBusca(1940.6)).toContain(NOME);
  });

  it("o preço da busca aparece formatado em real", () => {
    // 1940.60 é o número que a ação devolve; R$ 1.940,60 é o que a descrição
    // mostra.
    expect(semNbsp(daBusca(1940.6))).toContain("PREÇO STEAM: R$ 1.940,60");
    expect(daBusca(1940.6)).not.toContain("1940.60");
  });

  // O caso 4 e o 5 do pedido, na mesma passagem: o texto ainda é o que o
  // formulário gerou, então ele é reescrito, e o preço velho sai junto.
  it("descrição ainda automática recebe o preço novo, e perde o antigo", () => {
    const comCatalogo = daBusca(128.45);
    const comSteam = daBusca(1940.6);

    expect(
      decidirAtualizacaoDaDescricao({
        atual: comCatalogo,
        ultimaGerada: comCatalogo,
        nova: comSteam,
      }),
    ).toBe("aplicar");

    expect(semNbsp(comSteam)).toContain("R$ 1.940,60");
    expect(semNbsp(comSteam)).not.toContain("R$ 128,45");
  });

  it("a linha do preço nasce quando o preço chega, se antes não havia", () => {
    const semNada = daBusca(null);
    expect(semNada).not.toContain("PREÇO STEAM");
    expect(
      decidirAtualizacaoDaDescricao({
        atual: semNada,
        ultimaGerada: semNada,
        nova: daBusca(1940.6),
      }),
    ).toBe("aplicar");
  });

  it("texto personalizado não é sobrescrito pelo preço que chegou", () => {
    const meu = "Sorteio da M4! Entrego no mesmo dia, chama no direct.";
    expect(
      decidirAtualizacaoDaDescricao({
        atual: meu,
        ultimaGerada: daBusca(128.45),
        nova: daBusca(1940.6),
      }),
    ).toBe("oferecer");
  });

  it("nenhum undefined, null ou NaN atravessa, com preço ou sem", () => {
    for (const preco of [1940.6, 0, -1, NaN, null, undefined]) {
      const texto = daBusca(preco as number | null);
      expect(semNbsp(texto)).not.toMatch(/undefined|null|NaN|R\$ 0,00/);
    }
  });

  // O caso 8: montar o texto é aritmética sobre o número que a ação já
  // devolveu. Se um dia alguém puser uma busca aqui dentro, isto quebra.
  it("montar a descrição não busca preço nenhum", async () => {
    const buscaOriginal = globalThis.fetch;
    let chamadas = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      chamadas++;
      return buscaOriginal(...args);
    }) as typeof fetch;
    try {
      daBusca(1940.6);
      lerFichaDaDescricao(daBusca(1940.6));
      decidirAtualizacaoDaDescricao({
        atual: "",
        ultimaGerada: "",
        nova: daBusca(1940.6),
      });
    } finally {
      globalThis.fetch = buscaOriginal;
    }
    expect(chamadas).toBe(0);
  });
});
