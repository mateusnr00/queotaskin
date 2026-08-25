import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { getBrand } from "@/lib/brand";

// Layout split inspirado no Sorteamos: ilustração/branding à esquerda em
// gradiente, formulário à direita centralizado. No mobile o branding fica
// em cima como banner compacto.
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // O nome vem do tenant, não da variável de ambiente: com NEXT_PUBLIC_APP_NAME
  // ausente esta tela dizia "Rifa Online" para quem estava entrando no
  // QuéOta Skin — e num deploy multi-tenant diria o nome de um site só.
  const marca = await getBrand();
  const appName = marca.name;
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Painel de branding */}
      <aside className="relative flex md:w-1/2 lg:w-2/5 md:min-h-screen overflow-hidden bg-gradient-to-br from-accent via-accent/60 to-background">
        {/* Bolhas decorativas */}
        <div
          aria-hidden
          className="absolute -top-32 -left-24 h-80 w-80 rounded-full bg-primary/30 blur-3xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />

        <div className="relative z-10 flex flex-1 flex-col justify-between p-8 md:p-12">
          <Link href="/" className="inline-flex">
            <BrandMark
              marca={marca}
              alturaDaFaixa="h-9"
              ladoDoEmblema="h-9 w-9"
              larguraMaxima="max-w-[200px]"
              classeDoNome="text-base"
            />
          </Link>

          <div className="hidden md:block space-y-3 pb-6 max-w-md">
            <h1 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight">
              Olá, bem-vindo
              <br />
              de volta ao{" "}
              <span className="text-primary uppercase">{appName}</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Sua plataforma de rifas online. Crie campanhas, gerencie reservas
              e acompanhe as vendas em tempo real.
            </p>
          </div>
        </div>
      </aside>

      {/* Painel do formulário */}
      <main className="flex flex-1 items-center justify-center px-4 py-10 md:py-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
