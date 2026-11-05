import { QueryClient, useQuery, type QueryKey } from '@tanstack/react-query';

import type { ConteudoPrompt } from '../edicao';
import type { Navegacao } from '../navegacao';
import { api, ErroApi, pedir, pedirTexto, type Prompt } from './cliente';
import type { Change, EstadoDiretrizes, Listagem, TotalColecao, TotalTag, Versao } from './cliente';

/** Os filtros da lista a partir da navegação. */
export function filtrosDe(nav: Navegacao): FiltrosLista {
  const filtros: FiltrosLista = {};
  if (nav.q) filtros.q = nav.q;
  if (nav.colecao !== undefined) filtros.colecao = nav.colecao;
  if (nav.tag) filtros.tag = nav.tag;
  if (nav.favoritos) filtros.favorito = true;
  return filtros;
}

export interface FiltrosLista {
  q?: string;
  /** `null` = "Sem coleção". */
  colecao?: string | null;
  tag?: string;
  favorito?: boolean;
}

export const chaves = {
  prompts: (filtros: FiltrosLista) => ['prompts', filtros] as const,
  prompt: (id: string) => ['prompt', id] as const,
  colecoes: ['colecoes'] as const,
  tags: ['tags'] as const,
  versoes: (id: string) => ['versoes', id] as const,
  diff: (id: string, versaoId: string, para: string) => ['diff', id, versaoId, para] as const,
  diretrizes: ['diretrizes'] as const,
  analise: (id: string) => ['analise', id] as const,
  analises: ['analises'] as const,
} satisfies Record<string, QueryKey | ((...args: never[]) => QueryKey)>;

export const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      // O SSE é quem invalida; sem refetch por tempo nem por foco.
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: (tentativas, erro) =>
        !(erro instanceof ErroApi && erro.status < 500) && tentativas < 2,
    },
  },
});

// --- Leituras ---

function buscarPrompts(filtros: FiltrosLista): Promise<Listagem> {
  const query: { q?: string; colecao?: string; tag?: string; favorito?: 'true' | 'false' } = {};
  if (filtros.q) query.q = filtros.q;
  if (filtros.colecao !== undefined) query.colecao = filtros.colecao ?? '';
  if (filtros.tag) query.tag = filtros.tag;
  if (filtros.favorito) query.favorito = 'true';
  return pedir(api.api.prompts.$get({ query }));
}

export function usePrompts(filtros: FiltrosLista) {
  return useQuery({
    queryKey: chaves.prompts(filtros),
    queryFn: () => buscarPrompts(filtros),
    placeholderData: (anterior) => anterior,
  });
}

export const lerPrompt = (id: string): Promise<Prompt> =>
  pedir(api.api.prompts[':id'].$get({ param: { id } }));

export function usePrompt(id: string) {
  return useQuery({ queryKey: chaves.prompt(id), queryFn: () => lerPrompt(id) });
}

/** Busca o Prompt de novo, ignorando o cache; `null` se foi removido. */
export async function relerPrompt(id: string): Promise<Prompt | null> {
  try {
    return await clienteConsultas.fetchQuery({
      queryKey: chaves.prompt(id),
      queryFn: () => lerPrompt(id),
      staleTime: 0,
    });
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 404) return null;
    throw erro;
  }
}

export function useColecoes() {
  return useQuery({
    queryKey: chaves.colecoes,
    queryFn: (): Promise<TotalColecao[]> => pedir(api.api.colecoes.$get()),
  });
}

export function useTags() {
  return useQuery({
    queryKey: chaves.tags,
    queryFn: (): Promise<TotalTag[]> => pedir(api.api.tags.$get()),
  });
}

export function useVersoes(id: string) {
  return useQuery({
    queryKey: chaves.versoes(id),
    queryFn: (): Promise<Versao[]> => pedir(api.api.prompts[':id'].versoes.$get({ param: { id } })),
  });
}

export function useDiff(id: string, versaoId: string | null, para: string) {
  return useQuery({
    queryKey: chaves.diff(id, versaoId ?? '', para),
    queryFn: (): Promise<Change[]> =>
      pedir(
        api.api.prompts[':id'].versoes[':versaoId'].diff.$get({
          param: { id, versaoId: versaoId ?? '' },
          query: { para },
        }),
      ),
    enabled: versaoId !== null,
    placeholderData: (anterior) => anterior,
  });
}

export const lerDiretrizes = (): Promise<EstadoDiretrizes> => pedir(api.api.diretrizes.$get());

export function useDiretrizes() {
  return useQuery({ queryKey: chaves.diretrizes, queryFn: lerDiretrizes });
}

/** Copia o corpo salvo do Prompt (decisão 25) para a área de transferência. */
export async function copiarPrompt(id: string): Promise<void> {
  const texto = await pedirTexto(api.api.prompts[':id'].copia.$get({ param: { id } }));
  await navigator.clipboard.writeText(texto);
}

// --- Escritas ---
// Cada escrita atualiza o cache do próprio Prompt; o resto é invalidado pelo evento SSE.

export function guardar(prompt: Prompt): Prompt {
  clienteConsultas.setQueryData(chaves.prompt(prompt.id), prompt);
  return prompt;
}

export async function criarPrompt(dados: {
  titulo: string;
  colecao: string | null;
}): Promise<Prompt> {
  return guardar(await pedir(api.api.prompts.$post({ json: { ...dados, corpo: '' } })));
}

export async function salvarPrompt(
  id: string,
  alteracoes: Partial<ConteudoPrompt>,
  baseHash: string,
): Promise<Prompt> {
  return guardar(
    await pedir(api.api.prompts[':id'].$put({ param: { id }, json: { ...alteracoes, baseHash } })),
  );
}

export async function favoritarPrompt(id: string, favorito: boolean): Promise<Prompt> {
  return guardar(
    await pedir(api.api.prompts[':id'].favorito.$put({ param: { id }, json: { favorito } })),
  );
}

export async function moverPrompt(id: string, colecao: string | null): Promise<Prompt> {
  return guardar(
    await pedir(api.api.prompts[':id'].colecao.$put({ param: { id }, json: { colecao } })),
  );
}

export async function excluirPrompt(id: string): Promise<void> {
  await pedir(api.api.prompts[':id'].$delete({ param: { id } }));
  clienteConsultas.removeQueries({ queryKey: chaves.prompt(id) });
}

export async function restaurarVersao(
  id: string,
  versaoId: string,
  baseHash: string,
): Promise<Prompt> {
  return guardar(
    await pedir(
      api.api.prompts[':id'].versoes[':versaoId'].restaurar.$post({
        param: { id, versaoId },
        json: { baseHash },
      }),
    ),
  );
}

export async function criarColecao(nome: string): Promise<string> {
  const res = await pedir(api.api.colecoes.$post({ json: { nome } }));
  await clienteConsultas.invalidateQueries({ queryKey: chaves.colecoes });
  return res.nome;
}

export async function renomearColecao(nome: string, novoNome: string): Promise<string> {
  const res = await pedir(api.api.colecoes[':nome'].$put({ param: { nome }, json: { novoNome } }));
  await clienteConsultas.invalidateQueries({ queryKey: chaves.colecoes });
  return res.nome;
}

export async function salvarDiretrizes(
  conteudo: string,
  baseHash: string | null,
): Promise<EstadoDiretrizes> {
  const estado = await pedir(api.api.diretrizes.$put({ json: { conteudo, baseHash } }));
  clienteConsultas.setQueryData(chaves.diretrizes, estado);
  return estado;
}

/** O item seguinte (ou o anterior, se era o último) na lista em cache para os filtros. */
export function vizinhoNaLista(filtros: FiltrosLista, id: string): string | undefined {
  const lista = clienteConsultas.getQueryData<Listagem>(chaves.prompts(filtros))?.prompts ?? [];
  const i = lista.findIndex((p) => p.id === id);
  if (i < 0) return undefined;
  return (lista[i + 1] ?? lista[i - 1])?.id;
}
