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

/** Os ids com Análise aberta, depois de `promptId` ganhar (`aberta`) ou perder a sua. */
export function abertasCom(ids: string[], promptId: string, aberta: boolean): string[] {
  if (ids.includes(promptId) === aberta) return ids;
  return aberta ? [...ids, promptId].sort() : ids.filter((id) => id !== promptId);
}

/**
 * Grava a Análise no cache e acerta o conjunto das abertas (indicador na lista). Uma Análise mais antiga que a do cache (evento SSE atrasado em
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
  // Sem a lista no cache (ainda não buscada), nada a acertar.
  clienteConsultas.setQueryData<string[]>(chaves.analises, (ids) =>
    ids === undefined ? ids : abertasCom(ids, id, analise !== null),
  );
  return analise;
}

export const lerAnalise = (id: string): Promise<AnaliseOuNada> =>
  pedir(rotas.$get({ param: { id } }));

export function useAnalise(id: string) {
  return useQuery({ queryKey: chaves.analise(id), queryFn: () => lerAnalise(id) });
}

/** Os ids dos Prompts com Análise aberta; o SSE `analise` mantém o conjunto em dia. */
export function useAnalisesAbertas() {
  return useQuery({
    queryKey: chaves.analises,
    queryFn: async (): Promise<string[]> => (await pedir(api.api.analises.$get())).ids,
  });
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
