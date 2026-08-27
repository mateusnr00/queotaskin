"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { IdCard, User } from "lucide-react";

import { loginAction, registerAction } from "@/server/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { formatCpf } from "@/lib/cpf";
import { PAIS_PADRAO } from "@/lib/telefone";
import { CampoDeTelefone } from "@/components/forms/campo-de-telefone";
import { BotaoDeGrade } from "@/components/forms/botao-de-grade";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** Rótulo miúdo em caixa alta, como nos painéis do jogo. */
const ROTULO = "text-[11px] font-semibold uppercase tracking-wider";

/** Altura confortável para dedo: os três campos são digitados no celular. */
const CAMPO = "h-12 pl-11";

/**
 * Quando `aoConcluir` vem, o formulário chama essa função depois de criar a
 * conta e entrar, em vez de navegar. É o que permite ao diálogo que aparece
 * na hora de reservar usar este mesmo formulário: lá a pessoa não pode sair
 * da página, porque os números escolhidos vivem na memória da tela.
 *
 * O diálogo usar o formulário de verdade, e não uma cópia, é o conserto de
 * raiz do defeito que deixou o botão sem fazer nada: eram dois formulários
 * para o mesmo cadastro, e um deles ficou para trás quando o schema mudou.
 */
export function RegisterForm({
  aoConcluir,
}: {
  aoConcluir?: () => void;
} = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // NextAuth v5 manda ?callbackUrl= quando bate numa rota protegida; nossas
  // próprias telas mandam ?redirect=. Aceita os dois.
  const redirectTo =
    searchParams.get("redirect") ?? searchParams.get("callbackUrl") ?? "/";
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      cpf: "",
      phone: "",
      phoneCountry: PAIS_PADRAO,
    },
  });

  function onSubmit(values: RegisterInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await registerAction(values);
      if (!result.ok) {
        setServerError(result.error);
        toast.error(result.error);
        return;
      }
      // Loga automaticamente após registro, login é por nome + CPF, sem
      // senha. O celular fica guardado para a operação falar com o cliente.
      const login = await loginAction({
        name: values.name,
        cpf: values.cpf,
      });
      if (!login.ok) {
        // Dentro do diálogo não há para onde mandar: a pessoa está no meio
        // de uma reserva. Vira aviso, e ela tenta entrar ali mesmo.
        if (aoConcluir) {
          setServerError("Conta criada, mas o login falhou. Tente entrar.");
          toast.error("Conta criada, mas o login falhou. Tente entrar.");
          return;
        }
        toast.success("Conta criada. Faça login para continuar");
        router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`);
        return;
      }
      toast.success("Conta criada com sucesso");
      if (aoConcluir) {
        aoConcluir();
        return;
      }
      router.refresh();
      router.push(redirectTo);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>Nome completo</FormLabel>
              <FormControl>
                {/* Ícone dentro do campo, e não ao lado do rótulo: dentro ele
                    marca onde o texto começa e some da leitura assim que a
                    pessoa digita, que é o que se quer de um enfeite. */}
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    autoComplete="name"
                    placeholder="Digite seu nome completo"
                    className={CAMPO}
                    {...field}
                  />
                </div>
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
                <div className="relative">
                  <IdCard className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    className={cn(CAMPO, "tabular-nums")}
                    value={field.value}
                    onChange={(e) => {
                      const digits = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 11);
                      field.onChange(
                        digits.length === 11 ? formatCpf(digits) : digits
                      );
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <CampoDeTelefone form={form} classeDoRotulo={ROTULO} />

        {/* O erro do servidor como aviso emoldurado, e não como linha
            vermelha solta no meio do formulário: solta, ela se confundia com
            a mensagem de validação de um campo e a pessoa procurava qual. */}
        {serverError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
          >
            {serverError}
          </p>
        )}

        <BotaoDeGrade disabled={isPending}>
          {isPending ? "Criando conta..." : "Criar minha conta"}
        </BotaoDeGrade>
      </form>
    </Form>
  );
}
