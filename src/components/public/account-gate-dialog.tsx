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

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { LogIn, UserPlus } from "lucide-react";

import { loginAction, registerAction } from "@/server/actions/auth";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "@/lib/validations/auth";
import { formatCpf, formatPhone } from "@/lib/cpf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            {modo === "criar" ? "Crie sua conta para continuar" : "Entre na sua conta"}
          </DialogTitle>
          <DialogDescription>
            {quantidade > 0 ? (
              <>
                Falta só isso para garantir{" "}
                <strong className="text-foreground">
                  {quantidade} {quantidade === 1 ? "número" : "números"}
                </strong>{" "}
                por <strong className="text-foreground">{total}</strong>.
                {modo === "criar" ? " Sem senha e sem e-mail." : ""}
              </>
            ) : modo === "criar" ? (
              "É rápido, sem senha e sem e-mail."
            ) : (
              "Entre com o nome e o CPF do cadastro."
            )}
          </DialogDescription>
        </DialogHeader>

        {modo === "criar" ? (
          <FormularioCriar onPronto={onAuthenticated} />
        ) : (
          <FormularioEntrar onPronto={onAuthenticated} />
        )}

        <button
          type="button"
          onClick={() => setModo(modo === "criar" ? "entrar" : "criar")}
          className="text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          {modo === "criar"
            ? "Já tenho conta, quero entrar"
            : "Ainda não tenho conta, quero criar"}
        </button>
      </DialogContent>
    </Dialog>
  );
}

function FormularioCriar({ onPronto }: { onPronto: () => void }) {
  const [isPending, startTransition] = useTransition();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", cpf: "", phone: "" },
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3.5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Maria da Silva" {...field} />
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
              <FormLabel>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  {...field}
                  value={formatCpf(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Celular</FormLabel>
              <FormControl>
                <Input
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="(11) 90000-0000"
                  {...field}
                  value={formatPhone(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="h-11 w-full font-semibold">
          <UserPlus className="mr-2 h-4 w-4" />
          {isPending ? "Criando..." : "Criar conta e reservar"}
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3.5">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome completo</FormLabel>
              <FormControl>
                <Input autoComplete="name" placeholder="Maria da Silva" {...field} />
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
              <FormLabel>CPF</FormLabel>
              <FormControl>
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  {...field}
                  value={formatCpf(field.value ?? "")}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending} className="h-11 w-full font-semibold">
          <LogIn className="mr-2 h-4 w-4" />
          {isPending ? "Entrando..." : "Entrar e reservar"}
        </Button>
      </form>
    </Form>
  );
}
