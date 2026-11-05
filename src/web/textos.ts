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

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** O que a exclusão da Coleção vai fazer, para a confirmação (decisão 123). */
export function textoExclusaoColecao({ prompts, outros }: { prompts: number; outros: number }) {
  const partes: string[] = [];
  if (prompts > 0) {
    partes.push(`${plural(prompts, 'Prompt vai', 'Prompts vão')} para ${SEM_COLECAO}`);
  }
  if (outros > 0) {
    partes.push(`${plural(outros, 'arquivo vai', 'arquivos vão')} para a lixeira do vault`);
  }
  if (partes.length === 0) return 'A Coleção está vazia.';
  return `${partes.join(' e ')}.`;
}
