import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SeloDoBoost } from "@/components/public/selo-do-boost";
import { boostAtivoAgora } from "@/server/services/caixa-de-level-up";
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
// "Admin" não é mostrado no site público, quem é admin acessa direto pelo
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
  // numa query separada, esses agora vivem no Tenant, não no global.
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

  // Selo de moderador: interruptor por pessoa, não derivado do papel. Falhar
  // aqui só tira o selo, nunca derruba o cabeçalho.
  const ehMod = session?.user?.id
    ? await prisma.user
        .findUnique({
          where: { id: session.user.id },
          select: { showModBadge: true },
        })
        .then((u) => u?.showModBadge ?? false)
        .catch(() => false)
    : false;

  // Chip de rank no header. Só monta quando há usuário, tenant e o rank está
  // ligado, falhar aqui não pode derrubar o cabeçalho do site inteiro.
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

  // O boost de level up ativo, ao lado do rank. Fica aqui porque é onde a
  // pessoa já olha para ver o próprio nível, e some sozinho quando o prazo
  // acaba. Falhar não pode derrubar o cabeçalho do site inteiro.
  const boostAtivo =
    session?.user?.id && tenantCtx && tenantVisual?.rankEnabled
      ? await boostAtivoAgora(session.user.id, tenantCtx.id).catch(() => null)
      : null;
  // Em produção (host split ativo), o site público nunca mostra o link
  // Admin: quem é admin acessa via admin.<dominio>. Só liga o link em
  // dev/preview, onde tudo vive no mesmo host.
  const showAdminLink =
    (freshUser?.role === "ADMIN" || freshUser?.role === "SUPER_ADMIN") &&
    !adminOnSeparateHost;
  const appName =
    tenantCtx?.name || process.env.NEXT_PUBLIC_APP_NAME || "Rifa Online";
  const logoUrl = tenantVisual?.logoUrl ?? null;
  const logoShape = tenantVisual?.logoShape ?? "RECTANGLE";
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
        <Link href="/">
          <BrandMark
            marca={{ name: appName, logoUrl, logoShape }}
            fallbackClassName={
              accent
                ? "bg-primary-foreground text-primary"
                : "bg-foreground text-background"
            }
          />
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
              {/* Logo depois de "Minha conta", igual ao menu do celular: o
                  programa não se vende sozinho se não tiver porta na barra. */}
              <Link
                href="/minha-conta/afiliados"
                className="px-3 py-1.5 rounded-md hover:bg-muted"
              >
                Afiliados
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
                    mod={ehMod}
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

        {/* O boost ativo, discreto, ao lado do rank. Pílula do tamanho de um
            botão do cabeçalho: quinze minutos de prazo pedem lembrete, não
            anúncio, e uma faixa grande viraria ruído no terceiro minuto. */}
        {boostAtivo && (
          <div className="ml-auto hidden md:block">
            <SeloDoBoost boost={boostAtivo} />
          </div>
        )}

        {/* Rank no celular. O nav inteiro é hidden md:flex, então sem isto o
            cliente não vê o próprio nível no aparelho de onde vem a maior
            parte do tráfego, e o espaço entre a logo e o menu fica vazio. */}
        {rankChip && (
          <div className="ml-auto mr-2 md:hidden">
            <RankChip
              name={session?.user?.name?.split(" ")[0] ?? "Você"}
              xp={rankChip.xp}
              xpPerBrl={rankChip.xpPerBrl}
              compact
              mod={ehMod}
            />
          </div>
        )}

        {/* Criar conta no TOPO do celular, para quem ainda não tem conta. No
            desktop o nav já mostra "Entrar/Criar conta"; no celular esse nav é
            hidden e sobrava só o hambúrguer, então o caminho principal (criar
            conta) ficava escondido dentro da gaveta. "Entrar" continua na
            gaveta, que é onde quem já tem conta procura. O ml-auto empurra o
            botão e o hambúrguer juntos para a direita quando não há rank. */}
        {!session?.user && (
          <Link
            href="/registro"
            className={cn(
              buttonVariants({ size: "sm" }),
              "md:hidden mr-2",
              rankChip ? "" : "ml-auto",
            )}
          >
            Criar conta
          </Link>
        )}

        {/* Mobile drawer */}
        <PublicMobileMenu
          isLoggedIn={Boolean(session?.user)}
          userName={session?.user?.name ?? null}
          showAdminLink={showAdminLink}
          adminHref={adminLinkHref}
          // O mesmo rank do cabeçalho entra no cartão do usuário dentro da
          // gaveta: o dado já foi buscado aqui, e repetir a consulta lá
          // dentro seria uma ida ao banco para mostrar o que já está na mão.
          rank={
            rankChip
              ? { xp: rankChip.xp, xpPerBrl: rankChip.xpPerBrl, mod: ehMod }
              : null
          }
        />
      </div>
    </header>
  );
}
