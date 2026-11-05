/** De onde veio um Prompt capturado pelo `/save` (decisão 38). */
export interface Origem {
  projeto: string;
  data: string;
  sessao: string;
}

export interface Prompt {
  id: string;
  titulo: string;
  tags: string[];
  favorito: boolean;
  /** Subpasta direta de `Prompts/`, ou `null` para "Sem coleção". */
  colecao: string | null;
  /** Tudo depois do `---` de fechamento do frontmatter, byte a byte. */
  corpo: string;
  /** Caminho relativo a `Prompts/`, com `/` como separador. */
  caminho: string;
  /** Data de modificação do arquivo, em ms desde a época. */
  mtime: number;
  /** sha256 hex do arquivo cru; base da detecção de conflito. */
  hash: string;
  origem?: Origem;
}

export type MotivoVersao = 'criacao' | 'manual' | 'analise' | 'captura' | 'restauracao';

export const MOTIVOS_VERSAO: readonly MotivoVersao[] = [
  'criacao',
  'manual',
  'analise',
  'captura',
  'restauracao',
];

export interface Versao {
  /** Nome do arquivo sem `.md`: `<AAAAMMDDTHHmmssSSSZ>-<motivo>`. */
  id: string;
  promptId: string;
  /** Data ISO 8601 (UTC). */
  criadaEm: string;
  motivo: MotivoVersao;
  /** Caminho relativo a `Prompts/`. */
  caminho: string;
}

export interface VersaoComConteudo extends Versao {
  /** Snapshot verbatim do `.md` naquele momento. */
  conteudo: string;
}

/** Arquivo em `Prompts/` que não pôde ser lido como Prompt. */
export interface Problema {
  caminho: string;
  mensagem: string;
}

export interface ResultadoListagem {
  prompts: Prompt[];
  problemas: Problema[];
}

/** O que acontece ao excluir uma Coleção (decisões 122 a 124). */
export interface PreviaExclusao {
  /** `.md` que vão para "Sem coleção". */
  prompts: number;
  /** Os outros arquivos, que vão para a lixeira dentro da pasta da Coleção. */
  outros: number;
  /** Títulos dos Prompts cujo nome de arquivo já estaria ocupado na raiz. */
  conflitos: string[];
}

export interface Pastas {
  vault: string;
  prompts: string;
  versoes: string;
  lixeira: string;
  /** `Prompts/_Diretrizes.md` (decisão 5). */
  diretrizes: string;
  /** `Prompts/.analises/`: uma Análise em andamento por Prompt, em `<id>.json`. */
  analises: string;
}

/** Estado das Diretrizes no disco; `hash` é `null` quando o arquivo não existe. */
export interface EstadoDiretrizes {
  conteudo: string;
  hash: string | null;
}

// --- Análise (M5) ---

/** `aceita` e `rejeitada` são decisões gravadas; `pendente` e `desatualizada` saem do Rascunho. */
export type StatusSugestao = 'pendente' | 'aceita' | 'rejeitada' | 'desatualizada';

export interface Sugestao {
  id: string;
  justificativa: string;
  /** Trecho do Rascunho a trocar, copiado literalmente; nunca vazio. */
  trechoOriginal: string;
  trechoNovo: string;
  status: StatusSugestao;
  /** Pista de offset do trecho no Rascunho; `null` quando desatualizada. */
  inicio: number | null;
}

/** O que o Claude devolve para cada Sugestão. */
export interface SugestaoGerada {
  justificativa: string;
  trechoOriginal: string;
  trechoNovo: string;
}

export type ModeloClaude = 'opus' | 'sonnet' | 'haiku';

/** O que o Claude está fazendo durante a geração, a partir de um `tool_use` (decisão 128). */
export type AtividadeClaude =
  | { tipo: 'ler'; caminho: string }
  | { tipo: 'buscar'; termo: string }
  | { tipo: 'listar'; padrao: string };

export interface ExecucaoAnalise {
  tipo: 'analise' | 'sugestao';
  sugestaoId?: string;
  iniciadaEm: string;
}

export interface UltimaExecucao {
  custoUsd: number;
  duracaoMs: number;
  modelo: string;
  /** Sugestões geradas e descartadas por não terem o trecho no Rascunho. */
  descartadas: number;
}

/** Aprimoramento assistido de um Prompt, persistido em `Prompts/.analises/<promptId>.json`. */
export interface Analise {
  promptId: string;
  /** Hash do Prompt quando a Análise começou. */
  baseHash: string;
  corpoOriginal: string;
  rascunho: string;
  instrucao: string;
  /** `null` = padrão do Claude Code (decisão 21). */
  modelo: ModeloClaude | null;
  sugestoes: Sugestao[];
  execucao: ExecucaoAnalise | null;
  erro: string | null;
  ultimaExecucao?: UltimaExecucao;
  criadaEm: string;
  atualizadaEm: string;
}
