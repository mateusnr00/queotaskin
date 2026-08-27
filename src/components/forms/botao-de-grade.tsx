"use client";

// O botão de grade das telas de conta, o do Uiverse.
//
// Fica fora do componente Button do projeto porque as variantes dele trazem
// fundo, borda e raio próprios, e o desenho de grade é justamente a ausência
// dos três, com as bordas só em cima e embaixo. Sobrepor um no outro seria
// brigar por especificidade.
//
// Existe como componente porque o verde do clique e o ajuste de espaçamento
// entre letras estavam escritos à mão dentro do formulário de cadastro. Com
// o formulário de entrar recebendo o mesmo botão, isso viraria a segunda
// cópia, e cópia de desenho entre telas de conta é exatamente o que já deu
// errado aqui antes.

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function BotaoDeGrade({
  children,
  className,
  ...props
}: React.ComponentProps<"button">) {
  // O verde do clique dura meio segundo, contado aqui e não por :active:
  // :active acaba no instante em que a pessoa solta o botão, e o que se quer
  // é que a confirmação do toque continue visível depois disso.
  const [verde, setVerde] = useState(false);
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (relogio.current) clearTimeout(relogio.current);
    };
  }, []);

  return (
    <button
      type="submit"
      {...props}
      // No apertar, e não no clique: onClick só dispara depois de soltar, e a
      // resposta ao toque tem de começar no toque.
      onPointerDown={(e) => {
        setVerde(true);
        if (relogio.current) clearTimeout(relogio.current);
        relogio.current = setTimeout(() => setVerde(false), 500);
        props.onPointerDown?.(e);
      }}
      className={cn(
        // O tamanho da letra e o espaço entre elas ficam aqui, e não na
        // classe do CSS: no original são 1,5rem e 0,5rem, o que dá uns 470px
        // só de texto para "CRIAR MINHA CONTA" e não cabe no cartão. Cresce a
        // partir de sm, onde há largura.
        "botao-de-grade w-full py-3.5 text-sm tracking-[0.2em] sm:text-base sm:tracking-[0.3em]",
        verde && "esta-verde",
        className
      )}
    >
      {children}
    </button>
  );
}
