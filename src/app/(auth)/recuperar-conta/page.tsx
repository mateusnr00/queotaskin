import type { Metadata } from "next";

import { RecuperacaoLegadoForm } from "@/components/forms/recuperacao-legado-form";

export const metadata: Metadata = { title: "Recuperar conta", robots: { index: false, follow: false } };

// Capability URL: o grant (emitido pelo suporte) vem por query. É a credencial
// do fluxo assistido. noindex + Referrer-Policy no-referrer (via metadata/headers)
// para não vazar por indexação/referrer. Resposta neutra a grant inválido.
export default async function RecuperarContaPage({
  searchParams,
}: {
  searchParams: Promise<{ case?: string; grant?: string }>;
}) {
  const sp = await searchParams;
  const caseId = typeof sp.case === "string" ? sp.case : "";
  const grant = typeof sp.grant === "string" ? sp.grant : "";
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h2 className="text-2xl font-bold tracking-tight">Recuperar acesso</h2>
        <p className="text-sm text-muted-foreground">
          Informe seu novo telefone. Enviaremos um código para confirmá-lo. Ao
          concluir, você entrará com o novo número.
        </p>
      </div>
      {caseId && grant ? (
        <RecuperacaoLegadoForm caseId={caseId} grant={grant} />
      ) : (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Link de recuperação inválido ou expirado.
        </p>
      )}
    </div>
  );
}
