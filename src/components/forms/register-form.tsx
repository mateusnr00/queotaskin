"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronDown, IdCard, User } from "lucide-react";

import { loginAction, registerAction } from "@/server/actions/auth";
import { registerSchema, type RegisterInput } from "@/lib/validations/auth";
import { formatCpf } from "@/lib/cpf";
import { PAISES, PAIS_PADRAO, formatarTelefone, paisPorIso } from "@/lib/telefone";
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

  // O verde do clique dura meio segundo, contado aqui e não por :active:
  // :active acaba no instante em que a pessoa solta o botão, e o que se
  // quer é que a confirmação do toque continue visível depois disso.
  const [verde, setVerde] = useState(false);
  const relogioDoVerde = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (relogioDoVerde.current) clearTimeout(relogioDoVerde.current);
    };
  }, []);

  function piscarVerde() {
    setVerde(true);
    if (relogioDoVerde.current) clearTimeout(relogioDoVerde.current);
    relogioDoVerde.current = setTimeout(() => setVerde(false), 500);
  }

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
                {/* Um campo só, com o país dentro. Antes eram duas caixas
                    lado a lado, e a do país comia 6,5rem da largura do
                    telefone; aqui a moldura é comum e o divisor separa as
                    duas partes, que é como o cadastro de telefone se parece
                    em todo lugar. */}
                <div className="flex h-12 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
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
                      className="h-full w-auto shrink-0 gap-1 rounded-l-md rounded-r-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent [&>svg:last-child]:hidden"
                    >
                      {/* leading-none e o tamanho explícito porque emoji
                          herda a entrelinha do campo e desalinha na
                          vertical. */}
                      <span className="text-lg leading-none">
                        {pais.bandeira}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAISES.map((p) => (
                        <SelectItem key={p.iso} value={p.iso}>
                          <span className="flex w-full items-center gap-2.5">
                            <span className="text-base leading-none">
                              {p.bandeira}
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

                  <span aria-hidden className="h-6 w-px shrink-0 bg-border" />

                  <Input
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder={formatarTelefone(
                      "9".repeat(pais.digitos[1]),
                      pais.iso
                    )}
                    className="h-full flex-1 border-0 bg-transparent px-3 tabular-nums shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
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

        {/* Botão fora do componente Button do projeto: as variantes dele
            trazem fundo, borda e raio próprios, e o desenho de grade é
            justamente ausência dos três, com as bordas só em cima e embaixo.
            Sobrepor um no outro seria brigar por especificidade.

            O tamanho da letra e o espaço entre elas ficam aqui, e não na
            classe: no original são 1,5rem e 0,5rem, o que dá uns 470px só de
            texto para "CRIAR MINHA CONTA" e não cabe no cartão. Cresce a
            partir de sm, onde há largura. */}
        <button
          type="submit"
          disabled={isPending}
          // No apertar, e não no clique: onClick só dispara depois de soltar,
          // e a resposta ao toque tem de começar no toque.
          onPointerDown={piscarVerde}
          className={cn(
            "botao-de-grade w-full py-3.5 text-sm tracking-[0.2em] sm:text-base sm:tracking-[0.3em]",
            verde && "esta-verde"
          )}
        >
          {isPending ? "Criando conta..." : "Criar minha conta"}
        </button>
      </form>
    </Form>
  );
}
