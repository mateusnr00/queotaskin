"use client";

// Drawer mobile do site público, inspirado no Sorteamos.
// Mostra links pras seções e o botão Entrar/Sair.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  LogIn,
  LogOut,
  Menu,
  ShoppingBag,
  Ticket,
  TicketCheck,
  UserCog,
  UserPlus,
  X,
} from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Início", icon: Home },
  { href: "/sorteios", label: "Campanhas", icon: Ticket },
] as const;

const NAV_LOGGED_IN = [
  { href: "/meus-titulos", label: "Meus títulos", icon: TicketCheck },
  { href: "/minha-conta", label: "Minha conta", icon: UserCog },
] as const;

export function PublicMobileMenu({
  isLoggedIn,
  userName,
  showAdminLink,
  adminHref = "/admin",
}: {
  isLoggedIn: boolean;
  userName: string | null;
  showAdminLink: boolean;
  adminHref?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeDrawer = () => setOpen(false);

  return (
    <div className="md:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={closeDrawer}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-72 max-w-[85vw] bg-background border-l flex flex-col transform transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <span className="font-semibold text-sm">Menu</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={closeDrawer}
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {isLoggedIn && (
          <div className="px-4 py-3 border-b bg-muted/30">
            <div className="text-xs text-muted-foreground">Olá,</div>
            <div className="font-semibold text-sm truncate">
              {userName ?? "Visitante"}
            </div>
          </div>
        )}

        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {[...NAV, ...(isLoggedIn ? NAV_LOGGED_IN : [])].map(
            ({ href, label, icon: Icon }) => {
              const active =
                href === "/" ? pathname === "/" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={closeDrawer}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
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
          )}
          {showAdminLink && (
            <Link
              href={adminHref}
              onClick={closeDrawer}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ShoppingBag className="h-4 w-4" />
              Admin
            </Link>
          )}
        </nav>

        <div className="px-3 pb-4 pt-2 border-t">
          {isLoggedIn ? (
            <form action={logoutAction}>
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="w-full"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Link
                href="/login"
                onClick={closeDrawer}
                className="inline-flex items-center justify-center h-11 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <LogIn className="mr-2 h-4 w-4" />
                Entrar
              </Link>
              <Link
                href="/registro"
                onClick={closeDrawer}
                className="inline-flex items-center justify-center h-11 px-4 rounded-md border text-sm font-medium hover:bg-muted"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Criar conta
              </Link>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
