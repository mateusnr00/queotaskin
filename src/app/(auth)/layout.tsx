import Link from "next/link";
import { headers } from "next/headers";

import { BrandMark } from "@/components/brand/brand-mark";
import { SiteHeader } from "@/components/public/site-header";
import { ProvasDoSite } from "@/components/auth/provas-do-site";
import { FundoDaTela } from "@/components/auth/vitrine-de-skins";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/brand";
import { getCurrentTenant } from "@/lib/tenant";
import { isAdminHost } from "@/lib/host";

// Telas de entrar, criar conta e trocar senha.
//
// A arte cobre a página inteira e o conteúdo flutua por cima. Chegou aqui em
// dois passos: antes era um gradiente vazio com um texto de painel de
// administrador, depois virou arte só na metade esquerda, o que deixava uma
// linha vertical no meio do monitor com preto liso do outro lado.
//
// O cabeçalho é o mesmo componente do resto do site, e não uma cópia: quem
// chega por link direto continua conseguindo ir para as campanhas, e uma
// segunda barra desenhada à parte divergiria da verdadeira na primeira
// mudança.
//
// No host do painel nada disso aparece. Quem entra ali é da equipe, e a
// tela de acesso restrito não precisa de vitrine.

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O nome vem do tenant, não da variável de ambiente: com NEXT_PUBLIC_APP_NAME
  // ausente esta tela dizia "Rifa Online" para quem estava entrando no
  // QuéOta Skin, e num deploy multi-tenant diria o nome de um site só.
  const marca = await getBrand();
  const host = (await headers()).get("host") ?? "";
  const ano = new Date().getFullYear();

  // A arte de fundo é do site, cadastrada no painel. Falhar aqui não pode
  // derrubar a tela de entrar: sem ela o fundo cai na arte embutida.
  const tenant = isAdminHost(host) ? null : await getCurrentTenant().catch(() => null);
  const fundo = tenant
    ? await prisma.tenant
        .findUnique({
          where: { id: tenant.id },
          select: { authBackgroundUrl: true },
        })
        .then((t) => t?.authBackgroundUrl ?? null)
        .catch(() => null)
    : null;

  if (isAdminHost(host)) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6">
          <Link href="/" className="inline-flex">
            <BrandMark marca={marca} alturaDaFaixa="h-9" ladoDoEmblema="h-9 w-9" />
          </Link>
          {children}
        </div>
      </div>
    );
  }

  return (
    // Altura travada na tela, e não min-h-screen. Eram dois min-h-screen
    // aninhados, e o de dentro pedia uma tela inteira DEPOIS do cabeçalho:
    // a página passava da altura da janela por causa do cabeçalho, e o
    // celular ficava com uma rolagem de alguns pixels que não levava a lugar
    // nenhum, aquela sensação de tela solta.
    //
    // dvh e não vh porque no celular a barra do navegador entra e sai, e vh
    // considera sempre a maior altura: com ela a tela nasceria mais alta que
    // o espaço realmente visível, que é o mesmo defeito por outro caminho.
    <div className="relative flex h-[100dvh] flex-col overflow-hidden">
      <FundoDaTela url={fundo} />

      {/* Todo o conteúdo numa camada acima do fundo. Sem isto o fundo fixo,
          que é irmão e vem depois no fluxo, ficaria por cima do formulário. */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <SiteHeader />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* A coluna da esquerda existe para dar respiro à arte e segurar as
              provas no pé. Some no celular, onde a tela é estreita e ela
              empurraria o formulário para baixo da dobra. */}
          <aside className="hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-end lg:p-10 xl:p-12">
            <div className="space-y-5">
              <ProvasDoSite />
              <p className="border-t border-white/10 pt-4 text-[11px] text-white/40">
                © {ano} {marca.name}. Todos os direitos reservados.
              </p>
            </div>
          </aside>

          {/* A rolagem, quando precisa existir, mora aqui dentro e não na
              página. Formulário com erro em tela pequena cresce, e sem esta
              válvula o conteúdo ficaria cortado sem como alcançá-lo. */}
          <main className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-8 md:py-12">
            <div className="w-full max-w-lg">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
