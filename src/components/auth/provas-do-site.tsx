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
    <ul className="grid gap-5 sm:grid-cols-3 sm:gap-0">
      {PROVAS.map(({ icone: Icone, titulo, texto }, i) => (
        <li
          key={titulo}
          className={
            // Divisores só entre as colunas, e só quando elas existem: no
            // celular a lista é empilhada e uma barra vertical no meio de
            // cada item não separaria nada.
            i > 0 ? "sm:border-l sm:border-white/10 sm:pl-5" : "sm:pr-5"
          }
        >
          {/* Ícone em cima e não ao lado: lado a lado sobravam uns 160px
              para o texto, e "Pagamento no Pix" quebrava em duas linhas só
              na coluna do meio, o que desalinhava as três. Empilhado, o
              título tem a coluna inteira. */}
          <div className="space-y-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
              <Icone className="h-5 w-5 text-primary" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white">
                {titulo}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">
                {texto}
              </p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
