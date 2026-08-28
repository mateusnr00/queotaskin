"use client";

// As artes de campanha de uma skin, no cadastro do catálogo.
//
// Arte não é foto. A foto é o render do jogo, veio da fonte de itens do CS2 e
// continua sendo o que aparece em "Ver as skins premiadas". A arte é feita à
// mão, tem logo, fundo e o nome escrito, e é ela que vira a capa do sorteio
// quando essa skin é escolhida na criação.
//
// Uma por desgaste, porque a arte traz o desgaste escrito nela: a de
// "AK-47 | Redline (Field Tested)" não serve para a Minimal Wear. O primeiro
// espaço, "qualquer desgaste", é para quem não quer desenhar cinco: ele entra
// só quando não existe arte do desgaste escolhido.
//
// POR QUE A TELA MANDA, E NÃO O SERVIDOR
//
// A primeira versão chamava router.refresh() depois de cada envio e de cada
// remoção. Não funcionava: o formulário recebe a skin de `editando`, que é um
// retrato tirado no clique de editar, e o refresh atualiza a lista do
// catálogo sem tocar nesse retrato. Medido, a arte removida continuava na
// tela depois de vinte segundos. E o refresh ainda re-renderizava as 865
// linhas do catálogo por causa de uma imagem.
//
// Agora a lista de artes vive aqui e muda na hora: a foto escolhida aparece
// antes de subir, usando o próprio arquivo do disco, e a removida some no
// clique. O servidor é avisado depois, e se ele recusar, a tela volta ao que
// era com um aviso. O pai é notificado para o retrato dele não envelhecer.

import { useRef, useState } from "react";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { SkinWear } from "@prisma/client";

import {
  removerArteDaSkinAction,
  salvarArteDaSkinAction,
  uploadFotoDaSkinAction,
} from "@/server/actions/skin-templates";
import {
  PROPORCAO_DA_SKIN,
  QUADRO_DA_SKIN,
  WEARS_EM_ORDEM,
  WEAR_STEAM,
} from "@/lib/cs2";
import { normalizeImage } from "@/lib/image-normalize";
import { cn } from "@/lib/utils";

export interface ArteDaSkin {
  id: string;
  wear: SkinWear | null;
  url: string;
}

/** Enquanto sobe, a arte já está na lista com a foto do disco. */
interface ArteNaTela extends ArteDaSkin {
  enviando?: boolean;
}

/** Id provisório de uma arte que ainda não existe no banco. */
function idProvisorio(wear: SkinWear | null) {
  return `enviando:${wear ?? "generica"}`;
}

export function ArtesDaSkin({
  skinId,
  desgastesDisponiveis,
  artes: artesIniciais,
  aoMudar,
}: {
  /** Nulo enquanto a skin não foi salva: arte precisa de skin para pertencer. */
  skinId: string | null;
  desgastesDisponiveis: SkinWear[];
  artes: ArteDaSkin[];
  /** Mantém o retrato do pai em dia, senão fechar e reabrir mostra o antigo. */
  aoMudar?: (artes: ArteDaSkin[]) => void;
}) {
  // A lista começa no que veio do servidor e passa a ser governada aqui.
  // Trocar de skin reinicia isto pela `key` no chamador, e não por um efeito
  // que chama setState: efeito para copiar prop em estado dispara render em
  // cascata, e o compilador do React recusa com razão.
  const [artes, setArtes] = useState<ArteNaTela[]>(artesIniciais);

  function aplicar(proximas: ArteNaTela[]) {
    setArtes(proximas);
    aoMudar?.(
      proximas
        .filter((a) => !a.enviando)
        .map(({ id, wear, url }) => ({ id, wear, url })),
    );
  }

  if (!skinId) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 p-4">
        <p className="text-sm font-semibold">Arte da campanha</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Salve a skin primeiro. Depois, a arte enviada aqui vira a capa do
          sorteio toda vez que você escolher esta skin.
        </p>
      </div>
    );
  }

  // O genérico primeiro: é o que resolve para quem tem uma arte só.
  const espacos: (SkinWear | null)[] = [
    null,
    ...WEARS_EM_ORDEM.filter((d) => desgastesDisponiveis.includes(d)),
  ];

  return (
    <div className="space-y-2.5 rounded-xl border bg-muted/20 p-4">
      <div>
        <p className="text-sm font-semibold">Arte da campanha</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Vira a capa do sorteio quando esta skin é escolhida. A foto acima
          continua sendo o render que aparece em &ldquo;Ver as skins
          premiadas&rdquo;. A do desgaste escolhido manda; a de &ldquo;qualquer
          desgaste&rdquo; entra quando não há a específica.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {espacos.map((wear) => (
          <Espaco
            key={wear ?? "generica"}
            skinId={skinId}
            wear={wear}
            arte={artes.find((a) => a.wear === wear) ?? null}
            aoComecarEnvio={(previa) =>
              aplicar([
                ...artes.filter((a) => a.wear !== wear),
                { id: idProvisorio(wear), wear, url: previa, enviando: true },
              ])
            }
            aoTerminarEnvio={(salva) =>
              // Lê o estado no momento da resposta: entre o começo e o fim do
              // envio a pessoa pode ter mexido em outro espaço.
              setArtes((atuais) => {
                const proximas: ArteNaTela[] = [
                  ...atuais.filter((a) => a.wear !== wear),
                  ...(salva ? [salva] : []),
                ];
                aoMudar?.(
                  proximas
                    .filter((a) => !a.enviando)
                    .map(({ id, wear: w, url }) => ({ id, wear: w, url })),
                );
                return proximas;
              })
            }
            aoRemover={() => aplicar(artes.filter((a) => a.wear !== wear))}
            aoDesfazerRemocao={(devolta) =>
              aplicar([...artes.filter((a) => a.wear !== wear), devolta])
            }
          />
        ))}
      </div>
    </div>
  );
}

function Espaco({
  skinId,
  wear,
  arte,
  aoComecarEnvio,
  aoTerminarEnvio,
  aoRemover,
  aoDesfazerRemocao,
}: {
  skinId: string;
  wear: SkinWear | null;
  arte: ArteNaTela | null;
  aoComecarEnvio: (previaLocal: string) => void;
  aoTerminarEnvio: (salva: ArteDaSkin | null) => void;
  aoRemover: () => void;
  aoDesfazerRemocao: (arte: ArteDaSkin) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rotulo = wear ? WEAR_STEAM[wear] : "Qualquer desgaste";
  const enviando = arte?.enviando ?? false;

  async function enviar(original: File) {
    // A prévia aparece antes de qualquer trabalho: normalizar uma arte grande
    // no navegador leva o seu tempo, e é justamente nesse tempo que a tela
    // parecia não ter registrado o clique.
    const previa = URL.createObjectURL(original);
    aoComecarEnvio(previa);

    try {
      // Sai daqui já no quadro padrão, então a capa tem sempre a mesma
      // proporção e a página do sorteio não precisa adivinhar recorte.
      const { file } = await normalizeImage(original, { quadro: QUADRO_DA_SKIN });
      const fd = new FormData();
      fd.append("file", file);

      let envio;
      try {
        envio = await uploadFotoDaSkinAction(fd);
      } catch {
        toast.error("Imagem grande demais para enviar");
        aoTerminarEnvio(null);
        return;
      }
      if (!envio.ok) {
        toast.error(envio.error);
        aoTerminarEnvio(null);
        return;
      }

      // O try cobre a exceção, e não só o `ok: false`. Server Action com a
      // rede caída LANÇA, não devolve erro; sem isto a prévia ficava girando
      // para sempre e a tela dizia que a arte existia. Medido derrubando a
      // requisição no navegador.
      let salvo;
      try {
        salvo = await salvarArteDaSkinAction(skinId, wear, envio.data.url);
      } catch {
        toast.error("Não foi possível salvar a arte. Tente de novo");
        aoTerminarEnvio(null);
        return;
      }
      if (!salvo.ok) {
        toast.error(salvo.error);
        aoTerminarEnvio(null);
        return;
      }
      aoTerminarEnvio({ id: salvo.data.id, wear, url: envio.data.url });
      toast.success(`Arte de ${rotulo} salva`);
    } finally {
      // A prévia sai da memória depois que a imagem definitiva assumiu.
      URL.revokeObjectURL(previa);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remover() {
    if (!arte || arte.enviando) return;
    const anterior: ArteDaSkin = { id: arte.id, wear: arte.wear, url: arte.url };
    // Some no clique. Se o servidor recusar, volta.
    aoRemover();
    let r;
    try {
      r = await removerArteDaSkinAction(anterior.id);
    } catch {
      // Mesma armadilha do envio: rede caída faz a action lançar, e o `if`
      // logo abaixo nunca rodava. A arte sumia da tela e continuava no banco.
      toast.error("Não foi possível remover agora. Tente de novo");
      aoDesfazerRemocao(anterior);
      return;
    }
    if (!r.ok) {
      toast.error(r.error);
      aoDesfazerRemocao(anterior);
      return;
    }
    toast.success("Arte removida");
  }

  return (
    <div className="space-y-1">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
        }}
      />
      <div className="relative">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={enviando}
          style={{ aspectRatio: PROPORCAO_DA_SKIN }}
          title={arte ? `Trocar a arte de ${rotulo}` : `Enviar a arte de ${rotulo}`}
          className={cn(
            "w-full overflow-hidden rounded-lg border-2 border-dashed transition-colors",
            arte
              ? "border-transparent bg-muted/30 ring-1 ring-border"
              : "border-border hover:border-primary",
          )}
        >
          {arte ? (
            // Sem recuo: a moldura tem a proporção do quadro, então a arte
            // feita no tamanho padrão encosta nas quatro bordas.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={arte.url}
              alt={`Arte de ${rotulo}`}
              className={cn(
                "h-full w-full object-contain transition-opacity",
                enviando && "opacity-45",
              )}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-muted-foreground">
              <Camera className="h-4 w-4" />
            </span>
          )}
        </button>

        {/* O giro fica por cima da prévia, e não no lugar dela: trocar a
            imagem por um spinner esconderia justamente o que a pessoa acabou
            de escolher, que é a confirmação de que o clique pegou. */}
        {enviando && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </span>
        )}

        {arte && !enviando && (
          <button
            type="button"
            onClick={remover}
            aria-label={`Remover a arte de ${rotulo}`}
            title="Remover"
            className="absolute right-1 top-1 rounded-md bg-background/85 p-1 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p
        className={cn(
          "truncate text-center text-[10px] font-semibold uppercase tracking-wider",
          arte ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {rotulo}
      </p>
    </div>
  );
}
