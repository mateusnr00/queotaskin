"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowRight, IdCard, Phone, User } from "lucide-react";

import { loginAction, registerAction } from "@/server/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { formatCpf } from "@/lib/cpf";
import { PAISES, PAIS_PADRAO, formatarTelefone, paisPorIso } from "@/lib/telefone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Rótulo miúdo em caixa alta, como nos painéis do jogo. */
const ROTULO = "text-[11px] font-semibold uppercase tracking-wider";

/** Altura confortável para dedo: os três campos são digitados no celular. */
const CAMPO = "h-12 pl-11";

export function RegisterForm() {
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

  // O país escolhido manda na máscara e na validação do número. Fica em
  // watch porque trocar de país precisa reformatar o que já foi digitado:
  // sem isso, um número brasileiro mascarado continuaria com parênteses
  // depois de trocar para Portugal.
  const isoDoPais = form.watch("phoneCountry");
  const pais = paisPorIso(isoDoPais);

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
        toast.success("Conta criada. Faça login para continuar");
        router.push(`/login?redirect=${encodeURIComponent(redirectTo)}`);
        return;
      }
      toast.success("Conta criada com sucesso");
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

        <FormField
          control={form.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel className={ROTULO}>Telefone</FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  {/* Seletor do projeto, e não o <select> do sistema. O
                      nativo abre uma lista pintada pelo sistema operacional,
                      que num site escuro aparece como um retângulo branco de
                      texto quase ilegível, e nenhum CSS alcança aquela
                      lista. */}
                  <Select
                    value={isoDoPais}
                    onValueChange={(v) => {
                      if (!v) return;
                      form.setValue("phoneCountry", v);
                      // Reaplica a máscara do país novo no que já está
                      // digitado, senão sobra a pontuação do país antigo.
                      field.onChange(formatarTelefone(field.value, v));
                    }}
                  >
                    <SelectTrigger
                      aria-label="País do telefone"
                      className="h-12 w-[6.5rem] shrink-0"
                    >
                      <SelectValue
                        labels={Object.fromEntries(
                          PAISES.map((p) => [
                            p.iso,
                            p.ddi ? `${p.iso} +${p.ddi}` : p.iso,
                          ])
                        )}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {PAISES.map((p) => (
                        <SelectItem key={p.iso} value={p.iso}>
                          <span className="flex w-full items-center gap-2">
                            <span className="w-7 shrink-0 text-[11px] font-bold text-muted-foreground">
                              {p.iso}
                            </span>
                            <span className="flex-1">{p.nome}</span>
                            {p.ddi && (
                              <span className="tabular-nums text-muted-foreground">
                                +{p.ddi}
                              </span>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="relative flex-1">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder={formatarTelefone(
                        "9".repeat(pais.digitos[1]),
                        pais.iso
                      )}
                      className={cn(CAMPO, "tabular-nums")}
                      value={field.value}
                      onChange={(e) => {
                        const digitos = e.target.value
                          .replace(/\D/g, "")
                          .slice(0, pais.digitos[1]);
                        field.onChange(formatarTelefone(digitos, pais.iso));
                      }}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </div>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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

        <Button
          type="submit"
          disabled={isPending}
          className="group h-12 w-full text-sm font-bold uppercase tracking-wide"
        >
          {isPending ? "Criando conta..." : "Criar minha conta"}
          {!isPending && (
            <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </Button>
      </form>
    </Form>
  );
}
