import { describe, expect, it } from "vitest";

import {
  linkDoWhatsapp,
  mensagemDeParabens,
  mensagemDeReivindicacao,
  numeroInternacional,
} from "./whatsapp";

describe("numeroInternacional", () => {
  it("põe o DDI na frente e tira a pontuação", () => {
    expect(numeroInternacional("(11) 98888-7777", "BR")).toBe("5511988887777");
  });

  it("assume Brasil quando o país não veio", () => {
    expect(numeroInternacional("11988887777", null)).toBe("5511988887777");
  });

  it("respeita outro país", () => {
    expect(numeroInternacional("912345678", "PT")).toBe("351912345678");
  });

  // Sem esta guarda o link viraria 555511988887777 e não abriria conversa.
  it("não duplica o DDI de número já internacional", () => {
    expect(numeroInternacional("5511988887777", "BR")).toBe("5511988887777");
  });

  it("devolve vazio sem número", () => {
    expect(numeroInternacional("", "BR")).toBe("");
    expect(numeroInternacional(null)).toBe("");
    expect(numeroInternacional("abc")).toBe("");
  });
});

describe("linkDoWhatsapp", () => {
  it("monta o link com a mensagem codificada", () => {
    const link = linkDoWhatsapp("11988887777", "Parabéns! Você ganhou", "BR");
    expect(link).toBe(
      "https://wa.me/5511988887777?text=Parab%C3%A9ns!%20Voc%C3%AA%20ganhou",
    );
  });

  // Null, e não link vazio: é o que deixa a interface esconder o botão.
  it("devolve null sem número", () => {
    expect(linkDoWhatsapp(null, "oi")).toBeNull();
  });
});

describe("mensagemDeParabens", () => {
  it("usa só o primeiro nome", () => {
    const m = mensagemDeParabens({
      nome: "Mateus Nascimento Rodrigues",
      premio: "AK-47 | Wintergreen (Field-Tested)",
    });
    expect(m).toContain("Parabéns, Mateus!");
    expect(m).toContain("AK-47 | Wintergreen (Field-Tested)");
    expect(m).not.toContain("Rodrigues");
  });

  // Sem a campanha de proposito: elas se chamam como skins, e o texto ficava
  // com dois nomes de skin na mesma frase.
  it("não cita a campanha", () => {
    const m = mensagemDeParabens({ nome: "Ana", premio: "M4A4" });
    expect(m).not.toContain("campanha");
    expect(m).toBe(
      "Parabéns, Ana! Você ganhou a M4A4 na sua Caixa Surpresa. " +
        "Me manda o seu link de troca da Steam para eu enviar o item.",
    );
  });

  it("aguenta nome vazio sem virar \"Parabéns, !\"", () => {
    const m = mensagemDeParabens({ nome: "  ", premio: "M4A4" });
    expect(m.startsWith("Parabéns! ")).toBe(true);
    expect(m).not.toContain("Parabéns, !");
  });
});

describe("mensagemDeReivindicacao", () => {
  const base = {
    nome: "Carlos Eduardo",
    premio: "AK-47 | Redline (Field-Tested)",
    tradeUrl: "https://steamcommunity.com/tradeoffer/new/?partner=1&token=ab",
  };

  it("diz quem é, o que ganhou e para onde mandar, e mais nada", () => {
    expect(mensagemDeReivindicacao(base)).toBe(
      "Olá, sou Carlos Eduardo. Ganhei AK-47 | Redline (Field-Tested). " +
        "Meu trade link: https://steamcommunity.com/tradeoffer/new/?partner=1&token=ab",
    );
  });

  it("não repete o nome da campanha nem carrega id de pedido", () => {
    // O defeito relatado: campanhas aqui se chamam como skins, então dizer o
    // prêmio E a campanha saía com o mesmo nome duas vezes na mesma frase. E o
    // id do pedido era um cuid de 25 caracteres que não diz nada a quem lê.
    const m = mensagemDeReivindicacao(base);
    expect(m).not.toContain("na campanha");
    expect(m).not.toContain("Pedido");
    expect(m).not.toMatch(/c[a-z0-9]{24}/);
  });

  it("sem link cadastrado, avisa em vez de omitir", () => {
    // Omitir deixaria "Ganhei X." e ponto, e o suporte responderia pedindo o
    // link. Dizer que falta já adianta o primeiro passo da conversa.
    const m = mensagemDeReivindicacao({ ...base, tradeUrl: null });
    expect(m).toContain("Ganhei AK-47 | Redline (Field-Tested).");
    expect(m).toContain("Ainda não cadastrei meu trade link.");
  });

  it("é curta: cabe numa olhada", () => {
    // O texto anterior passava de 180 caracteres com um cuid no fim.
    expect(mensagemDeReivindicacao({ ...base, tradeUrl: null }).length).toBeLessThan(120);
  });

  it("apara espaço sobrando do nome", () => {
    expect(mensagemDeReivindicacao({ ...base, nome: "  Ana  " })).toContain(
      "sou Ana.",
    );
  });
});
