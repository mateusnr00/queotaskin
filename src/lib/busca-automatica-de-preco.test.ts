import { describe, expect, it } from "vitest";

import {
  deveConsultarPreco,
  respostaAindaVale,
} from "./busca-automatica-de-preco";
import { PRECO_VALE_POR_SEGUNDOS } from "./steam-market";

const AGORA = new Date("2026-03-10T12:00:00Z");
const atras = (s: number) => new Date(AGORA.getTime() - s * 1000).toISOString();

const criacao = { ehEdicao: false, jaConsultada: false, agora: AGORA };

describe("quando a escolha da skin dispara consulta", () => {
  it("skin sem preço nenhum: consulta", () => {
    expect(
      deveConsultarPreco({
        ...criacao,
        skin: { skinValueBrl: null, precoAtualizadoEm: null },
      }),
    ).toBe(true);
  });

  it("preço zerado ou negativo no catálogo também consulta", () => {
    for (const v of [0, -10]) {
      expect(
        deveConsultarPreco({
          ...criacao,
          skin: { skinValueBrl: v, precoAtualizadoEm: atras(10) },
        }),
      ).toBe(true);
    }
  });

  // O caso que o pedido chama de "não buscar desnecessariamente": o valor já
  // está na tela e já entrou na descrição.
  it("preço da Steam ainda dentro da janela: NÃO consulta", () => {
    expect(
      deveConsultarPreco({
        ...criacao,
        skin: { skinValueBrl: 1327.36, precoAtualizadoEm: atras(30) },
      }),
    ).toBe(false);
  });

  it("preço vencido: consulta de novo", () => {
    expect(
      deveConsultarPreco({
        ...criacao,
        skin: {
          skinValueBrl: 1327.36,
          precoAtualizadoEm: atras(PRECO_VALE_POR_SEGUNDOS + 1),
        },
      }),
    ).toBe(true);
  });

  // Valor digitado à mão no catálogo não tem data. Publicar campanha dizendo
  // que é preço da Steam seria afirmar o que a Steam nunca disse.
  it("preço sem data não conta como preço da Steam", () => {
    expect(
      deveConsultarPreco({
        ...criacao,
        skin: { skinValueBrl: 900, precoAtualizadoEm: null },
      }),
    ).toBe(true);
  });

  it("skin já consultada neste formulário não repete", () => {
    expect(
      deveConsultarPreco({
        ...criacao,
        jaConsultada: true,
        skin: { skinValueBrl: null, precoAtualizadoEm: null },
      }),
    ).toBe(false);
  });

  // Abrir uma campanha publicada para editar não pode mexer no preço nem na
  // descrição dela.
  it("edição nunca consulta sozinha, mesmo sem preço nenhum", () => {
    expect(
      deveConsultarPreco({
        ...criacao,
        ehEdicao: true,
        skin: { skinValueBrl: null, precoAtualizadoEm: null },
      }),
    ).toBe(false);
  });

  it("sem skin, não há o que consultar", () => {
    expect(deveConsultarPreco({ ...criacao, skin: null })).toBe(false);
    expect(deveConsultarPreco({ ...criacao, skin: undefined })).toBe(false);
  });
});

describe("resposta atrasada não sobrescreve a skin atual", () => {
  it("a resposta do último pedido vale", () => {
    expect(respostaAindaVale(3, 3)).toBe(true);
  });

  // O caso real: escolher a AWP, escolher a AK antes de a AWP responder, e a
  // AWP voltar depois.
  it("a resposta de um pedido anterior é descartada", () => {
    let pedidoAtual = 0;
    const daAwp = ++pedidoAtual;
    const daAk = ++pedidoAtual;

    expect(respostaAindaVale(daAwp, pedidoAtual)).toBe(false);
    expect(respostaAindaVale(daAk, pedidoAtual)).toBe(true);
  });

  it("três trocas seguidas: só a última é aplicada", () => {
    let atual = 0;
    const pedidos = [++atual, ++atual, ++atual];
    const aplicados = pedidos.filter((p) => respostaAindaVale(p, atual));
    expect(aplicados).toEqual([3]);
  });
});
