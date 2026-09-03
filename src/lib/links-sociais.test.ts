// O que pode virar href numa página pública.

import { describe, expect, it } from "vitest";

import { linkDeGrupoDeWhatsapp } from "./links-sociais";

describe("link do grupo de WhatsApp", () => {
  it("aceita o convite de grupo", () => {
    expect(linkDeGrupoDeWhatsapp("https://chat.whatsapp.com/AbC123xyz")).toBe(
      "https://chat.whatsapp.com/AbC123xyz",
    );
  });

  it("aceita o encurtado do próprio WhatsApp", () => {
    expect(linkDeGrupoDeWhatsapp("https://wa.me/5562999999999")).toBe(
      "https://wa.me/5562999999999",
    );
  });

  it("apara o que foi colado com espaço em volta", () => {
    expect(linkDeGrupoDeWhatsapp("  https://chat.whatsapp.com/Ab1  ")).toBe(
      "https://chat.whatsapp.com/Ab1",
    );
  });

  // O motivo de a função existir: isto num href roda script na sessão de
  // quem clicou.
  it("recusa javascript: e data:", () => {
    expect(linkDeGrupoDeWhatsapp("javascript:alert(1)")).toBeNull();
    expect(linkDeGrupoDeWhatsapp("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("recusa outro domínio, mesmo com o nome do WhatsApp no caminho", () => {
    expect(linkDeGrupoDeWhatsapp("https://exemplo.com/chat.whatsapp.com/Ab1")).toBeNull();
    expect(linkDeGrupoDeWhatsapp("https://chat.whatsapp.com.exemplo.com/Ab1")).toBeNull();
  });

  it("recusa http, que serviria o convite em conexão aberta", () => {
    expect(linkDeGrupoDeWhatsapp("http://chat.whatsapp.com/Ab1")).toBeNull();
  });

  it("recusa o domínio sem convite nenhum", () => {
    expect(linkDeGrupoDeWhatsapp("https://chat.whatsapp.com")).toBeNull();
    expect(linkDeGrupoDeWhatsapp("https://chat.whatsapp.com/")).toBeNull();
  });

  it("vazio e nulo não viram botão", () => {
    expect(linkDeGrupoDeWhatsapp("")).toBeNull();
    expect(linkDeGrupoDeWhatsapp("   ")).toBeNull();
    expect(linkDeGrupoDeWhatsapp(null)).toBeNull();
    expect(linkDeGrupoDeWhatsapp(undefined)).toBeNull();
    expect(linkDeGrupoDeWhatsapp("chat.whatsapp.com/Ab1")).toBeNull();
  });
});
