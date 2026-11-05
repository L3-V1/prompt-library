import { useSyncExternalStore } from 'react';

import type { AtividadeClaude } from '../../core/index';

/**
 * O que o Claude está fazendo em cada geração em andamento, vindo do evento SSE `atividade`
 * (decisão 129). Só em memória: quem abre a página no meio vê a partir do próximo `tool_use`.
 */
const atividades = new Map<string, AtividadeClaude>();
const ouvintes = new Set<() => void>();

function avisar(): void {
  for (const ouvinte of ouvintes) ouvinte();
}

/** Grava a atividade do Prompt; `null` apaga (geração começando ou terminada). */
export function guardarAtividade(promptId: string, atividade: AtividadeClaude | null): void {
  if (atividade) atividades.set(promptId, atividade);
  else if (!atividades.delete(promptId)) return;
  avisar();
}

/** Esquece todas (o SSE reconectou e eventos podem ter se perdido). */
export function limparAtividades(): void {
  if (atividades.size === 0) return;
  atividades.clear();
  avisar();
}

export function lerAtividade(promptId: string): AtividadeClaude | null {
  return atividades.get(promptId) ?? null;
}

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export function useAtividade(promptId: string): AtividadeClaude | null {
  return useSyncExternalStore(assinar, () => lerAtividade(promptId));
}
