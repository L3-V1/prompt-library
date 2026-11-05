import { diffWords } from 'diff';

import type { AtividadeClaude, StatusSugestao } from '../core/index';

/** Pedaço do mini-diff de uma Sugestão. */
export interface ParteDiff {
  tipo: 'igual' | 'removido' | 'adicionado';
  texto: string;
}

/** Diff por palavra entre o trecho original e o novo, para o card da Sugestão. */
export function miniDiff(trechoOriginal: string, trechoNovo: string): ParteDiff[] {
  return diffWords(trechoOriginal, trechoNovo).map((c) => ({
    tipo: c.added ? 'adicionado' : c.removed ? 'removido' : 'igual',
    texto: c.value,
  }));
}

export type ResumoStatus = Record<StatusSugestao, number> & { total: number };

export function resumoStatus(sugestoes: readonly { status: StatusSugestao }[]): ResumoStatus {
  const r: ResumoStatus = { pendente: 0, aceita: 0, rejeitada: 0, desatualizada: 0, total: 0 };
  for (const s of sugestoes) {
    r[s.status]++;
    r.total++;
  }
  return r;
}

/** `1 Sugestão aceita`, `2 Sugestões aceitas`. */
export function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

const NOMES: Record<StatusSugestao, [string, string]> = {
  pendente: ['pendente', 'pendentes'],
  aceita: ['aceita', 'aceitas'],
  rejeitada: ['rejeitada', 'rejeitadas'],
  desatualizada: ['desatualizada', 'desatualizadas'],
};

/** "2 pendentes, 1 aceita", só com os status presentes. */
export function textoResumo(r: ResumoStatus): string {
  const partes = (Object.keys(NOMES) as StatusSugestao[])
    .filter((s) => r[s] > 0)
    .map((s) => `${r[s]} ${NOMES[s][r[s] === 1 ? 0 : 1]}`);
  return partes.join(', ');
}

export const ROTULO_STATUS: Record<StatusSugestao, string> = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  rejeitada: 'Rejeitada',
  desatualizada: 'Desatualizada',
};

const moeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});
const segundos = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatarCusto(usd: number): string {
  return moeda.format(usd);
}

export function formatarDuracao(ms: number): string {
  return `${segundos.format(ms / 1000)} s`;
}

/** A linha de progresso da geração: `Lendo Code review/x.md`, `Buscando "termo"`. */
export function textoAtividade(atividade: AtividadeClaude): string {
  switch (atividade.tipo) {
    case 'ler':
      return `Lendo ${atividade.caminho}`;
    case 'buscar':
      return `Buscando "${atividade.termo}"`;
    case 'listar':
      return 'Listando arquivos';
  }
}

/** Tempo desde `inicio` em `m:ss`. */
export function tempoDecorrido(inicio: string, agora: number): string {
  const total = Math.max(0, Math.floor((agora - Date.parse(inicio)) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export type ModeloEscolhido = 'opus' | 'sonnet' | 'haiku' | null;

export const MODELOS: { valor: ModeloEscolhido; rotulo: string }[] = [
  { valor: null, rotulo: 'Padrão do Claude Code' },
  { valor: 'opus', rotulo: 'Opus' },
  { valor: 'sonnet', rotulo: 'Sonnet' },
  { valor: 'haiku', rotulo: 'Haiku' },
];

const CHAVE_MODELO = 'prompt-library:modelo-analise';

export function lerModeloSalvo(): ModeloEscolhido {
  try {
    const v = localStorage.getItem(CHAVE_MODELO);
    return v === 'opus' || v === 'sonnet' || v === 'haiku' ? v : null;
  } catch {
    return null;
  }
}

export function salvarModelo(modelo: ModeloEscolhido): void {
  try {
    if (modelo === null) localStorage.removeItem(CHAVE_MODELO);
    else localStorage.setItem(CHAVE_MODELO, modelo);
  } catch {
    // Sem localStorage (modo privado): fica só nesta sessão.
  }
}
