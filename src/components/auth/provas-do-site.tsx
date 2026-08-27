import { QrCode, ShieldCheck, Truck } from "lucide-react";

// As três razões para confiar, no pé do painel das telas de conta.
//
// O que cada uma afirma tem de ser verificável, porque isso aqui é promessa
// de compra e não texto de enfeite. "Sorteios diários" ficou de fora do
// conjunto por esse motivo: a plataforma sorteia quando o dono abre
// campanha, e nada no sistema garante que amanhã tem. Ligar isso a uma
// configuração de verdade dá para fazer; escrever fixo, não.
const PROVAS = [
  {
    icone: ShieldCheck,
    titulo: "Site seguro",
    texto: "Conexão criptografada e seus dados nunca são revendidos.",
  },
  {
    icone: QrCode,
    titulo: "Pagamento no Pix",
    texto: "Aprovação na hora, sem cartão e sem cadastro extra.",
  },
  {
    icone: Truck,
    titulo: "Prêmios reais",
    texto: "Skins entregues por troca no seu inventário da Steam.",
  },
];

export function ProvasDoSite() {
  return (
    <ul className="grid gap-4 sm:grid-cols-3 sm:gap-0">
      {PROVAS.map(({ icone: Icone, titulo, texto }, i) => (
        <li
          key={titulo}
          className={
            // Divisores só entre as colunas, e só quando elas existem: no
            // celular a lista é empilhada e uma barra vertical no meio de
            // cada item não separaria nada.
            i > 0 ? "sm:border-l sm:border-white/10 sm:pl-4" : "sm:pr-4"
          }
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Icone className="h-4 w-4 text-primary" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white">
                {titulo}
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-white/50">
                {texto}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
