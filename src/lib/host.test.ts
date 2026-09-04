import { describe, expect, it } from "vitest";

import { urlDaRequisicao } from "@/lib/host";

/** Uma requisição do jeito que o proxy a recebe: nextUrl mais cabeçalhos. */
function requisicao(nextUrl: string, cabecalhos: Record<string, string>) {
  return { nextUrl: new URL(nextUrl), headers: new Headers(cabecalhos) };
}

describe("urlDaRequisicao", () => {
  it("usa o host do cabeçalho, e não o que o servidor acha que tem", () => {
    // O nextUrl atrás do proxy carrega a origem do AUTH_URL. Redirecionar
    // por ela manda a pessoa para um endereço que não é o que ela abriu.
    const url = urlDaRequisicao(
      requisicao("https://admin.queotaskin.com/?ref=X", {
        host: "www.queotaskin.com",
        "x-forwarded-proto": "https",
      }),
      "/registro",
    );
    expect(url.toString()).toBe("https://www.queotaskin.com/registro");
  });

  it("cabeçalho sem porta LIMPA a porta que veio do nextUrl", () => {
    // A regra da WHATWG URL é traiçoeira aqui: o setter de `host` sem porta
    // deixa a anterior de pé. Sem limpar, o redirect saía para
    // https://www.queotaskin.com:3000, que não atende ninguém.
    const url = urlDaRequisicao(
      requisicao("http://localhost:3000/", {
        host: "www.queotaskin.com",
        "x-forwarded-proto": "https",
      }),
      "/registro",
    );
    expect(url.port).toBe("");
    expect(url.toString()).toBe("https://www.queotaskin.com/registro");
  });

  it("cabeçalho COM porta mantém a porta dele", () => {
    const url = urlDaRequisicao(
      requisicao("http://localhost:3000/", { host: "127.0.0.1:3300" }),
      "/registro",
    );
    expect(url.toString()).toBe("http://127.0.0.1:3300/registro");
  });

  it("descarta a query da origem: quem chama monta a dele", () => {
    const url = urlDaRequisicao(
      requisicao("https://queotaskin.com/?ref=MATEUS7K&utm_source=x", {
        host: "queotaskin.com",
      }),
      "/registro",
    );
    expect(url.search).toBe("");
  });

  it("sem cabeçalho Host, fica com o que veio no nextUrl", () => {
    const url = urlDaRequisicao(
      requisicao("https://queotaskin.com/", {}),
      "/login",
    );
    expect(url.toString()).toBe("https://queotaskin.com/login");
  });

  it("x-forwarded-proto com lista pega o primeiro", () => {
    const url = urlDaRequisicao(
      requisicao("http://queotaskin.com/", {
        host: "queotaskin.com",
        "x-forwarded-proto": "https, http",
      }),
      "/registro",
    );
    expect(url.protocol).toBe("https:");
  });
});

import { caminhoDeRedirecionamentoSeguro } from "@/lib/host";
describe("caminhoDeRedirecionamentoSeguro (§22 open redirect)", () => {
  it("aceita caminho interno, recusa externo/protocolo-relativo/esquema", () => {
    expect(caminhoDeRedirecionamentoSeguro("/minha-conta")).toBe("/minha-conta");
    expect(caminhoDeRedirecionamentoSeguro("https://evil.com")).toBe("/");
    expect(caminhoDeRedirecionamentoSeguro("//evil.com")).toBe("/");
    expect(caminhoDeRedirecionamentoSeguro("/\\evil.com")).toBe("/");
    expect(caminhoDeRedirecionamentoSeguro("javascript:alert(1)")).toBe("/");
    expect(caminhoDeRedirecionamentoSeguro(null)).toBe("/");
  });
});
