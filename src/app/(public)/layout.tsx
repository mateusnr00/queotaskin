import { SiteHeader } from "@/components/public/site-header";
import { AvisoModal } from "@/components/public/aviso-modal";
import { prisma } from "@/lib/db";
import { getCurrentTenant } from "@/lib/tenant";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Nome do site = nome do tenant resolvido pelo host (multi-tenant).
  // Fallback pro env só pra primeiro boot / build estático.
  const tenant = await getCurrentTenant().catch(() => null);
  const appName =
    tenant?.name || process.env.NEXT_PUBLIC_APP_NAME || "Rifa Online";
  const year = new Date().getFullYear();

  // Aviso/promoção em imagem: só monta quando ligado e com arte. Falhar aqui
  // (banco fora do ar) nunca pode derrubar o site: cai para "sem aviso".
  const aviso =
    tenant
      ? await prisma.tenant
          .findUnique({
            where: { id: tenant.id },
            select: {
              avisoAtivo: true,
              avisoImagemUrl: true,
              avisoAspecto: true,
              avisoLinkUrl: true,
            },
          })
          .catch(() => null)
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      {aviso?.avisoAtivo && aviso.avisoImagemUrl && (
        <AvisoModal
          imagemUrl={aviso.avisoImagemUrl}
          aspecto={aviso.avisoAspecto === "9:16" ? "9:16" : "5:3"}
          destino={aviso.avisoLinkUrl ?? null}
        />
      )}
      <SiteHeader />
      {/* Fica no layout público: conta a visita a qualquer página do site,
          e não do painel, onde só a equipe entra. */}
      <main className="flex-1">{children}</main>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {year} {appName}
      </footer>
    </div>
  );
}
