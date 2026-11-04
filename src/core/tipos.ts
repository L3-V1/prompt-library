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

export interface Pastas {
  vault: string;
  prompts: string;
  versoes: string;
  lixeira: string;
}
