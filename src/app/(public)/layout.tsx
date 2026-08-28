import { SiteHeader } from "@/components/public/site-header";
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

  return (
    <div className="flex min-h-screen flex-col">
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
