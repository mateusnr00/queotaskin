import Link from "next/link";
import { headers } from "next/headers";

import { BrandMark } from "@/components/brand/brand-mark";
import { SiteHeader } from "@/components/public/site-header";
import { ProvasDoSite } from "@/components/auth/provas-do-site";
import {
  FundoDoPainel,
  SkinDoPainel,
  TEM_ARTE_DE_FUNDO,
  campanhaEmDestaque,
} from "@/components/auth/vitrine-de-skins";
import { getBrand } from "@/lib/brand";
import { getCurrentTenant } from "@/lib/tenant";
import { isAdminHost } from "@/lib/host";

// Telas de entrar, criar conta e trocar senha.
//
// Cabeçalho do site em cima e duas colunas embaixo: arte à esquerda,
// formulário à direita. O cabeçalho é o mesmo componente do resto do site, e
// não uma cópia: quem chega aqui por um link direto continua conseguindo ir
// para as campanhas, e uma segunda barra desenhada à parte divergiria da
// verdadeira na primeira mudança.
//
// No host do painel nada disso aparece. Quem entra ali é da equipe, não vai
// comprar número, e listar campanha do site numa tela de acesso restrito só
// daria informação a quem bate na porta.

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
  const noPainel = isAdminHost(host);
  const tenant = noPainel ? null : await getCurrentTenant();
  const destaque = tenant ? await campanhaEmDestaque(tenant.id) : null;
  const ano = new Date().getFullYear();

  if (noPainel) {
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
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* Painel da arte. Some no celular: ali ele empurraria o formulário
            para baixo da dobra, e o formulário é o motivo da tela existir. */}
        <aside className="relative hidden overflow-hidden border-r bg-black lg:flex lg:w-1/2 lg:flex-col lg:justify-between">
          <FundoDoPainel />

          {/* Com a arte no fundo, a skin da campanha sai daqui: seriam duas
              vitrines empilhadas na mesma coluna, uma tapando a outra. Ela
              continua no cartão, como ficha, que é onde decide compra. */}
          <div className="relative z-10 flex flex-1 items-center justify-center p-10 xl:p-14">
            {!TEM_ARTE_DE_FUNDO && destaque && (
              <SkinDoPainel campanha={destaque} />
            )}
          </div>

          <div className="relative z-10 space-y-5 p-8 xl:p-10">
            <ProvasDoSite />
            <p className="border-t border-white/10 pt-4 text-[11px] text-white/35">
              © {ano} {marca.name}. Todos os direitos reservados.
            </p>
          </div>
        </aside>

        <main className="flex flex-1 items-center justify-center px-4 py-10 md:py-14">
          <div className="w-full max-w-lg">{children}</div>
        </main>
      </div>
    </div>
  );
}
