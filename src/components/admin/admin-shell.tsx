"use client";

// Shell do admin com layout responsivo no estilo Sorteamos:
// - Sidebar com card do usuário no topo, seções "GERAL" e "CONFIGURAÇÕES"
// - Desktop (md+): sidebar fixa
// - Mobile: drawer com hambúrguer
// - Tema de cores (paleta laranja) puxado das CSS vars

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  LayoutDashboard,
  MessageSquare,
  Menu,
  Palette,
  Settings,
  ShoppingBag,
  TicketCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_GERAL = [
  { href: "/admin", label: "Início", icon: LayoutDashboard },
  { href: "/admin/sorteios", label: "Sorteios", icon: TicketCheck },
  { href: "/admin/reservas", label: "Reservas", icon: ShoppingBag },
  { href: "/admin/usuarios", label: "Usuários", icon: Users },
  { href: "/admin/relatorios", label: "Relatórios", icon: BarChart3 },
] as const;

const NAV_CONFIG = [
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
  { href: "/admin/configuracoes/pagamentos", label: "Pagamentos", icon: Wallet },
  { href: "/admin/configuracoes/mensagens", label: "Mensagens", icon: MessageSquare },
  { href: "/admin/personalizar-tema", label: "Personalizar tema", icon: Palette },
] as const;

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Rifa";

export function AdminShell({
  userName,
  children,
}: {
  userName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const closeDrawer = () => setOpen(false);
  const initial = userName.charAt(0).toUpperCase();
  const firstName = userName.split(" ")[0] ?? userName;

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-muted/30">
      {/* Topbar mobile */}
      <header className="md:hidden flex items-center justify-between border-b bg-background px-4 py-3 sticky top-0 z-30">
        <Link
          href="/admin"
          className="flex items-center gap-2 font-semibold"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
            <TicketCheck className="h-4 w-4" />
          </span>
          <span>{APP_NAME}</span>
        </Link>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 font-semibold text-foreground">
            {initial}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={closeDrawer}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "bg-background border-r flex flex-col",
          // Mobile: fixed overlay
          "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] transform transition-transform duration-200 overflow-y-auto",
          open ? "translate-x-0" : "-translate-x-full",
          // Desktop: static
          "md:static md:translate-x-0 md:w-64 md:max-w-none md:transition-none md:min-h-screen"
        )}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <Link
            href="/admin"
            onClick={closeDrawer}
            className="flex items-center gap-2 font-semibold"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground text-background">
              <TicketCheck className="h-4 w-4" />
            </span>
            <span>{APP_NAME}</span>
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={closeDrawer}
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Card do usuário */}
        <div className="px-4 pt-4">
          <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/30 font-semibold text-foreground">
              {initial}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight truncate">
                {userName}
              </div>
              <div className="text-xs text-muted-foreground leading-tight mt-0.5">
                admin
              </div>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-4 pt-5 pb-4 text-sm flex-1">
          <SectionHeader>Geral</SectionHeader>
          {NAV_GERAL.map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={Icon}
              active={
                href === "/admin"
                  ? pathname === "/admin"
                  : pathname.startsWith(href)
              }
              onClick={closeDrawer}
            />
          ))}

          <SectionHeader>Configurações</SectionHeader>
          {NAV_CONFIG.map(({ href, label, icon: Icon }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={Icon}
              active={pathname.startsWith(href)}
              onClick={closeDrawer}
            />
          ))}
        </nav>

        <div className="px-4 pb-4">
          <form action={logoutAction}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="w-full"
            >
              Sair
            </Button>
          </form>
        </div>
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar desktop com saudação à direita */}
        <div className="hidden md:flex items-center justify-end gap-3 px-6 py-4 border-b bg-background/80 backdrop-blur sticky top-0 z-20">
          <span className="text-sm text-muted-foreground">
            Olá, <span className="text-foreground font-medium">{firstName}</span>
          </span>
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/30 font-semibold text-foreground">
            {initial}
          </span>
        </div>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
      {children}
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors",
        active
          ? "bg-primary/15 text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon
        className={cn("h-4 w-4", active ? "text-primary" : "")}
      />
      {label}
    </Link>
  );
}
