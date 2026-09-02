"use client";

// O menu do celular, que é por onde vem a maior parte do tráfego.
//
// A versão anterior era uma gaveta cinza com "Menu" escrito em cima, cinco
// linhas de 40px em texto apagado e um botão "Sair". Funcionava, e era só
// isso: nada ali dizia de quem era a conta, em que nível ela está, nem o que
// o site quer que a pessoa faça. Quatro problemas de verdade, além do
// desenho:
//
// A GAVETA FICAVA NO AR. Ela nunca era desmontada, só empurrada para fora da
// tela com `translate-x-full`. Os links continuavam na ordem de tabulação:
// quem navega por teclado saía do cabeçalho e caía dentro de um menu fechado,
// invisível, sem entender para onde o foco tinha ido. Agora ela recebe
// `inert` quando fechada, que tira o conteúdo inteiro da tabulação e da
// leitura de tela sem custar a animação de saída.
//
// A PÁGINA ROLAVA ATRÁS. Arrastar sobre a gaveta rolava o conteúdo do site
// por baixo dela, e ao fechar a pessoa estava noutro ponto da página.
//
// NÃO FECHAVA COM ESC, e o foco não entrava nem voltava: abrir o menu e
// fechá-lo devolvia o foco para o começo do documento, não para o botão que
// abriu.
//
// O RODAPÉ ENCOSTAVA NA BARRA DE GESTOS do iPhone. `env(safe-area-inset-*)`
// resolve, e sem isso o "Sair" fica na faixa em que o sistema captura o
// arrasto para voltar à tela inicial.
//
// O QUE MUDOU NO DESENHO
//
// O topo mostra a marca, e não a palavra "Menu": quem abriu sabe que abriu o
// menu, e o espaço serve melhor à identidade do site.
//
// O bloco do usuário virou cartão com selo de nível, o mesmo chip do
// cabeçalho. Ele responde "quem sou aqui" e "quanto falta para subir", que é
// o que faz alguém voltar, e leva para a conta num toque.
//
// Os itens ganharam grupo, chevron e 48px de altura. Grupo porque "Início" e
// "Campanhas" são o site, e "Meus títulos", "Minha conta" e "Afiliados" são a
// pessoa: misturados numa lista só, a pessoa lia os cinco toda vez.
//
// Visitante não vê lista comprida: vê para onde ir (Campanhas) e os dois
// botões que o site quer que ele use, criar conta e entrar.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  Home,
  LogIn,
  LogOut,
  Menu,
  ShieldCheck,
  Ticket,
  TicketCheck,
  UserCog,
  UserPlus,
  X,
  Link2,
} from "lucide-react";

import { logoutAction } from "@/server/actions/auth";
import { RankChip } from "@/components/rank/rank-chip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** O site: para onde qualquer pessoa pode ir. */
const NAV_DO_SITE = [
  { href: "/", label: "Início", icon: Home },
  { href: "/sorteios", label: "Campanhas", icon: Ticket },
] as const;

/** A pessoa: só existe com conta. */
const NAV_DA_CONTA = [
  { href: "/meus-titulos", label: "Meus títulos", icon: TicketCheck },
  { href: "/minha-conta", label: "Minha conta", icon: UserCog },
  // Para todo mundo que está logado: quem já é afiliado vem buscar o link, e
  // quem não é descobre que o programa existe. A página decide o que mostrar.
  {
    href: "/minha-conta/afiliados",
    label: "Programa de afiliados",
    icon: Link2,
  },
] as const;

export function PublicMobileMenu({
  isLoggedIn,
  userName,
  showAdminLink,
  adminHref = "/admin",
  rank,
}: {
  isLoggedIn: boolean;
  userName: string | null;
  showAdminLink: boolean;
  adminHref?: string;
  /** O nível, quando o rank está ligado. Sem ele o cartão mostra só o nome. */
  rank?: { xp: number; xpPerBrl: number; mod: boolean } | null;
}) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const gaveta = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  const fechar = useCallback(() => setAberto(false), []);

  useEffect(() => {
    if (!aberto) return;

    // Trava a rolagem do fundo e devolve exatamente o que estava lá antes:
    // gravar o valor anterior evita brigar com qualquer outro código que
    // também mexa no overflow do body.
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", aoTeclar);

    // O botão VOLTAR do navegador também fecha. Clicar num link já fecha pelo
    // onClick, mas voltar não passa por link nenhum, e sem isto a gaveta
    // ficava aberta por cima da tela anterior.
    window.addEventListener("popstate", fechar);

    // O foco entra na gaveta para quem navega por teclado ou leitor de tela
    // não continuar no cabeçalho, atrás do painel.
    gaveta.current?.focus();

    return () => {
      document.body.style.overflow = anterior;
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("popstate", fechar);
      // E volta para o botão que abriu, que é onde a pessoa estava.
      botao.current?.focus();
    };
  }, [aberto, fechar]);

  const primeiroNome = userName?.trim().split(/\s+/)[0] ?? "Visitante";
  const inicial = primeiroNome.charAt(0).toUpperCase() || "?";

  return (
    <div className="md:hidden">
      <Button
        ref={botao}
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* O véu escurece e desfoca o site atrás: a gaveta passa a ser a única
          coisa em foco, e o fundo continua reconhecível. */}
      <div
        onClick={fechar}
        aria-hidden
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300",
          aberto ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <div
        ref={gaveta}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navegação"
        tabIndex={-1}
        // inert tira o conteúdo da tabulação e do leitor de tela quando a
        // gaveta está fechada, sem desmontar: assim a animação de saída
        // continua existindo e o teclado não cai num painel invisível.
        inert={!aberto}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[19rem] max-w-[88vw] flex-col border-l border-white/10 bg-[#0b0d10] shadow-2xl outline-none",
          // Desaceleração na entrada, que é a curva de algo que chega e
          // encosta. Quem pede menos movimento recebe a troca seca.
          "transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          aberto ? "translate-x-0" : "translate-x-full",
        )}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
          <span className="text-[11px] font-bold tracking-[0.2em] text-muted-foreground uppercase">
            Menu
          </span>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar menu"
            className="-mr-1 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoggedIn && (
          <div className="border-b border-white/[0.06] p-3">
            <Link
              href="/minha-conta"
              onClick={fechar}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 transition-colors hover:border-primary/30 hover:bg-white/[0.06]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-black text-primary">
                {inicial}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {primeiroNome}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  Ver minha conta
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
            </Link>

            {rank && (
              <div className="mt-2">
                <RankChip
                  name={primeiroNome}
                  xp={rank.xp}
                  xpPerBrl={rank.xpPerBrl}
                  mod={rank.mod}
                />
              </div>
            )}
          </div>
        )}

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          <Grupo titulo="Navegar">
            {NAV_DO_SITE.map((item) => (
              <ItemDoMenu
                key={item.href}
                {...item}
                pathname={pathname}
                aoClicar={fechar}
              />
            ))}
          </Grupo>

          {isLoggedIn && (
            <Grupo titulo="Minha conta">
              {NAV_DA_CONTA.map((item) => (
                <ItemDoMenu
                  key={item.href}
                  {...item}
                  pathname={pathname}
                  aoClicar={fechar}
                />
              ))}
            </Grupo>
          )}

          {showAdminLink && (
            <Grupo titulo="Equipe">
              <ItemDoMenu
                href={adminHref}
                label="Painel administrativo"
                icon={ShieldCheck}
                pathname={pathname}
                aoClicar={fechar}
              />
            </Grupo>
          )}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          {isLoggedIn ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive"
              >
                <LogOut aria-hidden className="h-4 w-4" />
                Sair
              </button>
            </form>
          ) : (
            // Criar conta em cima e sólido: é o que o site quer que aconteça,
            // e quem já tem conta procura "Entrar" mesmo em segundo plano.
            <div className="space-y-2">
              <Link
                href="/registro"
                onClick={fechar}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <UserPlus aria-hidden className="h-4 w-4" />
                Criar minha conta
              </Link>
              <Link
                href="/login"
                onClick={fechar}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogIn aria-hidden className="h-4 w-4" />
                Entrar
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Um bloco de itens com o rótulo miúdo em cima. */
function Grupo({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="px-3 pb-1.5 text-[10px] font-bold tracking-[0.18em] text-muted-foreground/70 uppercase">
        {titulo}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

/**
 * Um item do menu.
 *
 * 48px de altura e o chevron à direita: o toque tem o tamanho que o dedo
 * pede, e a seta diz que aquilo leva para outro lugar, em vez de parecer um
 * rótulo. O item da página atual ganha o fio na esquerda, e não só um fundo:
 * numa lista curta, fundo sozinho lê como "passando o dedo por cima".
 */
function ItemDoMenu({
  href,
  label,
  icon: Icone,
  pathname,
  aoClicar,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  pathname: string;
  aoClicar: () => void;
}) {
  const ativo = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link
      href={href}
      onClick={aoClicar}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "relative flex h-12 items-center gap-3 overflow-hidden rounded-xl pr-2 pl-4 text-sm transition-colors",
        ativo
          ? "bg-primary/[0.12] font-bold text-foreground"
          : "font-medium text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
      )}
    >
      {ativo && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-primary"
        />
      )}
      <Icone
        className={cn("h-[18px] w-[18px] shrink-0", ativo && "text-primary")}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <ChevronRight
        aria-hidden
        className={cn(
          "h-4 w-4 shrink-0",
          ativo ? "text-primary/70" : "text-muted-foreground/40",
        )}
      />
    </Link>
  );
}
