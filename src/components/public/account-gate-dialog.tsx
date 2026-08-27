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
// O DEFEITO QUE ESTAVA AQUI
//
// O formulário mandava { name, cpf, phone } enquanto o registerSchema passou
// a exigir phoneCountry, junto com o seletor de país que só foi feito na
// página /registro. O zod recusava com erro no caminho ["phoneCountry"], um
// campo que não existia nesta tela, então nenhum FormMessage o mostrava e o
// handleSubmit nunca chamava o onSubmit. Resultado: clicar em "Criar conta e
// reservar" não fazia absolutamente nada, sem erro, sem log, sem pista.
//
// Duas defesas contra isso voltar: o campo de telefone agora é um componente
// só, compartilhado com a página, e o handleSubmit ganhou o segundo callback,
// o de inválido. Erro de validação em campo que não está na tela deixa de ser
// silêncio e vira aviso.
//
// O DESENHO
//
// Era um formulário genérico: título, três caixas iguais e um botão. O que a
// pessoa ganha ao preencher, a quantidade de números e o valor, era a menor e
// mais apagada linha da tela, dentro da descrição. Isso inverte a ordem do
// que importa: ninguém preenche cadastro por gostar de cadastro, preenche
// para garantir o número que acabou de escolher.
//
// Agora a escolha vem primeiro e emoldurada, no topo, com o valor em
// destaque; o cadastro vem depois, apresentado pelo que ele custa em esforço
// ("três campos, sem senha e sem e-mail"), que é a objeção real de quem está
// com o dedo no botão.

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { LogIn, ShieldCheck, Ticket, UserPlus } from "lucide-react";

import { loginAction, registerAction } from "@/server/actions/auth";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@/lib/validations/auth";
import { formatCpf } from "@/lib/cpf";
import { PAIS_PADRAO } from "@/lib/telefone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoDeTelefone } from "@/components/forms/campo-de-telefone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const ROTULO =
  "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

/** Aviso para erro de validação que não tem campo visível onde aparecer. */
function aoDarInvalido(erros: Record<string, unknown>) {
  const semCampoNaTela = Object.keys(erros).filter(
    (campo) => !["name", "cpf", "phone"].includes(campo)
  );
  if (semCampoNaTela.length > 0) {
    toast.error("Não foi possível enviar o formulário. Recarregue a página.");
    console.error("[account-gate] validação falhou sem campo na tela:", erros);
  }
}

export function AccountGateDialog({
  open,
  onOpenChange,
  quantidade,
  total,
  onAuthenticated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quantos números a pessoa escolheu, lembra do que está em jogo. */
  quantidade: number;
  /** Valor formatado da compra. */
  total: string;
  /** Chamado após entrar; quem chama retoma a reserva de onde parou. */
  onAuthenticated: () => void;
}) {
  const [modo, setModo] = useState<"criar" | "entrar">("criar");
  const criando = modo === "criar";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* p-0 e gap-0 porque as três faixas têm fundos próprios e precisam
          encostar nas bordas. max-h com overflow porque, no celular com o
          teclado aberto, a área útil cai para menos da metade da tela e o
          botão ficava fora de alcance. */}
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto p-0 sm:max-w-[400px]">
        {/* A escolha, antes do pedido. É a resposta para "por que eu vou
            preencher isso": os números já estão selecionados e é este valor
            que fica garantido no fim. */}
        {/* pr-12 e não px-5: o botão de fechar do diálogo é posicionado por
            cima, no canto, e medindo deu 16px de sobreposição: o valor
            passava por baixo dele. */}
        {quantidade > 0 && (
          <div className="flex items-center gap-3 border-b border-primary/20 bg-primary/[0.07] py-3.5 pl-5 pr-12">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Ticket className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                Sua escolha
              </p>
              <p className="truncate text-sm font-semibold">
                {quantidade} {quantidade === 1 ? "número" : "números"}
              </p>
            </div>
            <span className="shrink-0 text-xl font-extrabold tabular-nums tracking-tight text-primary">
              {total}
            </span>
          </div>
        )}

        <DialogHeader className="px-5 pb-1 pt-5 text-left">
          <DialogTitle className="text-lg font-bold tracking-tight">
            {criando ? "Falta só criar sua conta" : "Entre para continuar"}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            {criando
              ? "Três campos, sem senha e sem e-mail. A conta é o que guarda seus números no seu nome."
              : "Entre com o nome e o CPF do cadastro."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pb-5 pt-4">
          {criando ? (
            <FormularioCriar onPronto={onAuthenticated} />
          ) : (
            <FormularioEntrar onPronto={onAuthenticated} />
          )}
        </div>

        {/* Rodapé com fundo próprio, e não texto sublinhado solto embaixo do
            botão: ali ele competia com a ação principal por atenção sendo
            uma saída, não um caminho. */}
        <div className="space-y-2 border-t bg-muted/30 px-5 py-3">
          <button
            type="button"
            onClick={() => setModo(criando ? "entrar" : "criar")}
            className="w-full rounded text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {criando
              ? "Já tenho conta, quero entrar"
              : "Ainda não tenho conta, quero criar"}
          </button>
          {criando && (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              Seu CPF é usado só para gerar o Pix e nunca aparece no site.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormularioCriar({ onPronto }: { onPronto: () => void }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<RegisterInput>({
    // phoneCountry entra aqui e não pode sair: sem ele o zodResolver recusa
    // o envio apontando para um campo que a tela não desenha, e o botão vira
    // um botão que não faz nada. Foi exatamente o que aconteceu.
    defaultValues: { name: "", cpf: "", phone: "", phoneCountry: PAIS_PADRAO },
    resolver: zodResolver(registerSchema),
  });

  function onSubmit(values: RegisterInput) {
    startTransition(async () => {
      const criada = await registerAction(values);
      if (!criada.ok) {
        toast.error(criada.error);
        return;
      }
      // O cadastro não loga sozinho; o login vem logo em seguida com os
      // mesmos dados (o fluxo é sem senha, por nome + CPF).
      const entrou = await loginAction({
        name: values.name,
        cpf: values.cpf,
      });
      if (!entrou.ok) {
        toast.error("Conta criada, mas o login falhou. Tente entrar.");
        return;
      }
      toast.success("Conta criada!");
      onPronto();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, aoDarInvalido)}
        className="space-y-3.5"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>Nome completo</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  placeholder="Maria da Silva"
                  className="h-12"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="h-12 tabular-nums"
                  {...field}
                  value={formatCpf(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <CampoDeTelefone form={form} classeDoRotulo={ROTULO} />
        <Button
          type="submit"
          disabled={isPending}
          className="h-13 w-full text-base font-semibold"
        >
          <UserPlus className="mr-2 h-4 w-4" />
          {isPending ? "Criando conta..." : "Criar conta e reservar"}
        </Button>
      </form>
    </Form>
  );
}

function FormularioEntrar({ onPronto }: { onPronto: () => void }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { name: "", cpf: "" },
  });

  function onSubmit(values: LoginInput) {
    startTransition(async () => {
      const entrou = await loginAction(values);
      if (!entrou.ok) {
        toast.error(entrou.error);
        return;
      }
      onPronto();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit, aoDarInvalido)}
        className="space-y-3.5"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>Nome completo</FormLabel>
              <FormControl>
                <Input
                  autoComplete="name"
                  placeholder="Maria da Silva"
                  className="h-12"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cpf"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  className="h-12 tabular-nums"
                  {...field}
                  value={formatCpf(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={isPending}
          className="h-13 w-full text-base font-semibold"
        >
          <LogIn className="mr-2 h-4 w-4" />
          {isPending ? "Entrando..." : "Entrar e reservar"}
        </Button>
      </form>
    </Form>
  );
}
