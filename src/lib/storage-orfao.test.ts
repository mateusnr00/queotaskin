import { describe, expect, it, vi } from "vitest";

// A guarda é testada pela decisão que ela toma, e não pelo Supabase: o que
// importa aqui é "apaga ou não apaga", e foi justamente essa decisão que
// faltava quando a capa do sorteio e a arte da skin apontavam para o mesmo
// arquivo e apagar uma levava a outra.

vi.mock("@supabase/supabase-js", () => ({ createClient: () => null }));

// O bucket entra aqui, e não pelo ambiente: teste que só passa quando a
// variável já está definida na máquina não testa nada, passa por acaso.
process.env.SUPABASE_STORAGE_BUCKET = "raffle-images";

const { apagarArquivoSeOrfao, pathFromPublicUrl } = await import("./storage");

const URL_DE_TESTE =
  "https://x.supabase.co/storage/v1/object/public/raffle-images/raffles/skins/abc.webp";

describe("apagarArquivoSeOrfao", () => {
  it("não consulta nada quando a URL não é do bucket", async () => {
    const referencia = vi.fn(async () => false);
    await apagarArquivoSeOrfao("https://outro.site/imagem.png", referencia);
    expect(referencia).not.toHaveBeenCalled();
  });

  it("pergunta antes de apagar", async () => {
    const referencia = vi.fn(async () => true);
    await apagarArquivoSeOrfao(URL_DE_TESTE, referencia);
    expect(referencia).toHaveBeenCalledOnce();
  });

  it("segue adiante quando ninguém mais aponta para o arquivo", async () => {
    const referencia = vi.fn(async () => false);
    await expect(
      apagarArquivoSeOrfao(URL_DE_TESTE, referencia),
    ).resolves.toBeUndefined();
    expect(referencia).toHaveBeenCalledOnce();
  });
});

describe("pathFromPublicUrl", () => {
  it("extrai o caminho dentro do bucket", () => {
    expect(pathFromPublicUrl(URL_DE_TESTE)).toBe("raffles/skins/abc.webp");
  });

  it("devolve null para URL de fora", () => {
    expect(pathFromPublicUrl("https://outro.site/imagem.png")).toBeNull();
  });
});
