"use client";

// Criação de conta na hora de reservar.
//
// Antes, quem não tinha conta nem via o seletor de números: a página trocava
// o formulário por dois botões de "criar conta"/"entrar". A pessoa era
// mandada para outra tela antes de saber quanto ia gastar, e voltava sem a
// escolha que tinha feito.
//
// Agora o seletor aparece para todo mundo e a conta só é pedida no momento
// em que ela passa a ser necessária, ao confirmar a reserva. A escolha de
// números fica guardada em memória e a reserva segue sozinha assim que o
// login entra, sem recarregar a página nem perder o que foi selecionado.
//
// POR QUE ESTE ARQUIVO QUASE NÃO TEM FORMULÁRIO
//
// Ele tinha. Eram cópias do formulário de /registro e do de /login, e foi
// justamente isso que quebrou: o registerSchema passou a exigir
// phoneCountry, a página ganhou o seletor de país, e a cópia daqui continuou
// mandando { name, cpf, phone }. O zod recusava apontando para um campo que
// esta tela não desenhava, nenhuma mensagem aparecia, e o botão "Criar conta
// e reservar" não fazia absolutamente nada.
//
// Agora o diálogo veste o mesmo cartão e usa os mesmos componentes,
// RegisterForm e LoginForm, com `aoConcluir` no lugar da navegação. Não há
// duas versões do cadastro para divergirem, e o desenho é o mesmo que a
// pessoa veria em /registro, porque é literalmente o mesmo.

import { useState } from "react";
import { ArrowRight } from "lucide-react";

import { RegisterForm } from "@/components/forms/register-form";
import { LoginForm } from "@/components/forms/login-form";
import { BORDA_DE_AUTH, HALO_DE_AUTH } from "@/components/auth/cartao-de-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function AccountGateDialog({
  open,
  onOpenChange,
  quantidade,
  total,
  gratuita = false,
  onAuthenticated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quantos números a pessoa escolheu, lembra do que está em jogo. */
  quantidade: number;
  /** Valor formatado da compra. Ignorado quando a campanha é gratuita. */
  total: string;
  /** Campanha gratuita: o que está em jogo não é o valor, é ser de graça. */
  gratuita?: boolean;
  /** Chamado após entrar; quem chama retoma a reserva de onde parou. */
  onAuthenticated: () => void;
}) {
  const [modo, setModo] = useState<"criar" | "entrar">("criar");
  const criando = modo === "criar";

  // O que está em jogo entra na própria linha de apoio, e não num quadro
  // separado: o cartão de /registro já diz "é rápido, três campos", e aqui
  // essa frase pode terminar dizendo o que se ganha com a pressa.
  const um = quantidade === 1;
  const promessa =
    quantidade > 0
      ? `${quantidade} ${um ? "número" : "números"} ${
          gratuita ? "de graça" : `por ${total}`
        }`
      : null;
  // "seus 1 número ficam garantidos" saía torto desde sempre, e a frase é a
  // última coisa que se lê antes de criar a conta.
  const seus = um ? "seu" : "seus";
  const garantidos = um ? "fica garantido" : "ficam garantidos";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Veste o cartão de /registro: mesmo raio, mesma borda em gradiente,
          mesmo halo. As classes de fundo e anel do diálogo são desligadas
          porque o gradiente pinta o fundo por conta própria (padding-box) e
          o anel apareceria por cima da borda.

          max-h com rolagem porque este cartão é alto e, no celular com o
          teclado aberto, a área útil cai para menos da metade da tela: sem
          isso o botão fica fora de alcance. */}
      <DialogContent
        className={cn(
          "max-h-[92dvh] gap-0 overflow-y-auto rounded-3xl border-transparent bg-transparent p-6 ring-0 sm:max-w-[430px] md:p-7",
          HALO_DE_AUTH
        )}
        style={BORDA_DE_AUTH}
      >
        <DialogHeader className="space-y-1.5 text-left">
          {/* pr-8 para o texto centrado não passar por baixo do X, que o
              diálogo posiciona por cima no canto. */}
          <p className="pr-8 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Você está quase lá!
          </p>
          <DialogTitle className="pt-2 text-2xl font-bold tracking-tight md:text-3xl">
            {criando ? "Crie sua conta" : "Entre na sua conta"}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {criando
              ? promessa
                ? `É rápido: três campos e ${seus} ${promessa} ${garantidos}.`
                : "É rápido: três campos e você já pode escolher seus números."
              : promessa
                ? `Entre com nome e CPF e ${seus} ${promessa} ${garantidos}.`
                : "Entre com o nome e o CPF do cadastro."}
          </DialogDescription>
        </DialogHeader>

        <div className="pt-5">
          {criando ? (
            <RegisterForm aoConcluir={onAuthenticated} />
          ) : (
            <LoginForm aoConcluir={onAuthenticated} />
          )}
        </div>

        {/* Separador com rótulo no meio, igual ao de /registro. As duas barras
            são irmãs do texto num flex, e não um pseudo-elemento por cima:
            assim o "ou" fica sempre centrado, com qualquer largura. */}
        <div className="flex items-center gap-3 pt-5">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* Botão, e não link: aqui a troca acontece dentro do diálogo, porque
            sair para /login perderia os números já escolhidos. */}
        <p className="pt-4 text-center text-sm text-muted-foreground">
          {criando ? "Já possui uma conta?" : "Ainda não tem conta?"}{" "}
          <button
            type="button"
            onClick={() => setModo(criando ? "entrar" : "criar")}
            className="inline-flex items-center gap-1 rounded font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {criando ? "Entrar" : "Criar conta"}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </p>
      </DialogContent>
    </Dialog>
  );
}
