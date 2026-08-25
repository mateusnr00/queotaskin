import Link from "next/link";
import { TicketCheck } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button, buttonVariants } from "@/components/ui/button";
import { signOut } from "@/auth";
import { cn } from "@/lib/utils";
import { adminHref, isAdminOnSeparateHost } from "@/lib/admin-host";
import { getCurrentTenant } from "@/lib/tenant";
import { PublicMobileMenu } from "./public-mobile-menu";
import { RankChip } from "@/components/rank/rank-chip";

// Header público compacto inspirado no Sorteamos: logo à esquerda,
// menu hambúrguer no mobile, ações no desktop. Quando admin liga
// "Header com cor de destaque", o header inteiro pinta de primary.
//
// Quando o painel admin roda em host separado (admin.sorteios.vip), o link
// "Admin" não é mostrado no site público — quem é admin acessa direto pelo
// outro domínio. Em dev/preview (mesmo host pra tudo), o link aparece pra
// quem é admin pra facilitar a navegação local.
export async function SiteHeader() {
  const session = await auth();
  const [freshUser, tenantCtx, adminLinkHref, adminOnSeparateHost] =
    await Promise.all([
      session?.user?.id
        ? prisma.user
            .findUnique({
              where: { id: session.user.id },
              select: { role: true },
            })
            .catch(() => null)
        : Promise.resolve(null),
      getCurrentTenant().catch(() => null),
      adminHref(),
      isAdminOnSeparateHost(),
    ]);
  // Tenant traz só id/slug/name; busca os campos visuais (logo + accent)
  // numa query separada — esses agora vivem no Tenant, não no global.
  const tenantVisual = tenantCtx
    ? await prisma.tenant
        .findUnique({
          where: { id: tenantCtx.id },
          select: {
            logoUrl: true,
            logoShape: true,
            headerAccent: true,
            rankEnabled: true,
            xpPerBrl: true,
          },
        })
        .catch(() => null)
    : null;

  // Chip de rank no header. Só monta quando há usuário, tenant e o rank está
  // ligado — falhar aqui não pode derrubar o cabeçalho do site inteiro.
  const rankChip =
    session?.user?.id && tenantCtx && tenantVisual?.rankEnabled
      ? await prisma.userProgress
          .findUnique({
            where: {
              userId_tenantId: { userId: session.user.id, tenantId: tenantCtx.id },
            },
            select: { xp: true },
          })
          .then((p) => ({ xp: p?.xp ?? 0, xpPerBrl: tenantVisual.xpPerBrl }))
          .catch(() => null)
      : null;
  // Em produção (host split ativo), o site público nunca mostra o link Admin
  // — quem é admin acessa via admin.<dominio>. Só liga o link em dev/preview
  // onde tudo vive no mesmo host.
  const showAdminLink =
    (freshUser?.role === "ADMIN" || freshUser?.role === "SUPER_ADMIN") &&
    !adminOnSeparateHost;
  const appName =
    tenantCtx?.name || process.env.NEXT_PUBLIC_APP_NAME || "Rifa Online";
  const logoUrl = tenantVisual?.logoUrl ?? null;
  // Marca em faixa já traz o nome desenhado; repetir "QuéOta Skin" ao lado
  // dela duplicaria a leitura e é o que os sites de referência evitam.
  // Emblema redondo não diz o nome, então ali o texto fica.
  const logoEmFaixa = tenantVisual?.logoShape === "RECTANGLE";
  const accent = tenantVisual?.headerAccent ?? false;

  return (
    <header
      className={cn(
        "border-b sticky top-0 z-30 transition-colors",
        accent
          ? "bg-primary text-primary-foreground border-primary/80"
          : "bg-background"
      )}
    >
      <div className="container mx-auto flex h-14 items-center justify-between px-4 max-w-6xl">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          {logoUrl ? (
            // object-contain na faixa: a imagem inteira cabe na altura do
            // header e a largura acompanha a proporção, sem recorte. No
            // emblema, object-cover preenche o círculo — que é o que se
            // espera de um avatar.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={appName}
              className={cn(
                logoEmFaixa
                  ? "h-8 w-auto max-w-[170px] object-contain sm:max-w-[220px]"
                  : "h-8 w-8 rounded-full object-cover"
              )}
            />
          ) : (
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                accent
                  ? "bg-primary-foreground text-primary"
                  : "bg-foreground text-background"
              )}
            >
              <TicketCheck className="h-4 w-4" />
            </span>
          )}
          {!logoEmFaixa && (
            <span className="text-sm sm:text-base">{appName}</span>
          )}
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link
            href="/sorteios"
            className="px-3 py-1.5 rounded-md hover:bg-muted"
          >
            Campanhas
          </Link>
          {session?.user ? (
            <>
              <Link
                href="/meus-titulos"
                className="px-3 py-1.5 rounded-md hover:bg-muted"
              >
                Meus títulos
              </Link>
              <Link
                href="/minha-conta"
                className="px-3 py-1.5 rounded-md hover:bg-muted"
              >
                Minha conta
              </Link>
              {showAdminLink && (
                <Link
                  href={adminLinkHref}
                  className="px-3 py-1.5 rounded-md hover:bg-muted"
                >
                  Admin
                </Link>
              )}
              {rankChip ? (
                <span className="ml-2">
                  <RankChip
                    name={session.user.name?.split(" ")[0] ?? "Você"}
                    xp={rankChip.xp}
                    xpPerBrl={rankChip.xpPerBrl}
                  />
                </span>
              ) : (
                <span className="ml-2 text-xs text-muted-foreground">
                  {session.user.name?.split(" ")[0]}
                </span>
              )}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <Button type="submit" variant="outline" size="sm">
                  Sair
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-1.5 rounded-md hover:bg-muted"
              >
                Entrar
              </Link>
              <Link
                href="/registro"
                className={buttonVariants({ size: "sm" })}
              >
                Criar conta
              </Link>
            </>
          )}
        </nav>

        {/* Mobile drawer */}
        <PublicMobileMenu
          isLoggedIn={Boolean(session?.user)}
          userName={session?.user?.name ?? null}
          showAdminLink={showAdminLink}
          adminHref={adminLinkHref}
        />
      </div>
    </header>
  );
}
