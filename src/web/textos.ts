import type { MotivoVersao } from './dados/cliente';

const formatoData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });

export function formatarData(iso: string | number): string {
  return formatoData.format(new Date(iso));
}

export const MOTIVOS: Record<MotivoVersao, string> = {
  criacao: 'Criação',
  manual: 'Manual',
  analise: 'Análise',
  captura: 'Captura',
  restauracao: 'Restauração',
};

export const SEM_COLECAO = 'Sem coleção';

/** Indicador, na lista, do Prompt com Análise aberta. */
export const ANALISE_EM_ANDAMENTO = 'Análise em andamento';

/** `Ctrl` ou `⌘`, para os atalhos exibidos. */
export const TECLA_MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
