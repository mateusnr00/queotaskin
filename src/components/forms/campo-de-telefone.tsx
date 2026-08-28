"use client";

// O campo de telefone com o país dentro, compartilhado pelos dois lugares
// que criam conta: a página /registro e o diálogo que aparece na hora de
// reservar.
//
// Nasceu de um defeito. O seletor de país foi feito só na página, e o
// diálogo continuou mandando { name, cpf, phone } enquanto o registerSchema
// passou a exigir phoneCountry. O zod recusava, o erro apontava para um
// campo que não existia na tela, nenhuma mensagem aparecia, e o botão
// "Criar conta e reservar" ficava sem fazer nada. Duas cópias do mesmo
// formulário divergiram em silêncio, e é isso que este arquivo impede:
// quem usa o campo recebe o país junto, não tem como esquecer.

import { ChevronDown } from "lucide-react";
import type { UseFormReturn, FieldValues, Path } from "react-hook-form";

import { PAISES, formatarTelefone, paisPorIso } from "@/lib/telefone";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormDescription,
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

/**
 * Formulário que tenha os campos `phone` e `phoneCountry`. O tipo é aberto
 * de propósito: os dois formulários usam o mesmo schema, mas o de reservar
 * pode ganhar campos próprios sem que este arquivo precise saber deles.
 */
type FormComTelefone<T extends FieldValues> = UseFormReturn<T>;

export function CampoDeTelefone<T extends FieldValues>({
  form,
  rotulo = "Telefone/WhatsApp",
  classeDoRotulo,
  altura = "h-12",
  semAviso = false,
}: {
  form: FormComTelefone<T>;
  rotulo?: string;
  classeDoRotulo?: string;
  /** O diálogo é mais apertado que a página e usa campos menores. */
  altura?: string;
  /** Some com a linha do WhatsApp onde ela não faz sentido, como no painel. */
  semAviso?: boolean;
}) {
  const campoPais = "phoneCountry" as Path<T>;
  const isoDoPais = form.watch(campoPais) as string;
  const pais = paisPorIso(isoDoPais);

  return (
    <FormField
      control={form.control}
      name={"phone" as Path<T>}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={classeDoRotulo}>{rotulo}</FormLabel>
          <FormControl>
            {/* Um campo só, com o país dentro. Antes eram duas caixas lado a
                lado, e a do país comia 6,5rem da largura do telefone; aqui a
                moldura é comum e o divisor separa as duas partes, que é como
                o cadastro de telefone se parece em todo lugar. */}
            <div
              className={cn(
                "flex items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
                altura
              )}
            >
              <Select
                value={isoDoPais}
                onValueChange={(v) => {
                  if (!v) return;
                  // @ts-expect-error o campo existe no schema de quem usa
                  form.setValue(campoPais, v);
                  // Reaplica a máscara do país novo no que já está digitado,
                  // senão sobra a pontuação do país antigo.
                  field.onChange(formatarTelefone(field.value ?? "", v));
                }}
              >
                <SelectTrigger
                  aria-label="País do telefone"
                  className="h-full w-auto shrink-0 gap-1 rounded-l-md rounded-r-none border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 dark:bg-transparent dark:hover:bg-transparent [&>svg:last-child]:hidden"
                >
                  {/* leading-none e o tamanho explícito porque emoji herda a
                      entrelinha do campo e desalinha na vertical. */}
                  <span className="text-lg leading-none">{pais.bandeira}</span>
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
                value={field.value ?? ""}
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
          {/* O rótulo diz "WhatsApp", esta linha diz por quê. A entrega da
              skin acontece por lá, então o número não é burocracia de
              cadastro: é por onde a pessoa vai receber o que ganhou, e saber
              disso na hora de digitar muda a chance de vir um número certo. */}
          {!semAviso && (
            <FormDescription>
              É por aqui que a gente chama você no WhatsApp para entregar o
              prêmio.
            </FormDescription>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
