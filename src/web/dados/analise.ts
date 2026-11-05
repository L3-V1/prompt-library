import { useQuery } from '@tanstack/react-query';
import type { InferResponseType } from 'hono/client';

import type { ModeloEscolhido } from '../analise-ui';
import { api, pedir, type Prompt } from './cliente';
import { chaves, clienteConsultas, guardar } from './consultas';

const rotas = api.api.prompts[':id'].analise;

/** A Análise como chega pela API (`null` = o Prompt não tem Análise). */
export type AnaliseOuNada = InferResponseType<typeof rotas.$get>;
export type Analise = NonNullable<AnaliseOuNada>;
export type Sugestao = Analise['sugestoes'][number];

/**
 * Grava a Análise no cache. Uma Análise mais antiga que a do cache (evento SSE atrasado em
 * relação à resposta de uma ação) é ignorada.
 */
export function guardarAnalise(id: string, analise: AnaliseOuNada): AnaliseOuNada {
  const atual = clienteConsultas.getQueryData<AnaliseOuNada>(chaves.analise(id));
  if (
    analise &&
    atual &&
    atual.criadaEm === analise.criadaEm &&
    atual.atualizadaEm > analise.atualizadaEm
  ) {
    return atual;
  }
  clienteConsultas.setQueryData(chaves.analise(id), analise);
  return analise;
}

export const lerAnalise = (id: string): Promise<AnaliseOuNada> =>
  pedir(rotas.$get({ param: { id } }));

export function useAnalise(id: string) {
  return useQuery({ queryKey: chaves.analise(id), queryFn: () => lerAnalise(id) });
}

export interface OpcoesAnalise {
  instrucao: string;
  modelo: ModeloEscolhido;
}

async function com(id: string, resposta: Parameters<typeof pedir<Analise>>[0]): Promise<Analise> {
  return guardarAnalise(id, await pedir(resposta)) as Analise;
}

export const iniciarAnalise = (id: string, opcoes: OpcoesAnalise) =>
  com(id, rotas.$post({ param: { id }, json: opcoes }));

export const regenerarAnalise = (id: string, opcoes?: OpcoesAnalise) =>
  com(id, rotas.regenerar.$post({ param: { id }, json: opcoes ?? {} }));

export const aceitarSugestao = (id: string, sid: string) =>
  com(id, rotas.sugestoes[':sid'].aceitar.$post({ param: { id, sid }, json: {} }));

export const rejeitarSugestao = (id: string, sid: string) =>
  com(id, rotas.sugestoes[':sid'].rejeitar.$post({ param: { id, sid }, json: {} }));

export const regenerarSugestao = (id: string, sid: string) =>
  com(id, rotas.sugestoes[':sid'].regenerar.$post({ param: { id, sid }, json: {} }));

export const salvarRascunhoAnalise = (id: string, rascunho: string) =>
  com(id, rotas.rascunho.$put({ param: { id }, json: { rascunho } }));

export const cancelarAnalise = (id: string) =>
  com(id, rotas.cancelar.$post({ param: { id }, json: {} }));

/** Grava o Rascunho no Prompt (Versão `analise`); `baseHash` sobrescreve depois de um conflito. */
export async function concluirAnalise(id: string, baseHash?: string): Promise<Prompt> {
  const prompt = await pedir(
    rotas.concluir.$post({ param: { id }, json: baseHash === undefined ? {} : { baseHash } }),
  );
  guardarAnalise(id, null);
  return guardar(prompt);
}

export async function descartarAnalise(id: string): Promise<void> {
  await pedir(rotas.$delete({ param: { id } }));
  guardarAnalise(id, null);
}
