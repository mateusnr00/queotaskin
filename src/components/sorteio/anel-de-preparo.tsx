"use client";

// O 3, 2, 1 dos últimos segundos.
//
// Nos dez segundos finais a contagem já virava um número grande e pulsante.
// Nos TRÊS últimos ela vira outra coisa: dois anéis que respiram em volta do
// número, e o número trocando de identidade a cada segundo (a `key` força o
// React a remontar, e a animação de entrada roda de novo). É o gesto de
// "agora", separado do gesto de "está chegando".
//
// Só desenho. O número vem da contagem, que vem do relógio do servidor.

export function AnelDePreparo({ numero }: { numero: number }) {
  return (
    <div className="relative mx-auto flex h-[200px] w-[200px] items-center justify-center sm:h-[240px] sm:w-[240px]">
      <span
        aria-hidden
        className="anel-de-preparo absolute -inset-4 rounded-full border border-red-500/35"
        style={{ animationDelay: "0.28s" }}
      />
      <span
        aria-hidden
        className="anel-de-preparo absolute inset-0 rounded-full border-2 border-red-500"
        style={{ boxShadow: "0 0 46px rgba(239,68,68,0.45)" }}
      />
      <span
        // A troca de chave é o que remonta o número a cada segundo e faz a
        // animação de entrada rodar de novo. Sem ela, o dígito trocaria em
        // silêncio no meio de um anel que continua pulsando.
        key={numero}
        className="numero-de-preparo font-mono text-[104px] leading-none font-black tabular-nums text-white sm:text-[124px]"
        style={{ textShadow: "0 0 60px rgba(239,68,68,0.55)" }}
      >
        {numero}
      </span>
    </div>
  );
}
