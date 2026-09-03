import Link from "next/link";
import { CabecalhoDeAdmin } from "@/components/admin/cabecalho";
import type { Metadata } from "next";
import { ArrowLeft, CalendarClock, Check, Sparkles } from "lucide-react";

import { RaffleForm } from "@/components/admin/raffle-form";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";

export const metadata: Metadata = { title: "Novo sorteio" };

export default async function NewRafflePage({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string; enfileirado?: string }>;
}) {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);

  // O nome do painel entra na descrição padrão. A plataforma serve mais de um,
  // então a marca não pode estar escrita dentro do gerador do texto.
  const nomeDoSite =
    (
      await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true },
      })
    )?.name ?? "";
  const sp = await searchParams;

  // O destino que a tela anterior sugeriu. É só a marca do rádio: quem decide
  // de verdade é o valor enviado no salvar, validado no servidor, e a entrada
  // na fila passa pelo serviço do cronograma com a validação dele. Um link
  // adulterado no máximo deixa um rádio pré-marcado.
  const destinoInicial = sp.destino === "cronograma" ? "CRONOGRAMA" : "RASCUNHO";

  // A campanha que acabou de entrar na fila, para o aviso de sucesso. Ela vem
  // por id e é lida do banco DENTRO do tenant: o parâmetro não vira texto na
  // tela sem passar por aqui.
  const recemEnfileirada = sp.enfileirado
    ? await prisma.raffle.findFirst({
        where: { id: sp.enfileirado, tenantId, status: "QUEUED" },
        select: { title: true },
      })
    : null;
  const skins = await prisma.skinTemplate.findMany({
    where: { tenantId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      skinRarity: true,
      skinWear: true,
      skinValueBrl: true,
      skinWears: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link
          href="/admin/sorteios"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Voltar para sorteios
        </Link>

        <CabecalhoDeAdmin
          etiqueta="Campanhas"
          icone={<Sparkles aria-hidden className="h-3 w-3" />}
          titulo="Novo sorteio"
          descricao="Preencha o título e siga para a aba que quiser. O sorteio é criado sozinho quando você abre Imagens, Prêmios ou Pagamento."
          migalha={[
            { rotulo: "Admin", href: "/admin" },
            { rotulo: "Sorteios", href: "/admin/sorteios" },
            { rotulo: "Novo" },
          ]}
        />
      </div>
      {recemEnfileirada && (
        <Card className="border-emerald-500/40 bg-emerald-500/[0.06] p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500">
              <Check className="h-4 w-4 text-white" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">
                {recemEnfileirada.title} entrou no cronograma
              </p>
              <p className="text-xs text-muted-foreground">
                O formulário abaixo já está limpo para a próxima skin.
              </p>
            </div>
            <Link
              href="/admin/sorteios/cronograma"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
              Abrir cronograma
            </Link>
          </div>
        </Card>
      )}

      {/* A CHAVE FORÇA UM FORMULÁRIO NOVO.

          "Criar próximo sorteio" navega da mesma rota para a mesma rota, só
          trocando a query. O Next reaproveita a instância do componente nesse
          caminho, e sem a chave o formulário voltava com a skin e o título da
          campanha anterior ainda preenchidos: o admin cadastraria a Asiimov
          por cima da Redline sem perceber. */}
      <RaffleForm
        nomeDoSite={nomeDoSite}
        key={sp.enfileirado ?? "novo"}
        mode={{ kind: "create" }}
        destinoInicial={destinoInicial}
        skins={skins.map((sk) => ({
          ...sk,
          skinValueBrl: sk.skinValueBrl ? Number(sk.skinValueBrl) : null,
          desgastesDisponiveis: sk.skinWears,
        }))}
      />
    </div>
  );
}
