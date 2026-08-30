import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ExternalLink, PackageCheck } from "lucide-react";

import { requireAdmin } from "@/lib/auth-helpers";
import { getActiveTenantIdForAdmin } from "@/lib/tenant";
import { listDeliveries } from "@/server/services/deliveries";
import { SkinCard } from "@/components/cs2/skin-card";
import { CopyButton } from "@/components/admin/copy-button";
import { BotaoDeEntrega } from "@/components/admin/botao-de-entrega";
import { formatDateTime } from "@/lib/format";
import { formatPhone } from "@/lib/cpf";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Entregas" };

// Fila operacional pós-sorteio: quem ganhou, o que ganhou e para onde
// enviar. É a tela que o admin abre com a Steam aberta do lado.
export default async function AdminDeliveriesPage() {
  const session = await requireAdmin();
  const tenantId = await getActiveTenantIdForAdmin(session.user);
  const deliveries = await listDeliveries(tenantId);

  const missingTradeUrl = deliveries.filter(
    (d) => d.winner && !d.winner.steamTradeUrl,
  ).length;
  // O que a tela existe para responder: quantas skins ainda não saíram.
  const pendentes = deliveries.filter((d) => d.deliveredAt == null).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Entregas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Campanhas sorteadas e os dados de envio de cada ganhador.
          {deliveries.length > 0 && (
            <>
              {" "}
              <span className="font-semibold text-foreground">
                {pendentes} pendente{pendentes === 1 ? "" : "s"}
              </span>{" "}
              de {deliveries.length}.
            </>
          )}
        </p>
      </header>

      {missingTradeUrl > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-700 dark:text-amber-300">
            {missingTradeUrl} ganhador(es) ainda não cadastraram o link de troca
            da Steam. Chame no WhatsApp e peça para preencher em{" "}
            <span className="font-mono">/minha-conta</span> antes de enviar.
          </p>
        </div>
      )}

      {deliveries.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          Nenhuma campanha sorteada ainda. Declare o ganhador na lista de
          compras da campanha para ele aparecer aqui.
        </div>
      ) : (
        <div className="grid gap-4">
          {deliveries.map((delivery) => (
            <article
              key={delivery.raffleId}
              className={cn(
                "rounded-xl border bg-card transition-colors",
                // Entregue recua: continua legível, mas para de disputar
                // atenção com o que ainda falta fazer.
                delivery.deliveredAt != null && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/sorteios/${delivery.raffleId}/compras`}
                    className="font-semibold hover:underline"
                  >
                    {delivery.raffleTitle}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Sorteado em {formatDateTime(delivery.drawnAt)}
                    {delivery.note && ` · ${delivery.note}`}
                  </p>
                  {delivery.deliveredAt != null && (
                    <p className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                      Entregue em {formatDateTime(delivery.deliveredAt)}
                      {delivery.deliveredBy && ` por ${delivery.deliveredBy}`}
                      {delivery.deliveryNote && (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          {delivery.deliveryNote}
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 font-mono text-lg font-bold text-amber-600 dark:text-amber-400">
                    <PackageCheck className="h-4 w-4" />
                    {delivery.ticketNumber}
                  </span>
                  <BotaoDeEntrega
                    raffleId={delivery.raffleId}
                    entregue={delivery.deliveredAt != null}
                  />
                </div>
              </div>

              <div className="grid gap-4 p-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Ganhador
                  </h2>
                  {delivery.winner ? (
                    <>
                      <p className="font-semibold">{delivery.winner.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {delivery.winner.phone
                          ? formatPhone(delivery.winner.phone)
                          : "sem telefone"}
                        {delivery.winner.email && ` · ${delivery.winner.email}`}
                      </p>

                      {delivery.winner.steamTradeUrl ? (
                        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            Link de troca
                          </p>
                          <p className="font-mono text-xs break-all">
                            {delivery.winner.steamTradeUrl}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <CopyButton
                              value={delivery.winner.steamTradeUrl}
                              label="Copiar link"
                            />
                            <a
                              href={delivery.winner.steamTradeUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold hover:bg-muted"
                            >
                              Abrir na Steam
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                          {delivery.winner.steamId && (
                            <p className="text-xs text-muted-foreground">
                              SteamID64:{" "}
                              <span className="font-mono">
                                {delivery.winner.steamId}
                              </span>
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                          Link de troca da Steam não cadastrado.
                          {!delivery.winner.userId &&
                            " A reserva foi feita sem conta, então não há onde buscar o link."}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      O número {delivery.ticketNumber} não consta como vendido
                      nesta campanha. Confira o resultado declarado.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Prêmios a enviar
                  </h2>
                  {delivery.prizes.length > 0 ? (
                    <div className="space-y-2">
                      {delivery.prizes.map((prize) => (
                        <SkinCard key={prize.position} prize={prize} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum prêmio cadastrado nesta campanha.
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
