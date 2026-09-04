import { describe, expect, it } from "vitest";
import { baseUrlConfiavel } from "./hosts-confiaveis";

describe("§17 - a autoridade financeira só confia no host oficial do gateway", () => {
  it("aceita o host oficial (https) de cada provider", () => {
    expect(baseUrlConfiavel("SYNCPAY", "https://api.syncpayments.com.br")).toBe(true);
    expect(baseUrlConfiavel("SIGILOPAY", "https://app.sigilopay.com.br/api/v1")).toBe(true);
    expect(baseUrlConfiavel("HORSEPAY", "https://api.horsepay.io")).toBe(true);
    expect(baseUrlConfiavel("NEXUSPAG", "https://nexuspag.com")).toBe(true);
  });
  it("vazio cai no default oficial (aceitável)", () => {
    expect(baseUrlConfiavel("SYNCPAY", "")).toBe(true);
    expect(baseUrlConfiavel("SYNCPAY", null)).toBe(true);
  });
  it("RECUSA servidor controlado pelo atacante", () => {
    expect(baseUrlConfiavel("SYNCPAY", "https://servidor-do-atacante.com")).toBe(false);
    expect(baseUrlConfiavel("SYNCPAY", "https://api.syncpayments.com.br.evil.com")).toBe(false);
    expect(baseUrlConfiavel("HORSEPAY", "https://api.horsepay.io.attacker.net")).toBe(false);
  });
  it("RECUSA http (sem TLS) mesmo no host oficial", () => {
    expect(baseUrlConfiavel("SYNCPAY", "http://api.syncpayments.com.br")).toBe(false);
  });
  it("RECUSA cross-gateway: host de um provider em outro", () => {
    expect(baseUrlConfiavel("SYNCPAY", "https://api.horsepay.io")).toBe(false);
  });
  it("localhost só com permitirLocal (testes), nunca em produção", () => {
    expect(baseUrlConfiavel("SYNCPAY", "http://127.0.0.1:4600", { permitirLocal: true })).toBe(true);
    expect(baseUrlConfiavel("SYNCPAY", "http://127.0.0.1:4600")).toBe(false);
  });
});
