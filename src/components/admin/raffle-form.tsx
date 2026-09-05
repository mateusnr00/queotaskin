"use client";

// Form de criação/edição de sorteio. Layout inspirado no Sorteamos:
// tabs horizontais com ícones (variant=line), card branco com seções,
// botão Salvar sticky no rodapé.
//
// Tabs implementadas: Geral, Títulos.
// Tabs marcadas "em breve" (visual apenas): Imagens, Prêmios, Afiliados,
// Títulos Premiados, Pagamento, Promoções, Alertas, Upsell, Anti Spam,
// Suporte, Capitalizadora, Restrições.

import type { PaymentProvider as PaymentProviderEnum } from "@prisma/client";

import { precoPorNumero } from "@/lib/dinheiro";
import {
  deveConsultarPreco,
  respostaAindaVale,
} from "@/lib/busca-automatica-de-preco";
import {
  decidirAtualizacaoDaDescricao,
  montarDescricaoPadrao,
} from "@/lib/descricao-padrao";
import {
  PainelDoPrecoDaSteam,
  type PrecoDeReferencia,
} from "@/components/admin/preco-da-steam";
import {
  precoDaSkinAction,
  precoDaSkinDoSorteioAction,
} from "@/server/actions/preco-da-skin";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Award,
  CalendarClock,
  Camera,
  CreditCard,
  Eye,
  Info,
  Loader2,
  Settings,
  Sparkles,
  Tag,
  TagsIcon,
  Ticket,
  Trash2,
  Trophy,
  UserRound,
} from "lucide-react";

import {
  RaffleImagesTab,
  type RaffleImageItem,
} from "@/components/admin/raffle-images-tab";
import {
  SeletorDeSkin,
  type SkinDoCatalogo,
  nomeComDesgaste,
} from "@/components/admin/seletor-de-skin";
import { RaffleDangerZone } from "@/components/admin/raffle-danger-zone";
import { StickySaveBar } from "@/components/admin/sticky-save-bar";
import { RafflePrizesTab } from "@/components/admin/raffle-prizes-tab";
import type { SkinWear } from "@prisma/client";
import type { PrizeDraft } from "@/components/admin/skin-prize-editor";
import { RafflePromotionsTab } from "@/components/admin/raffle-promotions-tab";
import { RafflePaymentTab } from "@/components/admin/raffle-payment-tab";
import { RaffleAwardedTicketsTab } from "@/components/admin/raffle-awarded-tickets-tab";
import { SecaoDoFormulario } from "@/components/admin/secao-de-formulario";
import {
  DestinoDoSorteio,
  hojeNoBrasil,
  NoCronograma,
  type DestinoEscolhido,
} from "@/components/admin/destino-do-sorteio";
import { cn } from "@/lib/utils";
import { ESCADA_DE_RANK } from "@/lib/rank";
import type { SkinDoCatalogoSimples } from "@/components/admin/campo-de-premio";

import {
  raffleGeneralSchema,
  type RaffleGeneralInput,
} from "@/lib/validations/raffle";
import {
  createRaffleAction,
  definirDestinoAction,
  updateRaffleAction,
} from "@/server/actions/raffles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { toSlug } from "@/lib/slug";

type Mode = { kind: "create" } | { kind: "edit"; id: string };

// O prêmio carrega a ficha de skin do CS2, ver PrizeDraft.
type PrizeData = PrizeDraft;
interface PromotionData {
  quantity: number;
  price: number;
  label: string | null;
  type?: "QTY" | "MORE_THAN";
}

interface RaffleFormProps {
  mode: Mode;
  /** O nome do painel, para a descrição padrão não trazer marca fixa. */
  nomeDoSite?: string;
  /**
   * A situação atual da campanha, no modo edição. É ela que decide o que a
   * seção de destino oferece: rascunho escolhe para onde vai, campanha na fila
   * vê onde está, e no ar ou encerrada não vê nada disso.
   */
  statusAtual?: "DRAFT" | "QUEUED" | "ACTIVE" | "FINISHED" | "CANCELLED";
  /** O lugar dela na fila, quando está no cronograma. */
  noCronograma?: { dia: string | null; posicao: number; situacao: string } | null;
  /** Destino pré-escolhido pela tela que trouxe o admin até aqui. */
  destinoInicial?: "RASCUNHO" | "CRONOGRAMA";
  /**
   * Aba aberta ao montar. A criacao usa isso para continuar de onde o
   * usuario estava: ele clica em "Imagens" antes do sorteio existir, o
   * formulario cria e redireciona para ca ja nessa aba.
   */
  abaInicial?: string;
  /** Título atual, a exclusão pede que ele seja digitado para confirmar. */
  raffleTitle?: string;
  /** Catálogo de skins do tenant. Só usado na criação. */
  skins?: SkinDoCatalogo[];
  /**
   * O mesmo catálogo, só nome e raridade, para sugerir o prêmio nos Títulos
   * Premiados. Separado de `skins` porque aquele traz foto, float e valor de
   * cada uma das centenas de skins, e a aba de premiados precisa só do nome:
   * mandar a ficha completa para o navegador seria pagar caro por nada.
   */
  catalogoDePremios?: SkinDoCatalogoSimples[];
  defaultValues?: Partial<RaffleGeneralInput>;
  // Dados de conteúdo das abas, só preenchidos no modo edit.
  initialImages?: RaffleImageItem[];
  initialTrofeuUrl?: string | null;
  /** Campanha do card grande do topo: a capa dela tem outra moldura. */
  initialPrincipal?: boolean;
  initialPrizes?: PrizeData[];
  initialPromotions?: PromotionData[];
  // Dados da aba "Pagamento", só populados no modo edit.
  initialPaymentProvider?:
    | "SYNCPAY"
    | "SIGILOPAY"
    | "NEXUSPAG"
    | "HORSEPAY"
    | null;
  tenantPaymentDefault?: PaymentProviderEnum;
  configuredProviders?: {
    syncpay: boolean;
    sigilopay: boolean;
    nexuspag: boolean;
    horsepay: boolean;
  };
  // O tipo vem da própria aba, e não copiado aqui: a lista ganhou condições de
  // saída e a marca de número já vendido, e uma cópia desatualizada apagaria
  // esses campos na travessia sem o compilador dizer nada.
  initialAwardedTickets?: React.ComponentProps<
    typeof RaffleAwardedTicketsTab
  >["initialItems"];
  /** Quantos números da campanha ainda estão à venda. */
  titulosDisponiveis?: number;
  initialAwardedConfig?: {
    enabled: boolean;
    showList: boolean;
    viewMode: "list" | "modal";
    winnerText: string;
    loserShow: boolean;
    loserTitle: string;
    loserText: string;
  };
  initialPromotionsConfig?: {
    enabled: boolean;
    doubleEnabled: boolean;
    doubleFrom: string | null;
    doubleUntil: string | null;
    accumulative: boolean;
  };
  initialPrizesConfig?: {
    show: boolean;
    showSkinSpecs: boolean;
    ebook: {
      enabled: boolean;
      title: string;
      text: string;
      url: string;
      buttonText: string;
    };
  };
}

// Nada vem pré-preenchido na criação: texto vazio, switches OFF, datas
// null, categoria vazia. O admin escolhe tudo conscientemente. Os únicos
// campos sempre ON são name/phone/cpf em requiredFields (vêm do cadastro
// obrigatório do usuário; admin não pode desligar na UI). Selects com
// enum (privacy/modality/descriptionMode) ficam no primeiro valor pra evitar
// estado indefinido, admin troca se quiser. reservationModel é a exceção: vem
// em RANDOM_NUMBERS de propósito, não no primeiro valor do enum.
const DEFAULT_VALUES: RaffleGeneralInput = {
  title: "",
  slug: "",
  shortDescription: "",
  description: "",
  descriptionMode: "COLLAPSED",
  category: "",
  privacy: "PUBLIC",
  showOnHome: false,
  drawDate: null,
  salesStart: null,
  autoCloseOnDraw: false,
  showDrawDate: false,
  allowReceiptDownload: false,
  aceitaCupomDeAfiliado: true,
  showParticipantName: false,
  modality: "OWN_DRAW",
  // Números aleatórios, e não escolha manual: é o padrão pedido, e é o que
  // a maioria das campanhas usa. Quem quiser deixar o participante escolher
  // troca no select logo ali.
  reservationModel: "RANDOM_NUMBERS",
  requiredFields: {
    name: true,
    phone: true,
    cpf: true,
    email: false,
    socialName: false,
    birthDate: false,
  },
  totalNumbers: 100,
  pricePerNumber: 1,
  isFree: false,
  freeLabel: null,
  seloInicialTexto: null,
  hasFee: false,
  feeAmount: null,
  reservationTimeoutMinutes: 5,
  minPurchase: 1,
  maxPurchase: 100,
  initialQuantity: null,
  maxPerBuyer: null,
  minLevel: null,
  showProgressBar: true,
  showDailyRanking: false,
  showOverallRanking: false,
  showShareButtons: false,
  selectionCards: [],
  selectionCardsBestseller: -1,
};

const TIMEOUT_OPTIONS = [
  { value: 3, label: "3 minutos" },
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
];

const CATEGORIES = [
  "Veículos",
  "Eletrônicos",
  "Imóveis",
  "Dinheiro",
  "Viagens",
  "Skins/Games",
  "Roupas/Acessórios",
  "Outros",
];

/** O valor do item "sem exigência". O Select não aceita string vazia. */
const ABERTA_A_TODOS = "aberta";

/** Rótulo por valor, para o Select mostrar o nome do rank já escolhido. */
const ROTULOS_DE_RANK: Record<string, string> = {
  [ABERTA_A_TODOS]: "Aberta a todos",
  ...Object.fromEntries(ESCADA_DE_RANK.map((d) => [String(d.valor), d.label])),
};

export function RaffleForm({
  nomeDoSite = "",
  mode,
  statusAtual,
  noCronograma = null,
  destinoInicial = "RASCUNHO",
  abaInicial,
  raffleTitle = "",
  skins = [],
  catalogoDePremios = [],
  defaultValues,
  initialImages = [],
  initialTrofeuUrl = null,
  initialPrincipal = false,
  initialPrizes = [],
  initialPromotions = [],
  initialPaymentProvider = null,
  tenantPaymentDefault = "SYNCPAY",
  configuredProviders = {
    syncpay: false,
    sigilopay: false,
    nexuspag: false,
    horsepay: false,
  },
  initialAwardedTickets = [],
  titulosDisponiveis,
  initialAwardedConfig = {
    enabled: true,
    showList: true,
    viewMode: "list" as const,
    winnerText: "",
    loserShow: true,
    loserTitle: "",
    loserText: "",
  },
  initialPromotionsConfig = {
    enabled: true,
    doubleEnabled: false,
    doubleFrom: null,
    doubleUntil: null,
    accumulative: false,
  },
  initialPrizesConfig = {
    show: true,
    showSkinSpecs: false,
    ebook: {
      enabled: false,
      title: "",
      text: "",
      url: "",
      buttonText: "",
    },
  },
}: RaffleFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<string>(abaInicial || "geral");
  // Trava de reentrada da criação. Quatro cliques seguidos em abas
  // diferentes disparariam quatro criações; sobreviveria só a primeira, e o
  // usuário levaria três erros sem entender o motivo.
  //
  // Ref e não estado porque os cliques chegam antes de qualquer
  // re-renderização: um estado ainda estaria falso no segundo clique. Só é
  // lida dentro de aoTrocarDeAba, que é manipulador de evento.
  const criacaoEmVoo = useRef(false);
  // Quem manda na URL: enquanto o admin não escrever nela, ela acompanha o
  // título. Depois que ele escreve, para de mexer, senão a próxima letra
  // digitada no título apagaria o que ele acabou de compor.
  //
  // Estado e não ref: acompanharTitulo é montada durante a renderização (vai
  // como prop para o seletor de skin), e ler ref por esse caminho é
  // justamente o que o compilador do React proíbe.
  const [urlEscritaAMao, setUrlEscritaAMao] = useState(false);

  /**
   * Deriva a URL do título.
   *
   * Existe como função e não como trecho dentro do onChange do campo porque
   * o título tem duas origens: o que se digita e a skin escolhida do
   * catálogo, que entra por setValue e não passa por onChange nenhum. Era
   * por isso que escolher a skin preenchia o título e deixava a URL vazia.
   */
  function acompanharTitulo(titulo: string) {
    if (mode.kind !== "create" || urlEscritaAMao) return;
    form.setValue("slug", toSlug(titulo), { shouldDirty: true });
  }
  // O destino escolhido para depois de salvar. Só a criação e o rascunho o
  // usam; para os outros estados a seção nem aparece.
  const [destinoDoSorteio, setDestinoDoSorteio] = useState<DestinoEscolhido>({
    tipo: destinoInicial,
    dia: hojeNoBrasil(),
    posicao: "fim",
  });

  const isEdit = mode.kind === "edit";
  const raffleId = mode.kind === "edit" ? mode.id : "";
  // Criação sempre escolhe. Na edição, só rascunho: campanha no ar, na fila,
  // encerrada ou cancelada tem caminho próprio, e oferecer "publicar agora"
  // numa campanha encerrada seria inventar uma regra que não existe.
  const podeEscolherDestino =
    mode.kind === "create" || statusAtual === "DRAFT";
  // Skin escolhida do catálogo. Só existe na criação: depois, prêmio e capa
  // passam a ser editados nas próprias abas.
  const [skinEscolhida, setSkinEscolhida] = useState<string | null>(null);
  // O desgaste é escolhido na criação, e não vem do catálogo: a mesma skin é
  // sorteada em desgastes diferentes, e é por isso que o catálogo guarda uma
  // linha por skin sem desgaste nenhum.
  const [desgasteEscolhido, setDesgasteEscolhido] = useState<SkinWear | null>(
    null,
  );

  // ===== Preço sugerido a partir do valor da skin na Steam =====
  //
  // Tudo aqui é disparado por evento, e não por efeito: quem escolhe a skin,
  // troca o desgaste ou muda a quantidade de cotas é uma ação do admin, e
  // amarrar a busca a essas ações deixa claro quando a rede é usada.
  // A STEAM É A REFERÊNCIA; O CATÁLOGO É A RESERVA.
  //
  // O preço vem do Mercado da Comunidade Steam, consultado pelo SERVIDOR (a
  // rota limita por IP e valor vindo do navegador é valor que o cliente
  // escolheu). Quando ela não responde, o valor digitado no catálogo assume,
  // porque campanha não pode deixar de ser criada por causa de serviço de
  // terceiro fora do ar.
  const [precoDaSteam, setPrecoDaSteam] = useState<PrecoDeReferencia | null>(
    null,
  );
  const [valorDaSkin, setValorDaSkin] = useState<number | null>(null);
  const [buscandoPreco, setBuscandoPreco] = useState(false);
  const [erroDoPreco, setErroDoPreco] = useState<string | null>(null);

  // Preço digitado à mão manda. Sugestão que sobrescreve o que a pessoa
  // acabou de escrever não é ajuda, é briga.
  const [precoEditadoAMao, setPrecoEditadoAMao] = useState(false);

  // A DESCRIÇÃO PADRÃO, E COMO SE SABE QUE ELA AINDA É PADRÃO.
  //
  // `descricaoGerada` guarda o último texto que ESTE formulário escreveu no
  // campo. Enquanto o conteúdo do campo for exatamente igual a ele, ninguém
  // mexeu e dá para reescrever à vontade quando a skin ou o preço mudarem.
  // Assim que uma letra diferir, o texto passou a ser de quem digitou, e a
  // atualização vira oferta em vez de substituição.
  //
  // Comparação de texto e não uma bandeira "editado": a bandeira erra quando
  // alguém digita e desfaz, e não sobrevive a nada. O texto é a própria
  // verdade, e a função que o gera é determinística de propósito.
  // A BUSCA AUTOMÁTICA, E AS DUAS COISAS QUE ELA PRECISA GARANTIR.
  //
  // `pedidoDoPreco` numera cada consulta. A resposta só é aplicada quando o
  // número dela ainda é o último pedido: escolher a AWP e logo em seguida a
  // AK fazia a resposta atrasada da AWP cair em cima da AK, com preço e
  // descrição de uma skin que não está mais selecionada.
  //
  // `jaBuscadas` guarda skin+desgaste já consultados NESTE formulário, para
  // ir e voltar entre duas skins não render uma consulta por clique. O botão
  // manual não olha para este conjunto: ele existe justamente para furar
  // qualquer cache.
  const pedidoDoPreco = useRef(0);
  const jaBuscadas = useRef<Set<string>>(new Set());

  const descricaoGerada = useRef<string>("");
  const [descricaoOferecida, setDescricaoOferecida] = useState<string | null>(
    null,
  );

  /** Aplica valor ÷ cotas no campo de preço, se a sugestão ainda for bem-vinda. */
  /**
   * Preenche o preço da cota, e só enquanto ninguém digitou nada.
   *
   * PREÇO DIGITADO À MÃO É DEFINITIVO.
   *
   * Depois que a pessoa escreve um valor, nada aqui o substitui: nem trocar a
   * quantidade de cotas, nem buscar o preço de novo. A sugestão nova aparece
   * no painel como oferta, com um botão para aplicar. Sugestão que sobrescreve
   * o que alguém acabou de escrever não é ajuda, é briga, e some sem a pessoa
   * ver.
   */
  function aplicarSugestao(brl: number, cotas: unknown) {
    if (form.getValues("isFree") || precoEditadoAMao) return;
    const sugerido = precoPorNumero(brl, Number(cotas));
    if (sugerido != null) {
      form.setValue("pricePerNumber", sugerido, { shouldDirty: true });
    }
  }

  /** Aplica a sugestão a pedido, quando quem digitou muda de ideia. */
  function usarSugestao(valor: number) {
    form.setValue("pricePerNumber", valor, { shouldDirty: true });
    setPrecoEditadoAMao(false);
  }

  /**
   * O valor que o catálogo guarda, aplicado na hora e sem rede.
   *
   * É a reserva e é o que aparece enquanto a Steam responde: o catálogo já
   * veio inteiro para esta tela, então o número está aqui do lado. Skin sem
   * valor no catálogo simplesmente não sugere nada até a Steam voltar.
   */
  function usarValorDoCatalogo(skinId: string | null) {
    const skin = skinId ? skins.find((sk) => sk.id === skinId) : null;
    const brl = skin?.skinValueBrl ?? null;
    setValorDaSkin(brl != null && brl > 0 ? brl : null);
    if (brl != null && brl > 0) {
      aplicarSugestao(brl, form.getValues("totalNumbers"));
    }
  }

  /**
   * Consulta a Steam sozinho quando a skin escolhida não traz preço servível.
   *
   * POR QUE NO CLIQUE, E NÃO NUM EFFECT.
   *
   * Um effect que olha a skin escolhida dispara também em re-render, em
   * remontagem e em qualquer mudança de dependência que alguém acrescente
   * depois. Aqui, uma escolha é uma consulta, no máximo: quem chama é a ação
   * de quem clicou.
   *
   * E SÓ QUANDO PRECISA.
   *
   * O catálogo guarda o último preço vindo da Steam e a hora dele. Dentro da
   * janela em que esse preço ainda vale, não há o que perguntar: o valor já
   * está na tela e já entrou na descrição. Fora dela, ou sem data nenhuma,
   * consulta. Skin já consultada neste formulário também não repete.
   *
   * Sem `forcar`: o botão "Atualizar preço" é que existe para furar o cache
   * do servidor. Esta consulta aceita o cache de bom grado.
   */
  function buscarSeVierSemPreco(skinId: string | null, wear: SkinWear | null) {
    // Campanha que já existe não consulta sozinha: a descrição dela está
    // publicada, e abrir a tela de edição não é motivo para mexer em preço.
    if (!skinId) return;
    const precisa = deveConsultarPreco({
      skin: skins.find((sk) => sk.id === skinId) ?? null,
      ehEdicao: isEdit,
      jaConsultada: jaBuscadas.current.has(`${skinId}|${wear ?? ""}`),
    });
    if (precisa) void buscarPrecoNaSteam({ skinId, wear });
  }

  /**
   * Escreve a descrição padrão, ou oferece a nova quando já mexeram nela.
   *
   * Chamada quando a skin muda, o desgaste muda ou o preço da Steam chega:
   * são os três dados que o texto usa. Sem skin escolhida não faz nada, e o
   * campo continua como estava.
   */
  function atualizarDescricaoPadrao(opcoes?: {
    skinId?: string | null;
    wear?: SkinWear | null;
    precoBrl?: number | null;
  }) {
    // Só na criação. Numa campanha que já existe, a descrição é conteúdo
    // publicado: reescrevê-la porque alguém abriu a tela seria editar o que
    // o cliente já leu.
    if (isEdit) return;

    const skinId = opcoes?.skinId !== undefined ? opcoes.skinId : skinEscolhida;
    const wear = opcoes?.wear !== undefined ? opcoes.wear : desgasteEscolhido;
    const skin = skinId ? skins.find((sk) => sk.id === skinId) : null;
    if (!skin) return;

    // O MESMO valor de referência que o resto do formulário usa: a Steam
    // quando ela respondeu, o catálogo como reserva. Duas fontes de preço na
    // mesma tela dariam uma descrição que discorda do preço da cota.
    //
    // O valor do catálogo sai da própria skin, e não de `valorDaSkin`: no
    // clique que troca a skin, o estado ainda guarda o valor da skin
    // anterior, e a descrição nasceria com o preço errado ou sem preço.
    const doCatalogo =
      skin.skinValueBrl != null && skin.skinValueBrl > 0
        ? skin.skinValueBrl
        : null;
    const preco =
      opcoes?.precoBrl !== undefined
        ? opcoes.precoBrl
        : (precoDaSteam?.brl ?? doCatalogo);

    const texto = montarDescricaoPadrao({
      nomeDaSkin: nomeComDesgaste(skin.name, wear),
      precoBrl: preco,
      nomeDoSite,
    });
    if (!texto) return;

    const decisao = decidirAtualizacaoDaDescricao({
      atual: form.getValues("description") ?? "",
      ultimaGerada: descricaoGerada.current,
      nova: texto,
    });
    if (decisao === "aplicar") {
      form.setValue("description", texto, { shouldDirty: true });
      descricaoGerada.current = texto;
      setDescricaoOferecida(null);
    } else if (decisao === "oferecer") {
      // Já é texto de quem escreveu. Oferece, e deixa a decisão com ele.
      setDescricaoOferecida(texto);
    }
  }

  /** Aplica a descrição oferecida, quando quem escreveu aceita a troca. */
  function usarDescricaoOferecida() {
    if (!descricaoOferecida) return;
    form.setValue("description", descricaoOferecida, { shouldDirty: true });
    descricaoGerada.current = descricaoOferecida;
    setDescricaoOferecida(null);
  }

  /**
   * Consulta o preço na Steam e sugere a cota.
   *
   * Disparada por EVENTO, nunca por efeito: escolher a skin, trocar o
   * desgaste e clicar em "Atualizar preço" são ações de quem opera, e amarrar
   * a rede a elas deixa visível quando o painel fala com a Steam. Efeito de
   * render consultaria a cada tecla digitada no título.
   *
   * `forcar` é o botão: ele fura o cache de dez minutos do servidor.
   */
  async function buscarPrecoNaSteam(opcoes?: {
    skinId?: string | null;
    wear?: SkinWear | null;
    forcar?: boolean;
  }) {
    const skinId = opcoes?.skinId !== undefined ? opcoes.skinId : skinEscolhida;
    const wear = opcoes?.wear !== undefined ? opcoes.wear : desgasteEscolhido;

    // Na edição não há seletor: quem sabe qual é a skin é o servidor, pelo
    // prêmio salvo. O navegador manda o id do sorteio, não o nome.
    if (!isEdit && !skinId) {
      setPrecoDaSteam(null);
      setErroDoPreco(null);
      return;
    }

    const meuPedido = ++pedidoDoPreco.current;
    if (skinId) jaBuscadas.current.add(`${skinId}|${wear ?? ""}`);

    setBuscandoPreco(true);
    setErroDoPreco(null);
    try {
      const r = isEdit
        ? await precoDaSkinDoSorteioAction({
            raffleId,
            forcar: opcoes?.forcar,
          })
        : await precoDaSkinAction({
            skinTemplateId: skinId,
            wear,
            forcar: opcoes?.forcar,
          });

      // A resposta chegou depois de outra consulta ter começado: ela é de uma
      // skin que não está mais escolhida, e aplicar qualquer coisa daqui
      // sobrescreveria a seleção atual.
      if (!respostaAindaVale(meuPedido, pedidoDoPreco.current)) return;

      if (!r.ok) {
        // A campanha não fica bloqueada porque a Steam não respondeu: a skin
        // segue escolhida, a descrição segue como está, e o botão manual
        // continua ali para tentar de novo.
        setPrecoDaSteam(null);
        setErroDoPreco(r.erro);
        return;
      }
      setPrecoDaSteam({
        brl: r.brl,
        medianaBrl: r.medianaBrl,
        volume: r.volume,
        buscadoEm: r.buscadoEm,
        marketHashName: r.marketHashName,
      });
      // Não sobrescreve quem digitou, nem no clique: a sugestão nova aparece
      // no painel como oferta, e aplicar é outra decisão.
      aplicarSugestao(r.brl, form.getValues("totalNumbers"));
      // Agora com o preço da Steam no lugar do valor do catálogo.
      atualizarDescricaoPadrao({ skinId, wear, precoBrl: r.brl });
    } catch {
      if (!respostaAindaVale(meuPedido, pedidoDoPreco.current)) return;
      setPrecoDaSteam(null);
      setErroDoPreco(
        "Não foi possível falar com a Steam agora. Preencha o preço à mão.",
      );
    } finally {
      // O rodinha de "buscando" só é desligado pelo pedido mais recente: o
      // atrasado desligaria o aviso de uma consulta que ainda está em pé.
      if (respostaAindaVale(meuPedido, pedidoDoPreco.current))
        setBuscandoPreco(false);
    }
  }

  const form = useForm<RaffleGeneralInput>({
    resolver: zodResolver(
      raffleGeneralSchema,
    ) as unknown as Resolver<RaffleGeneralInput>,
    defaultValues: { ...DEFAULT_VALUES, ...defaultValues },
  });

  const isFree = form.watch("isFree");
  const hasFee = form.watch("hasFee");

  // Abas cujo conteudo e salvo por action propria, com o id do sorteio.
  // Antes do sorteio existir elas nao tinham como funcionar, e o formulario
  // pedia "salve primeiro". Agora salvar deixou de ser tarefa do usuario:
  // clicar na aba cria o sorteio e continua nela.
  const ABAS_QUE_PRECISAM_DO_SORTEIO = [
    "imagens",
    "premios",
    "premiados",
    "pagamento",
    "promocoes",
  ];

  async function aoTrocarDeAba(destino: string) {
    if (!destino) return;

    const precisaExistir =
      !isEdit && ABAS_QUE_PRECISAM_DO_SORTEIO.includes(destino);
    if (!precisaExistir) {
      setActiveTab(destino);
      return;
    }

    // Criar exige os obrigatorios de Geral. Sem eles nao da para salvar, e
    // mandar o usuario para a aba pedida so esconderia o motivo: ele veria
    // uma aba vazia sem saber que faltou preencher titulo ou quantidade.
    const valido = await form.trigger();
    if (!valido) {
      setActiveTab("geral");
      toast.error("Preencha os campos obrigatórios em Geral para continuar.");
      return;
    }

    // Enquanto uma criação está em voo, as outras abas esperam.
    if (criacaoEmVoo.current) return;
    criacaoEmVoo.current = true;
    // Quem trava destrava: a ref não entra em salvar(), senão ela viajaria
    // junto com onSubmit até o handleSubmit, que roda na renderização.
    salvar(form.getValues(), destino, () => {
      criacaoEmVoo.current = false;
    });
  }

  /** Botão "Criar sorteio" / "Salvar alterações": fica onde está. */
  function onSubmit(values: RaffleGeneralInput) {
    salvar(values, null);
  }

  /**
   * Destino e tratamento de falha chegam por parâmetro, nunca de ref lida
   * aqui dentro: esta função é entregue ao handleSubmit durante a
   * renderização, e ler ref por esse caminho é o que o compilador do React
   * proíbe. Quem tem ref para mexer manda a função que mexe nela.
   */
  function salvar(
    values: RaffleGeneralInput,
    abaDeDestino: string | null,
    aoFalhar?: () => void,
  ) {
    if (values.isFree) values.pricePerNumber = 0;

    // O DESTINO SÓ VALE NO BOTÃO DE SALVAR.
    //
    // Trocar de aba também cria o sorteio, e ali o admin está no meio da
    // configuração: aplicar o destino nesse momento mandaria para a fila uma
    // campanha sem imagem e sem prêmio. Com aba de destino, o sorteio nasce
    // rascunho e a escolha continua na tela, esperando o salvar de verdade.
    const destino = abaDeDestino === null ? destinoDoSorteio : null;

    startTransition(async () => {
      // Os dois caminhos ficam separados de propósito: a criação devolve o
      // destino aplicado e a edição não, e uma variável só para os dois faria
      // o tipo virar união em toda linha daqui para baixo.
      if (mode.kind === "create") {
        const result = await createRaffleAction(
          values,
          skinEscolhida ?? undefined,
          desgasteEscolhido ?? undefined,
          destino
            ? { tipo: destino.tipo, dia: destino.dia, posicao: destino.posicao }
            : undefined,
        );
        if (!result.ok) {
          aoFalhar?.();
          toast.error(result.error);
          if (result.fieldErrors?.slug) {
            form.setError("slug", { message: result.fieldErrors.slug[0] });
          }
          return;
        }

        const feito = result.data.destino;
        if (feito.tipo === "CRONOGRAMA" && feito.enfileirado) {
          // Fila alimentada: o caminho seguinte é cadastrar a próxima skin, e
          // não abrir o editor desta. É o passo que a tela existe para poupar.
          toast.success("Sorteio criado e adicionado ao cronograma");
          // O destino VIAJA JUNTO. Sem ele na URL, o formulário novo voltava
          // marcado como rascunho e o sorteio seguinte era salvo sem entrar na
          // fila, em silêncio: o admin cadastraria cinco skins achando que
          // montou o dia e encontraria uma fila com uma só.
          router.push(
            `/admin/sorteios/novo?destino=cronograma&enfileirado=${result.data.id}`,
          );
          return;
        }
        if (feito.tipo === "CRONOGRAMA") {
          // Nada se perde: a campanha existe, salva como rascunho, e o motivo
          // aparece na tela para o admin resolver e mandar para a fila depois.
          toast.warning(
            `Sorteio salvo como rascunho, mas não entrou no cronograma: ${feito.motivo}`,
          );
        } else {
          toast.success(
            feito.tipo === "PUBLICAR" ? "Sorteio publicado" : "Sorteio criado",
          );
        }
        router.push(
          `/admin/sorteios/${result.data.id}/editar${
            abaDeDestino ? `?aba=${abaDeDestino}` : ""
          }`,
        );
        return;
      }

      const result = await updateRaffleAction({ id: mode.id, data: values });
      if (!result.ok) {
        aoFalhar?.();
        toast.error(result.error);
        if (result.fieldErrors?.slug) {
          form.setError("slug", { message: result.fieldErrors.slug[0] });
        }
        return;
      }

      // EDIÇÃO. O conteúdo já foi salvo; o destino, quando escolhido, vai
      // depois e pela mesma função que a criação usa.
      if (destino && destino.tipo !== "RASCUNHO" && statusAtual === "DRAFT") {
        const r = await definirDestinoAction({
          id: mode.id,
          destino: {
            tipo: destino.tipo,
            dia: destino.dia,
            posicao: destino.posicao,
          },
        });
        if (!r.ok) {
          toast.error(r.error);
        } else if (r.data.tipo === "CRONOGRAMA" && !r.data.enfileirado) {
          toast.warning(
            `Salvo, mas não entrou no cronograma: ${r.data.motivo}`,
          );
        } else {
          toast.success(
            r.data.tipo === "PUBLICAR"
              ? "Sorteio publicado"
              : "Adicionado ao cronograma",
          );
        }
      } else {
        toast.success("Sorteio salvo");
      }
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            void aoTrocarDeAba(v);
          }}
          className="gap-5"
        >
          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <TabsList className="inline-flex h-auto w-auto min-w-full md:min-w-0 flex-nowrap items-center gap-1 rounded-2xl bg-muted/60 p-1.5 shadow-sm">
              <TabIcon value="geral" icon={Settings} label="Geral" />
              <TabIcon value="titulos" icon={Ticket} label="Títulos" />
              <TabIcon value="imagens" icon={Camera} label="Imagens" />
              <TabIcon value="premios" icon={Trophy} label="Prêmios" />
              <TabIcon
                value="premiados"
                icon={Award}
                label="Títulos Premiados"
              />
              <TabIcon value="pagamento" icon={CreditCard} label="Pagamento" />
              <TabIcon value="promocoes" icon={TagsIcon} label="Promoções" />
              {/* Última da fila e só na edição: não há o que excluir num
                  sorteio que ainda não existe. */}
              <TabIcon
                perigo
                value="excluir"
                icon={Trash2}
                label="Excluir"
                disabled={!isEdit}
              />
            </TabsList>
          </div>

          {/* =================== GERAL =================== */}
          {/* Layout flat (sem section-headers com ícone) seguindo a ordem
              do SkinsLendarias/Sorteamos: Identidade → Privacidade →
              Mostrar home → 3 selects → Modo descrição → Texto → Status
              → Início vendas → Data sorteio → 3 switches → Campos req. */}
          <TabsContent value="geral">
            <div className="space-y-4">
              {!isEdit && (
                <SeletorDeSkin
                  skins={skins}
                  escolhida={skinEscolhida}
                  aoEscolher={(id) => {
                    setSkinEscolhida(id);
                    // Só o catálogo, que é local e instantâneo. A consulta
                    // externa é do BOTÃO: buscar sozinho a cada skin escolhida
                    // foi o que queimou o limite por IP da fonte antes.
                    usarValorDoCatalogo(id);
                    setPrecoDaSteam(null);
                    setErroDoPreco(null);
                    // A descrição nasce junto com a escolha. Com o valor do
                    // catálogo por enquanto; quando a Steam responder, ela é
                    // reescrita com o preço de lá.
                    atualizarDescricaoPadrao({ skinId: id, wear: null });
                    buscarSeVierSemPreco(id, null);
                  }}
                  desgaste={desgasteEscolhido}
                  aoEscolherDesgaste={(w) => {
                    setDesgasteEscolhido(w);
                    // A mesma AWP custa milhares a mais Factory New do que
                    // Battle-Scarred, então o preço buscado para o desgaste
                    // anterior deixa de valer. Não busca de novo sozinho: só
                    // descarta e espera o clique.
                    setPrecoDaSteam(null);
                    // O desgaste entra no nome do prêmio, então o texto muda.
                    atualizarDescricaoPadrao({ wear: w });
                    // O desgaste muda o item na Steam: a mesma AWP custa
                    // milhares a mais Factory New. O preço anterior já foi
                    // descartado acima, e este é o preço do item novo.
                    buscarSeVierSemPreco(skinEscolhida, w);
                  }}
                  aoPreencherTitulo={(nome) => {
                    form.setValue("title", nome, { shouldDirty: true });
                    acompanharTitulo(nome);
                  }}
                />
              )}

              {/* O RESULTADO APARECE AQUI, e não só na aba do preço.
                  Escolher a skin é o que dispara a consulta, então é aqui que
                  a resposta faz sentido. Antes ela saía embaixo do campo de
                  preço, noutra aba: quando a Steam não respondia, o preço
                  ficava no padrão e ninguém entendia por quê. */}
              {!isEdit && (buscandoPreco || precoDaSteam || valorDaSkin != null) && (
                <div className="px-1 text-xs">
                  <AvisoDoPrecoSugerido
                    valor={precoDaSteam?.brl ?? valorDaSkin}
                    daSteam={precoDaSteam != null}
                    buscando={buscandoPreco}
                    cotas={Number(form.watch("totalNumbers")) || 0}
                    editadoAMao={precoEditadoAMao}
                  />
                </div>
              )}

              <SecaoDoFormulario
                titulo="Identidade da campanha"
                descricao="O nome, o endereço e a chamada que aparecem em toda parte do site."
                icone={<Tag className="h-4 w-4" />}
              >
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Ex: Rifa do iPhone 16"
                          onChange={(e) => {
                            field.onChange(e);
                            acompanharTitulo(e.target.value);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="slug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>URL Amigável *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="ex: rifa-iphone-16"
                          autoComplete="off"
                          onChange={(e) => {
                            // A partir daqui a URL é dele, o título não mexe
                            // mais nela.
                            setUrlEscritaAMao(true);
                            const v = e.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9-]/g, "");
                            field.onChange(v);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        {mode.kind === "create"
                          ? "Sai do título sozinha. Se já existir sorteio com essa URL, um número entra no fim."
                          : "Essa é a URL que corresponderá ao sorteio."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shortDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Breve Descrição *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Aparece nos cards"
                        />
                      </FormControl>
                      <FormDescription>
                        A frase que aparece embaixo do nome nos cards da
                        vitrine.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Categoria</FormLabel>
                      <Select
                        value={field.value ?? ""}
                        onValueChange={(v) => field.onChange(v ?? "")}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SecaoDoFormulario>

              <SecaoDoFormulario
                titulo="A página que o comprador vê"
                descricao="Quem alcança a campanha e o que ela conta sobre o prêmio."
                icone={<Eye className="h-4 w-4" />}
              >
                <FormField
                  control={form.control}
                  name="privacy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Privacidade</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => v && field.onChange(v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                PUBLIC: "Público",
                                PRIVATE: "Privado (acessa apenas com link)",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="PUBLIC">Público</SelectItem>
                          <SelectItem value="PRIVATE">
                            Privado (acessa apenas com link)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Privada sai da vitrine e da home: só chega quem receber
                        o link.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="descriptionMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modo de Descrição</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(v) => v && field.onChange(v)}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                COLLAPSED: "Colapsado/Retraído",
                                EXPANDED: "Expandido",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="COLLAPSED">
                            Colapsado/Retraído
                          </SelectItem>
                          <SelectItem value="EXPANDED">Expandido</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Se o texto abaixo já vem aberto na página ou atrás de um
                        &ldquo;ver mais&rdquo;.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Texto</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          value={field.value ?? ""}
                          rows={10}
                          placeholder="Detalhes da rifa, regulamento, etc..."
                        />
                      </FormControl>

                      {/* A OFERTA, EM VEZ DA SUBSTITUIÇÃO.
                          Quem já escreveu não perde o texto porque trocou a
                          skin ou porque o preço da Steam chegou.

                          Aviso, e não alerta: o texto novo inteiro repetido
                          aqui embaixo dobrava a altura do campo e obrigava a
                          ler duas descrições para escolher entre duas. Uma
                          linha e dois botões dizem a mesma coisa, e o próprio
                          campo mostra o resultado de "atualizar". */}
                      {descricaoOferecida && (
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
                          <span>
                            A skin ou o preço foram alterados. Seu texto
                            personalizado foi mantido.
                          </span>
                          <span className="flex items-center gap-3">
                            <button
                              type="button"
                              className="font-medium text-primary underline-offset-2 hover:underline"
                              onClick={usarDescricaoOferecida}
                            >
                              Atualizar para o padrão
                            </button>
                            <button
                              type="button"
                              className="underline-offset-2 hover:underline"
                              onClick={() => setDescricaoOferecida(null)}
                            >
                              Manter meu texto
                            </button>
                          </span>
                        </div>
                      )}

                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Guardada e registrada no histórico, mas nenhuma consulta
                    pública lê esta coluna: a home lista toda campanha PUBLIC e
                    ACTIVE, e o card grande é decidido por `principal`. Dizer
                    isso na cara é melhor do que deixar uma chave que parece
                    funcionar, e apagá-la em silêncio esconderia a escolha de
                    quem cuida do site. */}
                <SwitchField
                  control={form.control}
                  name="showOnHome"
                  label="Mostrar o sorteio na página inicial"
                  aviso="sem efeito"
                  description="A home hoje lista toda campanha pública e ativa, sem olhar esta chave. Quem manda no card grande é a campanha marcada como principal, na lista de sorteios."
                />
              </SecaoDoFormulario>

              <SecaoDoFormulario
                titulo="Venda e sorteio"
                descricao="Como os números chegam a quem compra, quando a venda abre e quando ela fecha."
                icone={<CalendarClock className="h-4 w-4" />}
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="reservationModel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modelo de Reserva</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => v && field.onChange(v)}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                labels={{
                                  MANUAL: "Escolhe os bilhetes manualmente",
                                  RANDOM_NUMBERS: "Números aleatórios",
                                  SEQUENTIAL: "Sequencial",
                                }}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MANUAL">
                              Escolhe os bilhetes manualmente
                            </SelectItem>
                            <SelectItem value="RANDOM_NUMBERS">
                              Números aleatórios
                            </SelectItem>
                            <SelectItem value="SEQUENTIAL">
                              Sequencial
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Como os números chegam a quem compra.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="modality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Modalidade</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={(v) => v && field.onChange(v)}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                labels={{
                                  OWN_DRAW: "Sorteio próprio",
                                  LOTERIA_FEDERAL: "Loteria Federal",
                                }}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="OWN_DRAW">
                              Sorteio próprio
                            </SelectItem>
                            <SelectItem value="LOTERIA_FEDERAL">
                              Loteria Federal
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          De onde sai o número ganhador.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* O campo "Texto do status" saiu daqui.
                  
                  Ele alimentava o selo enquanto a venda não chegava na
                  metade, e foi por ali que "corre que está acabando" apareceu
                  numa campanha com zero vendido. A faixa inicial passou a ser
                  automática como as outras três, e o texto dela agora fica em
                  Configurações > Mensagens, num lugar só para todas as
                  campanhas. */}

                {/* Início das vendas, select Imediatamente/Agendado, revela
                  o datetime-local só quando Agendado. */}
                <FormField
                  control={form.control}
                  name="salesStart"
                  render={({ field }) => {
                    const mode =
                      field.value != null ? "scheduled" : "immediate";
                    return (
                      <FormItem>
                        <FormLabel>Início das vendas</FormLabel>
                        <Select
                          value={mode}
                          onValueChange={(v) => {
                            if (!v) return;
                            if (v === "immediate") {
                              field.onChange(null);
                            } else if (!field.value) {
                              // Default: amanhã 00:00, admin ajusta no
                              // datetime picker que aparece abaixo.
                              const tomorrow = new Date();
                              tomorrow.setDate(tomorrow.getDate() + 1);
                              tomorrow.setHours(0, 0, 0, 0);
                              field.onChange(tomorrow);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                labels={{
                                  immediate: "Imediatamente",
                                  scheduled: "Agendado",
                                }}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="immediate">
                              Imediatamente
                            </SelectItem>
                            <SelectItem value="scheduled">Agendado</SelectItem>
                          </SelectContent>
                        </Select>
                        {mode === "scheduled" && (
                          <FormControl>
                            <Input
                              type="datetime-local"
                              className="mt-2"
                              value={
                                field.value
                                  ? new Date(field.value)
                                      .toISOString()
                                      .slice(0, 16)
                                  : ""
                              }
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value
                                    ? new Date(e.target.value)
                                    : null,
                                )
                              }
                            />
                          </FormControl>
                        )}
                        <FormDescription>
                          Agendado deixa a campanha pronta e fora do ar até a
                          hora marcada.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="drawDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data do Sorteio</FormLabel>
                      <FormControl>
                        <Input
                          type="datetime-local"
                          value={
                            field.value
                              ? new Date(field.value).toISOString().slice(0, 16)
                              : ""
                          }
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? new Date(e.target.value) : null,
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Pode ficar em branco: as duas chaves abaixo dependem
                        dela, e sem data nenhuma das duas faz efeito.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <SwitchField
                    control={form.control}
                    name="autoCloseOnDraw"
                    label="Encerrar automático na data do sorteio"
                    description="Chegou a data marcada acima, a campanha para de vender sozinha. Sem data, não faz nada."
                  />
                  <SwitchField
                    control={form.control}
                    name="showDrawDate"
                    label="Mostrar a data do sorteio para os participantes"
                    description="A data aparece na página da campanha. Só vale com data preenchida."
                  />
                  {/* Mesmo caso do "mostrar na página inicial": a coluna
                      existe e é salva, mas o comprovante não tem botão de
                      baixar em lugar nenhum. */}
                  <SwitchField
                    control={form.control}
                    name="allowReceiptDownload"
                    label="Permite download do comprovante"
                    aviso="sem efeito"
                    description="A tela do comprovante ainda não tem botão de baixar, então esta chave fica só guardada."
                  />
                  <SwitchField
                    control={form.control}
                    name="aceitaCupomDeAfiliado"
                    label="Aceita Cupom de Entrada do programa de afiliados"
                    description="Desligado, quem tem cupom não consegue usá-lo nesta campanha. O cupom abate até o valor de face dele numa cota, e a diferença é cobrada normalmente."
                  />
                </div>
              </SecaoDoFormulario>

              <SecaoDoFormulario
                titulo="O que pedir de quem compra"
                descricao="O que o formulário da reserva vai pedir de quem compra."
                icone={<UserRound className="h-4 w-4" />}
              >
                {/* Campos requeridos pra realizar a reserva. Nome/Telefone/
                  CPF são sempre exigidos (vêm do cadastro). */}
                <div className="space-y-3">
                  <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                    {(
                      [
                        { key: "name", label: "Nome", disabled: true },
                        { key: "phone", label: "Telefone", disabled: true },
                        { key: "cpf", label: "CPF", disabled: true },
                        { key: "email", label: "E-mail", disabled: false },
                        {
                          key: "socialName",
                          label: "Nome Social",
                          disabled: false,
                        },
                        {
                          key: "birthDate",
                          label: "Data de Nascimento",
                          disabled: false,
                        },
                      ] as const
                    ).map((f) => (
                      <FormField
                        key={f.key}
                        control={form.control}
                        name={`requiredFields.${f.key}` as const}
                        render={({ field }) => (
                          <FormItem className="flex items-center justify-between rounded-xl border bg-muted/30 px-3.5 py-2.5 hover:border-primary/30 hover:bg-muted/60 transition-colors">
                            <FormLabel className="m-0 text-sm font-medium">
                              {f.label}
                            </FormLabel>
                            <FormControl>
                              <Switch
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                disabled={f.disabled}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                  {/* Os três primeiros vêm travados desde sempre, e a tela
                      nunca disse por quê. Sem essa linha, um switch cinza
                      parece defeito. */}
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    Nome, telefone e CPF não se mexem por aqui: eles vêm do
                    cadastro de quem compra.
                  </p>
                </div>
              </SecaoDoFormulario>

              {/* O DESTINO fica no fim, e não no topo: ele é a última decisão
                  de quem preenche, e no topo viraria a primeira pergunta de um
                  formulário que ainda não tem sorteio nenhum para mandar a
                  lugar algum. */}
              {podeEscolherDestino && (
                <DestinoDoSorteio
                  valor={destinoDoSorteio}
                  onChange={setDestinoDoSorteio}
                  desabilitado={isPending}
                />
              )}
              {noCronograma && (
                <NoCronograma
                  dia={noCronograma.dia}
                  posicao={noCronograma.posicao}
                  situacao={noCronograma.situacao}
                />
              )}
            </div>
          </TabsContent>

          {/* =================== TÍTULOS =================== */}
          {/* Layout flat (sem section-headers) seguindo o exemplo do
              SkinsLendarias/Sorteamos: Preço | Quantidade | Timeout → 2
              switches (gratuita/taxa) → maxPerBuyer → min/max/inicial →
              Cards de Seleção (até 6) + bestseller → switches finais. */}
          <TabsContent value="titulos">
            <div className="space-y-4">
              <SecaoDoFormulario
                titulo="Preço e tamanho"
                descricao="Quanto custa o título, quantos existem e quanto tempo a reserva fica de pé esperando o pagamento."
                icone={<Ticket className="h-4 w-4" />}
              >
                {/* O PAINEL VEM ANTES DO CAMPO.
                    A ordem é a da decisão: primeiro se vê quanto a skin vale
                    e quanto dá por número, depois se digita (ou se aceita) o
                    preço. Embaixo do campo, a conta viraria justificativa de
                    um número já escolhido. */}
                <PainelDoPrecoDaSteam
                  preco={precoDaSteam}
                  totalDeNumeros={Number(form.watch("totalNumbers")) || 0}
                  precoDaCota={Number(form.watch("pricePerNumber")) || null}
                  buscando={buscandoPreco}
                  erro={erroDoPreco}
                  podeAtualizar={isEdit ? true : skinEscolhida != null}
                  aoAtualizar={() => void buscarPrecoNaSteam({ forcar: true })}
                  editadoAMao={precoEditadoAMao}
                  aoUsarSugestao={usarSugestao}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="pricePerNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Preço da cota (R$)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            placeholder="0,00"
                            disabled={isFree}
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              setPrecoEditadoAMao(true);
                            }}
                            value={isFree ? 0 : (field.value ?? "")}
                          />
                        </FormControl>
                        {isFree ? (
                          <FormDescription>
                            Campanha gratuita. Preço forçado em R$ 0,00.
                          </FormDescription>
                        ) : (
                          <FormDescription>
                            {precoEditadoAMao
                              ? "Preço definido por você. A sugestão não é mais aplicada sozinha; use \u0022Atualizar preço\u0022 para voltar a ela."
                              : "Sugestão calculada acima. Digitar aqui assume o controle do preço."}
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="totalNumbers"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantidade de cotas</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={10}
                            max={10_000_000}
                            placeholder="100"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              // A divisão muda junto com o divisor: trocar de
                              // 100 para 200 cotas sem refazer a conta deixaria
                              // a rifa arrecadando o dobro da skin.
                              // A divisão muda junto com o divisor: trocar de
                              // 100 para 200 cotas sem refazer a conta
                              // deixaria a campanha arrecadando o dobro da
                              // skin. Não consulta a Steam de novo, só divide
                              // o preço que já está aqui.
                              const referencia = precoDaSteam?.brl ?? valorDaSkin;
                              if (referencia != null) {
                                aplicarSugestao(referencia, e.target.value);
                              }
                            }}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="reservationTimeoutMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Tempo para uma reserva pendente expirar
                        </FormLabel>
                        <Select
                          value={String(field.value)}
                          onValueChange={(v) => v && field.onChange(Number(v))}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue
                                labels={Object.fromEntries(
                                  TIMEOUT_OPTIONS.map((o) => [
                                    String(o.value),
                                    o.label,
                                  ]),
                                )}
                              />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIMEOUT_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={String(o.value)}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SwitchField
                    control={form.control}
                    name="isFree"
                    label="Campanha gratuita"
                    description="Ninguém paga nada. Combina com a trava de rank abaixo para recompensar quem já comprou."
                  />
                  <SwitchField
                    control={form.control}
                    name="hasFee"
                    label="Adicionar taxa"
                    description="Um valor fixo somado ao total da compra."
                  />
                </div>

                {isFree && (
                  <FormField
                    control={form.control}
                    name="freeLabel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Texto exibido no card de preço</FormLabel>
                        <FormControl>
                          <Input
                            maxLength={60}
                            placeholder="SORTEIO GRATUITO"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(e.target.value || null)
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {/* Selo/chamada do card (o "Adquira já!" que pisca), exclusivo
                    desta campanha. Vale para qualquer campanha, paga ou grátis. */}
                <FormField
                  control={form.control}
                  name="seloInicialTexto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Selo do card (chamada)</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={40}
                          placeholder="Adquira já!"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value || null)}
                        />
                      </FormControl>
                      <FormDescription>
                        O texto que pisca no canto do card, só desta campanha.
                        Vazio: mostra “Adquira já!”. Muda só a chamada inicial;
                        “últimos números”, “esgotado” e afins seguem automáticos
                        pela venda.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {hasFee && (
                  <FormField
                    control={form.control}
                    name="feeAmount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor da taxa (R$)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            {...field}
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </SecaoDoFormulario>

              <SecaoDoFormulario
                titulo="Quem pode comprar, e quanto"
                descricao="Os limites por pessoa e por compra, e a trava de rank para campanha exclusiva."
                icone={<UserRound className="h-4 w-4" />}
              >
                <FormField
                  control={form.control}
                  name="maxPerBuyer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantidade de cotas por comprador</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          placeholder="0"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        />
                      </FormControl>
                      <FormDescription>
                        Coloque 0 para não ter limites de cotas por comprador.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="minLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campanha exclusiva: rank mínimo</FormLabel>
                      {/* Lista, e não campo numérico. Digitar "23" não diz a
                        ninguém que isso é Pro Player, e a escada passou a ter
                        patente no topo: sem ver os nomes, a exclusiva de GOAT
                        não seria descoberta. */}
                      <Select
                        value={
                          field.value ? String(field.value) : ABERTA_A_TODOS
                        }
                        onValueChange={(v) =>
                          field.onChange(
                            v === ABERTA_A_TODOS ? null : Number(v),
                          )
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue labels={ROTULOS_DE_RANK} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ABERTA_A_TODOS}>
                            Aberta a todos
                          </SelectItem>
                          {ESCADA_DE_RANK.map((degrau) => (
                            <SelectItem
                              key={degrau.valor}
                              value={String(degrau.valor)}
                            >
                              {degrau.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Só quem estiver nesse rank ou acima consegue reservar.
                        Vale para campanha paga e para a gratuita, e é o que
                        permite soltar sorteio grátis como recompensa de quem já
                        comprou.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="minPurchase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantidade mínima por reserva *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="maxPurchase"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantidade máxima por reserva *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder="100"
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="initialQuantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantidade inicial por reserva</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            placeholder=""
                            value={field.value ?? ""}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value ? Number(e.target.value) : null,
                              )
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SecaoDoFormulario>

              <SecaoDoFormulario
                titulo="Cards de seleção rápida"
                descricao="Até seis atalhos de quantidade na página da campanha. Campo em branco não vira card."
                icone={<Sparkles className="h-4 w-4" />}
              >
                {/* Cards de seleção rápida (quick-picks). Até 6 valores que
                  viram botões "+N" no form de reserva público. Inputs
                  vazios são ignorados (não vira card). bestseller marca
                  qual card recebe destaque "MAIS POPULAR". */}
                <SelectionCardsField control={form.control} />
              </SecaoDoFormulario>

              <SecaoDoFormulario
                titulo="O que mostrar na página"
                descricao="Barra de progresso, rankings e nome de quem comprou."
                icone={<Eye className="h-4 w-4" />}
              >
                {/* Switches finais, barra de progresso, rankings e extras. */}
                <div className="space-y-2">
                  <SwitchField
                    control={form.control}
                    name="showProgressBar"
                    label="Mostrar barra de progresso das vendas"
                    description="Quanto já foi vendido, na página da campanha."
                  />
                  <SwitchField
                    control={form.control}
                    name="showDailyRanking"
                    label="Mostrar Ranking Diário de Maiores Compradores"
                  />
                  <SwitchField
                    control={form.control}
                    name="showOverallRanking"
                    label="Mostrar Ranking Geral de Maiores Compradores"
                  />
                  <SwitchField
                    control={form.control}
                    name="showParticipantName"
                    label="Mostrar o nome do participante em números pagos"
                    description="Aparece para qualquer visitante, então só ligue se a campanha combinou isso."
                  />
                  <SwitchField
                    control={form.control}
                    name="showShareButtons"
                    label="Mostrar botões de compartilhar"
                  />
                </div>
              </SecaoDoFormulario>
            </div>
          </TabsContent>

          {/* =================== IMAGENS =================== */}
          <TabsContent value="imagens">
            {isEdit ? (
              <RaffleImagesTab
                raffleId={raffleId}
                initialImages={initialImages}
                initialTrofeuUrl={initialTrofeuUrl}
                principal={initialPrincipal}
              />
            ) : (
              <SaveFirstHint label="Não foi possível criar o sorteio. Volte em Geral e confira os campos obrigatórios." />
            )}
          </TabsContent>

          {/* =================== PRÊMIOS =================== */}
          <TabsContent value="premios">
            {isEdit ? (
              <RafflePrizesTab
                raffleId={raffleId}
                initialPrizes={initialPrizes}
                initialConfig={initialPrizesConfig}
              />
            ) : (
              <SaveFirstHint label="Não foi possível criar o sorteio. Volte em Geral e confira os campos obrigatórios." />
            )}
          </TabsContent>

          {/* =================== TÍTULOS PREMIADOS =================== */}
          <TabsContent value="premiados">
            {isEdit ? (
              <RaffleAwardedTicketsTab
                raffleId={raffleId}
                totalNumbers={
                  form.watch("totalNumbers") ||
                  initialAwardedTickets[0]?.number ||
                  100
                }
                catalogo={catalogoDePremios}
                titulosDisponiveis={titulosDisponiveis}
                initialItems={initialAwardedTickets}
                initialConfig={initialAwardedConfig}
              />
            ) : (
              <SaveFirstHint label="Não foi possível criar o sorteio. Volte em Geral e confira os campos obrigatórios." />
            )}
          </TabsContent>

          {/* =================== PAGAMENTO =================== */}
          <TabsContent value="pagamento">
            {isEdit ? (
              <RafflePaymentTab
                raffleId={raffleId}
                initialProvider={initialPaymentProvider}
                tenantDefault={tenantPaymentDefault}
                configuredProviders={configuredProviders}
              />
            ) : (
              <SaveFirstHint label="Não foi possível criar o sorteio. Volte em Geral e confira os campos obrigatórios." />
            )}
          </TabsContent>

          {/* =================== PROMOÇÕES =================== */}
          <TabsContent value="promocoes">
            {isEdit ? (
              <RafflePromotionsTab
                raffleId={raffleId}
                maxPurchase={form.watch("maxPurchase") ?? null}
                initialPromotions={initialPromotions}
                initialConfig={initialPromotionsConfig}
              />
            ) : (
              <SaveFirstHint label="Não foi possível criar o sorteio. Volte em Geral e confira os campos obrigatórios." />
            )}
          </TabsContent>

          {/* =================== EXCLUIR =================== */}
          {/* Ficava solta abaixo do formulário, então era o único bloco
              presente em todas as abas, e a única ação sempre à mão era
              apagar a campanha. Agora exige entrar aqui de propósito. */}
          <TabsContent value="excluir">
            {isEdit ? (
              <RaffleDangerZone raffleId={raffleId} raffleTitle={raffleTitle} />
            ) : (
              <SaveFirstHint label="Só dá para excluir um sorteio depois de criá-lo." />
            )}
          </TabsContent>
        </Tabs>

        {/* A barra de salvar acompanha as abas do formulário principal.
            As outras abas trazem a própria barra, com a própria action,
            e a de Excluir não tem barra, porque lá não se salva nada. */}
        {(activeTab === "geral" || activeTab === "titulos") && (
          <StickySaveBar
            status={
              form.formState.isDirty
                ? "Você tem alterações não salvas"
                : isEdit
                  ? "Tudo salvo"
                  : "Preencha os campos obrigatórios pra criar"
            }
          >
            <Button
              type="submit"
              disabled={isPending}
              size="lg"
              className="min-w-[160px]"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : mode.kind === "create" ? (
                "Criar Sorteio"
              ) : (
                "Salvar alterações"
              )}
            </Button>
          </StickySaveBar>
        )}
      </form>
    </Form>
  );
}

// Card "em breve", disponível pra reuso em tabs futuras (atualmente
// todas as principais já estão implementadas, mas mantido como helper
// pronto pra Alertas/Upsell/Anti Spam/etc).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PlaceholderCard({
  title,
  description,
  icon: Icon = Sparkles,
}: {
  title: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: any;
}) {
  return (
    <Card className="p-8 md:p-12 flex flex-col items-center text-center gap-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <Icon className="h-6 w-6" />
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>
      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary mt-1">
        Em breve
      </span>
    </Card>
  );
}

// Aviso pras tabs que dependem de o sorteio já existir no banco
// (Imagens, Prêmios, Promoções no modo CREATE).
function SaveFirstHint({ label }: { label: string }) {
  return (
    <Card className="p-8 md:p-10 flex flex-col items-center text-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20 dark:text-amber-400">
        <Info className="h-5 w-5" />
      </div>
      <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
        {label}
      </p>
    </Card>
  );
}

// Tab com ícone e label, em formato pílula. Quando ativa, ganha
// background do card e ring sutil, sensação de chip selecionado.
function TabIcon({
  value,
  icon: Icon,
  label,
  disabled,
  perigo,
}: {
  value: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  label: string;
  disabled?: boolean;
  /** A aba que apaga a campanha não pode parecer igual às outras oito. */
  perigo?: boolean;
}) {
  return (
    <TabsTrigger
      value={value}
      disabled={disabled}
      className={cn(
        "flex-none gap-2 rounded-xl px-3.5 py-2 text-xs font-medium sm:text-sm data-active:shadow-sm data-active:ring-1 data-active:ring-border/60",
        perigo &&
          "text-destructive/80 hover:text-destructive data-active:text-destructive data-active:ring-destructive/40",
      )}
      title={disabled ? "Em breve" : undefined}
    >
      <Icon className="h-4 w-4" />
      {label}
    </TabsTrigger>
  );
}

// 6 inputs numéricos pra quick-picks + dropdown "Card mais popular".
// O array `selectionCards` é a fonte da verdade; cada slot da UI lê/escreve
// na posição correspondente do array. Slots vazios mantêm "" no estado
// local e são filtrados na submissão (entram no array só os preenchidos).
function SelectionCardsField({
  control,
}: {
  control: ReturnType<typeof useForm<RaffleGeneralInput>>["control"];
}) {
  return (
    <FormField
      control={control}
      name="selectionCards"
      render={({ field: cardsField }) => {
        const cards: number[] = Array.isArray(cardsField.value)
          ? (cardsField.value as number[])
          : [];
        // UI sempre mostra 6 slots, mesmo que o array tenha menos itens.
        const slots: (number | "")[] = Array.from(
          { length: 6 },
          (_, i) => cards[i] ?? "",
        );

        function setSlot(idx: number, raw: string) {
          const next = [...slots];
          next[idx] = raw ? Math.max(1, Number(raw) || 0) : "";
          // Persiste só os preenchidos (mantém ordem dos slots).
          const cleaned = next.filter(
            (v): v is number => typeof v === "number" && v >= 1,
          );
          cardsField.onChange(cleaned);
        }

        return (
          <FormItem>
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {slots.map((value, idx) => (
                <FormItem key={idx}>
                  <FormLabel>{`Card - 0${idx + 1}`}</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder=""
                      value={value}
                      onChange={(e) => setSlot(idx, e.target.value)}
                    />
                  </FormControl>
                </FormItem>
              ))}
            </div>

            <div className="pt-2">
              <FormField
                control={control}
                name="selectionCardsBestseller"
                render={({ field: bsField }) => {
                  const value = String(bsField.value ?? -1);
                  return (
                    <FormItem>
                      <FormLabel>Card mais popular</FormLabel>
                      <Select
                        value={value}
                        onValueChange={(v) => v && bsField.onChange(Number(v))}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue
                              labels={{
                                "-1": "Nenhum",
                                "0": "Card 1",
                                "1": "Card 2",
                                "2": "Card 3",
                                "3": "Card 4",
                                "4": "Card 5",
                                "5": "Card 6",
                              }}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="-1">Nenhum</SelectItem>
                          <SelectItem value="0">Card 1</SelectItem>
                          <SelectItem value="1">Card 2</SelectItem>
                          <SelectItem value="2">Card 3</SelectItem>
                          <SelectItem value="3">Card 4</SelectItem>
                          <SelectItem value="4">Card 5</SelectItem>
                          <SelectItem value="5">Card 6</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />
            </div>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function SwitchField({
  control,
  name,
  label,
  description,
  aviso,
}: {
  control: ReturnType<typeof useForm<RaffleGeneralInput>>["control"];
  name: keyof RaffleGeneralInput;
  label: string;
  description?: string;
  /** Um selo ao lado do nome, para chave que ainda não faz efeito nenhum. */
  aviso?: string;
}) {
  return (
    <FormField
      control={control}
      name={name as never}
      render={({ field }) => (
        <FormItem className="group/switch flex items-start justify-between gap-3 rounded-xl border bg-muted/30 px-3.5 py-3 hover:border-primary/30 hover:bg-muted/60 transition-colors data-[state=checked]:border-primary/40">
          <div className="flex-1 space-y-0.5">
            <FormLabel className="m-0 flex flex-wrap items-center gap-2 text-sm font-medium leading-snug cursor-pointer">
              {label}
              {aviso && (
                <span className="rounded-full border border-amber-500/40 px-2 py-0.5 text-[10px] font-bold tracking-wide text-amber-400 uppercase">
                  {aviso}
                </span>
              )}
            </FormLabel>
            {description && (
              <p className="text-[11px] text-muted-foreground leading-snug">
                {description}
              </p>
            )}
          </div>
          <FormControl>
            <Switch
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              className="mt-0.5"
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/**
 * A linha embaixo do campo de preço, mostrando a conta.
 *
 * Sugestão sem conta à vista é número que caiu do céu: quem cria a campanha
 * precisa ver o valor da skin dividido pelas cotas para saber se aceita ou
 * corrige. E quando ele corrige, a linha reconhece isso em vez de insistir na
 * sugestão.
 */
function AvisoDoPrecoSugerido({
  valor,
  cotas,
  editadoAMao,
  daSteam,
  buscando,
}: {
  valor: number | null;
  cotas: number;
  editadoAMao: boolean;
  /** Muda a procedência mostrada: a Steam de agora ou o valor do catálogo. */
  daSteam?: boolean;
  buscando?: boolean;
}) {
  if (buscando) {
    return <FormDescription>Buscando preço na Steam...</FormDescription>;
  }
  if (valor == null) return null;

  const emReais = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const sugerido = precoPorNumero(valor, cotas);

  return (
    <FormDescription>
      {daSteam ? "Preço da Steam" : "Valor do catálogo"}:{" "}
      <b className="font-semibold">{emReais(valor)}</b>
      {cotas > 0 && sugerido != null && (
        <>
          {" "}
          ÷ {cotas.toLocaleString("pt-BR")} cotas ={" "}
          <b className="font-semibold">{emReais(sugerido)}</b>
        </>
      )}
      {editadoAMao && " (você ajustou o preço, a sugestão não é mais aplicada)"}
    </FormDescription>
  );
}
