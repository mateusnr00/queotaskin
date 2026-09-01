"use client";

// Importar uma PASTA INTEIRA de artes de skin de uma vez.
//
// O acervo de artes já nasce organizado: um arquivo por skin e desgaste, com
// o nome escrito dentro ("AK-47 | Redline (Field-Tested).png"). Fazer isso
// pelo formulário de uma skin por vez é abrir a skin, escolher o desgaste,
// escolher o arquivo, salvar, e repetir algumas centenas de vezes.
//
// Aqui a pessoa escolhe todos os arquivos, a tela LÊ os nomes, casa com o
// catálogo e mostra o que vai acontecer com cada um ANTES de gravar nada.
// Casamento fraco não vira cadastro em silêncio: vira uma linha para
// escolher a skin na mão, ou para pular.

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  FolderOpen,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { SkinWear } from "@prisma/client";

import {
  criarSkinAction,
  salvarArteDaSkinAction,
  uploadFotoDaSkinAction,
} from "@/server/actions/skin-templates";
import { lerArquivoDeSkin } from "@/lib/arquivo-de-skin";
import {
  procurar,
  type EntradaDoCatalogo,
} from "@/lib/cs2-catalogo";
import { WEAR_LABEL } from "@/lib/cs2";
import { normalizeImage } from "@/lib/image-normalize";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SkinParaImportar {
  id: string;
  name: string;
  artes: { wear: SkinWear | null; url: string }[];
}

/** Uma linha da prévia: um arquivo e o que vai ser feito com ele. */
interface Linha {
  id: string;
  arquivo: File;
  /** O nome lido do arquivo, para o relatório. */
  nomeLido: string;
  wear: SkinWear | null;
  /** A skin escolhida. Null quer dizer "ainda não sei qual é". */
  skinId: string | null;
  /** Quando não casou: os nomes mais parecidos, para escolher em um clique. */
  sugestoes: string[];
  /** Marcado para virar skin nova, quando o nome não existe no catálogo. */
  criarComNome: string | null;
  situacao: "pendente" | "enviando" | "pronto" | "erro" | "pulado";
  erro?: string;
}

const DESGASTES: SkinWear[] = [
  "FACTORY_NEW",
  "MINIMAL_WEAR",
  "FIELD_TESTED",
  "WELL_WORN",
  "BATTLE_SCARRED",
];

export function ImportadorDeArtes({
  skins,
  aoFechar,
  aoConcluir,
}: {
  skins: SkinParaImportar[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const inputArquivos = useRef<HTMLInputElement>(null);
  const inputPasta = useRef<HTMLInputElement>(null);

  // O índice de busca é o próprio catálogo do tenant, no formato que
  // `procurar` já sabe pontuar. Reaproveitar aquela função é o que faz
  // "awp asiimov ft.png" achar "AWP | Asiimov" sem escrever outro casador.
  const indice = useMemo<EntradaDoCatalogo[]>(
    () =>
      skins.map((s) => ({
        nome: s.name,
        imagem: null,
        raridade: null,
        desgaste: null,
        desgastesDisponiveis: [],
        colecao: null,
        categoria: "",
      })),
    [skins],
  );
  const porNome = useMemo(
    () => new Map(skins.map((s) => [s.name, s.id])),
    [skins],
  );
  const porId = useMemo(() => new Map(skins.map((s) => [s.id, s])), [skins]);

  function receber(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLendo(true);
    try {
      const novas: Linha[] = [];
      for (const arquivo of Array.from(files)) {
        // Pasta escolhida inteira traz o que não é imagem junto. Descartar em
        // silêncio é o certo: ninguém quer ler "desktop.ini não é imagem".
        if (!arquivo.type.startsWith("image/")) continue;

        const lido = lerArquivoDeSkin(arquivo.name);
        const achado = procurar(lido.nome, indice, 4);
        novas.push({
          id: `${arquivo.name}-${arquivo.size}-${novas.length}`,
          arquivo,
          nomeLido: lido.nome,
          wear: lido.wear,
          skinId: achado.exata ? (porNome.get(achado.exata.nome) ?? null) : null,
          sugestoes: achado.sugestoes.map((s) => s.nome),
          criarComNome: null,
          situacao: "pendente",
        });
      }
      if (novas.length === 0) {
        toast.error("Nenhuma imagem na seleção");
        return;
      }
      setLinhas(novas);
    } finally {
      setLendo(false);
      if (inputArquivos.current) inputArquivos.current.value = "";
      if (inputPasta.current) inputPasta.current.value = "";
    }
  }

  function mudar(id: string, mudanca: Partial<Linha>) {
    setLinhas((atual) =>
      atual.map((l) => (l.id === id ? { ...l, ...mudanca } : l)),
    );
  }

  const prontas = linhas.filter(
    (l) => (l.skinId || l.criarComNome) && l.situacao !== "pulado",
  );
  const semSkin = linhas.filter(
    (l) => !l.skinId && !l.criarComNome && l.situacao !== "pulado",
  );
  const enviadas = linhas.filter((l) => l.situacao === "pronto").length;
  const falhas = linhas.filter((l) => l.situacao === "erro").length;

  /**
   * Grava, um arquivo por vez.
   *
   * Em sequência de propósito: são dezenas de uploads, e disparar todos
   * juntos é o jeito mais rápido de tomar recusa do Storage e não saber
   * quais das cinquenta passaram. Uma falha não derruba as outras: a linha
   * fica vermelha com o motivo, e as seguintes continuam.
   */
  async function importar() {
    if (prontas.length === 0) return;
    setEnviando(true);

    // Skin criada agora entra aqui para o segundo arquivo do mesmo nome
    // (o mesmo item em outro desgaste) não tentar criar de novo.
    const criadas = new Map<string, string>();

    try {
      for (const linha of prontas) {
        mudar(linha.id, { situacao: "enviando", erro: undefined });
        try {
          let skinId = linha.skinId;

          if (!skinId && linha.criarComNome) {
            const jaCriada = criadas.get(linha.criarComNome);
            if (jaCriada) {
              skinId = jaCriada;
            } else {
              const nova = await criarSkinAction({
                name: linha.criarComNome,
                imageUrl: "",
                skinRarity: "",
                skinWear: "",
                skinFloat: "",
                skinStatTrak: false,
                skinSouvenir: false,
                skinValueBrl: "",
                skinCollection: "",
                skinInspectUrl: "",
              });
              if (!nova.ok) {
                mudar(linha.id, { situacao: "erro", erro: nova.error });
                continue;
              }
              skinId = nova.data.id;
              criadas.set(linha.criarComNome, skinId);
            }
          }
          if (!skinId) {
            mudar(linha.id, { situacao: "erro", erro: "Sem skin escolhida" });
            continue;
          }

          // Encolhe no navegador antes de enviar: o corpo de uma Server
          // Action não passa de alguns MB, e arte em PNG estoura isso.
          const { file } = await normalizeImage(linha.arquivo);
          const fd = new FormData();
          fd.append("file", file);
          const enviado = await uploadFotoDaSkinAction(fd);
          if (!enviado.ok) {
            mudar(linha.id, { situacao: "erro", erro: enviado.error });
            continue;
          }

          const salvo = await salvarArteDaSkinAction(
            skinId,
            linha.wear,
            enviado.data.url,
          );
          if (!salvo.ok) {
            mudar(linha.id, { situacao: "erro", erro: salvo.error });
            continue;
          }
          mudar(linha.id, { situacao: "pronto", skinId });
        } catch {
          mudar(linha.id, {
            situacao: "erro",
            erro: "Falha no envio deste arquivo",
          });
        }
      }
    } finally {
      setEnviando(false);
      aoConcluir();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Importar artes em massa</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              Escolha a pasta inteira de artes. O nome de cada arquivo diz a
              skin e o desgaste, e a tela mostra o que vai gravar antes de
              gravar. Formatos aceitos: PNG, JPG e WEBP.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={aoFechar}>
            <X aria-hidden className="mr-1.5 h-3.5 w-3.5" />
            Fechar
          </Button>
        </div>

        <input
          ref={inputArquivos}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => receber(e.target.files)}
        />
        <input
          ref={inputPasta}
          type="file"
          multiple
          className="hidden"
          // Escolher a pasta inteira, quando o navegador deixa. Não é padrão
          // do React, e por isso vai como atributo solto.
          {...{ webkitdirectory: "", directory: "" }}
          onChange={(e) => receber(e.target.files)}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={enviando || lendo}
            onClick={() => inputPasta.current?.click()}
          >
            <FolderOpen aria-hidden className="mr-1.5 h-4 w-4" />
            Escolher a pasta
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={enviando || lendo}
            onClick={() => inputArquivos.current?.click()}
          >
            <Upload aria-hidden className="mr-1.5 h-4 w-4" />
            Escolher arquivos
          </Button>
        </div>

        {linhas.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold">
              {linhas.length} arquivo{linhas.length > 1 ? "s" : ""}
            </span>
            <span className="text-emerald-500">
              {prontas.length} pronto{prontas.length === 1 ? "" : "s"} para
              importar
            </span>
            {semSkin.length > 0 && (
              <span className="text-amber-500">
                {semSkin.length} sem skin escolhida
              </span>
            )}
            {enviadas > 0 && (
              <span className="text-emerald-500">{enviadas} gravada(s)</span>
            )}
            {falhas > 0 && <span className="text-red-400">{falhas} com erro</span>}
          </div>
        )}
      </Card>

      {linhas.length > 0 && (
        <Card className="divide-y divide-border p-0">
          {linhas.map((linha) => {
            const skin = linha.skinId ? porId.get(linha.skinId) : null;
            const jaTemArte =
              skin?.artes.some((a) => a.wear === linha.wear) ?? false;
            return (
              <div
                key={linha.id}
                className={cn(
                  "flex flex-wrap items-center gap-3 p-3 text-sm",
                  linha.situacao === "pulado" && "opacity-40",
                  linha.situacao === "erro" && "bg-red-500/5",
                )}
              >
                <span className="w-5 shrink-0">
                  {linha.situacao === "enviando" ? (
                    <Loader2
                      aria-hidden
                      className="h-4 w-4 animate-spin text-muted-foreground"
                    />
                  ) : linha.situacao === "pronto" ? (
                    <Check aria-hidden className="h-4 w-4 text-emerald-500" />
                  ) : linha.situacao === "erro" ? (
                    <AlertTriangle aria-hidden className="h-4 w-4 text-red-400" />
                  ) : null}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-muted-foreground">
                    {linha.arquivo.name}
                  </p>
                  {linha.situacao === "erro" && (
                    <p className="mt-0.5 text-xs text-red-400">{linha.erro}</p>
                  )}
                  {linha.situacao !== "erro" && jaTemArte && (
                    <p className="mt-0.5 text-[11px] text-amber-500">
                      Já existe arte para este desgaste. Vai ser substituída.
                    </p>
                  )}
                </div>

                {/* A skin: casada, escolhida na mão, ou nova. */}
                <select
                  value={linha.criarComNome ? "__criar" : (linha.skinId ?? "")}
                  disabled={enviando || linha.situacao === "pronto"}
                  onChange={(e) => {
                    const valor = e.target.value;
                    if (valor === "__criar") {
                      mudar(linha.id, {
                        skinId: null,
                        criarComNome: linha.nomeLido,
                      });
                    } else {
                      mudar(linha.id, {
                        skinId: valor || null,
                        criarComNome: null,
                      });
                    }
                  }}
                  className="h-8 max-w-[15rem] min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-xs"
                >
                  <option value="">
                    {linha.skinId || !linha.nomeLido
                      ? "Escolha a skin"
                      : `Não achei "${linha.nomeLido}"`}
                  </option>
                  {linha.sugestoes.length > 0 && (
                    <optgroup label="Parecidas">
                      {linha.sugestoes.map((nome) => (
                        <option key={nome} value={porNome.get(nome) ?? ""}>
                          {nome}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Catálogo">
                    {skins.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                  {linha.nomeLido && (
                    <optgroup label="Nova">
                      <option value="__criar">
                        Cadastrar &quot;{linha.nomeLido}&quot;
                      </option>
                    </optgroup>
                  )}
                </select>

                <select
                  value={linha.wear ?? ""}
                  disabled={enviando || linha.situacao === "pronto"}
                  onChange={(e) =>
                    mudar(linha.id, {
                      wear: (e.target.value || null) as SkinWear | null,
                    })
                  }
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
                >
                  <option value="">Todos os desgastes</option>
                  {DESGASTES.map((w) => (
                    <option key={w} value={w}>
                      {WEAR_LABEL[w]}
                    </option>
                  ))}
                </select>

                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={enviando || linha.situacao === "pronto"}
                  onClick={() =>
                    mudar(linha.id, {
                      situacao:
                        linha.situacao === "pulado" ? "pendente" : "pulado",
                    })
                  }
                >
                  {linha.situacao === "pulado" ? "Voltar" : "Pular"}
                </Button>
              </div>
            );
          })}
        </Card>
      )}

      {linhas.length > 0 && (
        <div className="sticky bottom-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/90 p-3 backdrop-blur">
          <Button
            type="button"
            disabled={enviando || prontas.length === 0}
            onClick={importar}
          >
            {enviando ? (
              <Loader2 aria-hidden className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Upload aria-hidden className="mr-1.5 h-4 w-4" />
            )}
            Importar {prontas.length} arte{prontas.length === 1 ? "" : "s"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={enviando}
            onClick={() => setLinhas([])}
          >
            Limpar a lista
          </Button>
          <p className="text-xs text-muted-foreground">
            Uma de cada vez, para uma falha não levar as outras junto.
          </p>
        </div>
      )}
    </div>
  );
}
