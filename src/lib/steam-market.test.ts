import { describe, expect, it } from "vitest";

import {
  ehSemPintura,
  nomeDeMercado,
  precoDaSteamEmReais,
  volumeDaSteam,
} from "./steam-market";
import { precoExatoPorNumero, precoPorNumero, arrecadacaoPrevista } from "./dinheiro";

describe("precoDaSteamEmReais", () => {
  it("lê o formato que a Steam manda em português", () => {
    expect(precoDaSteamEmReais("R$ 128,45")).toBe(128.45);
    expect(precoDaSteamEmReais("R$ 1.249,90")).toBe(1249.9);
  });

  it("aguenta o espaço não separável depois do R$", () => {
    // A Steam manda U+00A0, e não espaço comum. Passou despercebido uma vez.
    expect(precoDaSteamEmReais("R$ 1.249,90")).toBe(1249.9);
  });

  it("não confunde separador de milhar com decimal", () => {
    // parseFloat("1.249,90") devolveria 1.249, errando por mil vezes. É o
    // motivo de este leitor existir.
    expect(precoDaSteamEmReais("R$ 1.249,90")).not.toBe(1.249);
    expect(precoDaSteamEmReais("R$ 12.345,67")).toBe(12345.67);
  });

  it("devolve nulo para ausente, vazio ou zero", () => {
    expect(precoDaSteamEmReais(undefined)).toBeNull();
    expect(precoDaSteamEmReais(null)).toBeNull();
    expect(precoDaSteamEmReais("")).toBeNull();
    expect(precoDaSteamEmReais("R$ 0,00")).toBeNull();
    expect(precoDaSteamEmReais("sem preço")).toBeNull();
  });
});

describe("volumeDaSteam", () => {
  it("lê o volume com separador de milhar", () => {
    expect(volumeDaSteam("523")).toBe(523);
    expect(volumeDaSteam("1.234")).toBe(1234);
    expect(volumeDaSteam(undefined)).toBeNull();
  });
});

describe("nomeDeMercado", () => {
  it("monta o nome com o desgaste entre parênteses", () => {
    expect(nomeDeMercado({ name: "AK-47 | Redline" }, "FIELD_TESTED")).toBe(
      "AK-47 | Redline (Field-Tested)",
    );
  });

  it("StatTrak vem depois da estrela, Souvenir vem antes de tudo", () => {
    expect(
      nomeDeMercado({ name: "★ Karambit | Fade", skinStatTrak: true }, "FACTORY_NEW"),
    ).toBe("★ StatTrak™ Karambit | Fade (Factory New)");
    expect(
      nomeDeMercado({ name: "AWP | Dragon Lore", skinSouvenir: true }, "WELL_WORN"),
    ).toBe("Souvenir AWP | Dragon Lore (Well-Worn)");
  });

  it("tira a fase da Doppler, que não existe no nome de mercado da Steam", () => {
    // Um quinto do catálogo é skin de fase. Sem isto, nenhuma acha preço.
    expect(
      nomeDeMercado({ name: "★ Stiletto Knife | Doppler Phase 1" }, "FACTORY_NEW"),
    ).toBe("★ Stiletto Knife | Doppler (Factory New)");
    expect(
      nomeDeMercado({ name: "★ Bowie Knife | Gamma Doppler Emerald" }, "MINIMAL_WEAR"),
    ).toBe("★ Bowie Knife | Gamma Doppler (Minimal Wear)");
  });

  it("nome que termina em palavra de fase sem ser Doppler fica inteiro", () => {
    expect(nomeDeMercado({ name: "AK-47 | Emerald Pinstripe" }, "FIELD_TESTED")).toBe(
      "AK-47 | Emerald Pinstripe (Field-Tested)",
    );
  });

  it("reconhece faca sem pintura", () => {
    expect(ehSemPintura("★ Bayonet")).toBe(true);
    expect(ehSemPintura("★ Bayonet | Lore")).toBe(false);
    expect(ehSemPintura("AK-47 | Redline")).toBe(false);
  });
});

describe("a conta da cota", () => {
  it("R$ 1.249 em 10.000 números: exato 0,1249 e sugerido 0,13", () => {
    // O exemplo do pedido, com o arredondamento para CIMA.
    expect(precoExatoPorNumero(1249, 10_000)).toBeCloseTo(0.1249, 10);
    expect(precoPorNumero(1249, 10_000)).toBe(0.13);
  });

  it("R$ 100 em 1.000 números: 0,10 exato, sem arredondar para cima à toa", () => {
    expect(precoExatoPorNumero(100, 1000)).toBeCloseTo(0.1, 10);
    expect(precoPorNumero(100, 1000)).toBe(0.1);
  });

  it("arredonda SEMPRE para cima no próximo centavo", () => {
    // Para baixo, a campanha arrecadaria menos que a skin custa.
    expect(precoPorNumero(12.01, 100)).toBe(0.13);
    expect(precoPorNumero(12.99, 100)).toBe(0.13);
    expect(precoPorNumero(13.0, 100)).toBe(0.13);
  });

  it("a arrecadação prevista cobre o valor da skin", () => {
    // É a consequência do arredondamento para cima, e a tela mostra a
    // diferença porque em campanha grande ela vira centenas de reais.
    const cota = precoPorNumero(1249, 10_000)!;
    const total = arrecadacaoPrevista(cota, 10_000)!;
    expect(total).toBe(1300);
    expect(total).toBeGreaterThanOrEqual(1249);
  });

  it("entrada sem sentido não vira número", () => {
    expect(precoExatoPorNumero(0, 100)).toBeNull();
    expect(precoPorNumero(100, 0)).toBeNull();
    expect(arrecadacaoPrevista(-1, 100)).toBeNull();
  });
});
