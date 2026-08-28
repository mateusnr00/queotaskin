import { describe, expect, it } from "vitest";

import {
  linkDoWhatsapp,
  mensagemDeParabens,
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
