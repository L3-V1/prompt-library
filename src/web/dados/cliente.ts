import { hc, type InferResponseType } from 'hono/client';

import type {
  Change,
  EstadoDiretrizes,
  MotivoVersao,
  PreviaExclusao,
  Versao,
} from '../../core/index';
import type { AppType } from '../../server/app';
import type { CorpoConflito } from '../../server/erros';
import type { Mudancas, TotalColecao, TotalTag } from '../../server/indice';

export const api = hc<AppType>('/');

/** O Prompt como chega pela API (o tipo do `hc`, com `origem` opcional). */
export type Prompt = InferResponseType<(typeof api.api.prompts)[':id']['$get']>;
export type Listagem = InferResponseType<typeof api.api.prompts.$get>;
export type Resumo = Listagem['prompts'][number];
export type {
  Change,
  EstadoDiretrizes,
  MotivoVersao,
  Mudancas,
  PreviaExclusao,
  TotalColecao,
  TotalTag,
  Versao,
};

/** Erro da API, com a mensagem pt-BR do servidor em `message`. */
export class ErroApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }
}

/** O 409 de conflito (decisão 10): o estado no disco e o diff do texto enviado contra ele. */
export class ConflitoApi<A = CorpoConflito['atual']> extends Error {
  constructor(
    mensagem: string,
    readonly atual: A,
    readonly diff: Change[],
  ) {
    super(mensagem);
    this.name = 'ConflitoApi';
  }
}

interface Resposta<T> {
  ok: boolean;
  status: number;
  json(): Promise<T>;
}

function ehObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

async function lancarErro(res: Resposta<unknown>): Promise<never> {
  let corpo: unknown = null;
  try {
    corpo = await res.json();
  } catch {
    // Corpo vazio ou não JSON: fica a mensagem genérica.
  }
  const erro = ehObjeto(corpo) && typeof corpo['erro'] === 'string' ? corpo['erro'] : null;
  const codigo = ehObjeto(corpo) && typeof corpo['codigo'] === 'string' ? corpo['codigo'] : null;
  if (res.status === 409 && codigo === 'conflito' && ehObjeto(corpo)) {
    const diff = Array.isArray(corpo['diff']) ? (corpo['diff'] as Change[]) : [];
    throw new ConflitoApi(erro ?? 'Conflito', corpo['atual'] as CorpoConflito['atual'], diff);
  }
  throw new ErroApi(
    res.status,
    codigo ?? 'desconhecido',
    erro ?? `Falha na comunicação com o servidor (HTTP ${res.status}).`,
  );
}

/**
 * Devolve o JSON quando a resposta é `ok` (e `undefined` no 204). No 409 de conflito lança
 * `ConflitoApi`; nos outros erros, `ErroApi` com a mensagem do servidor.
 */
export async function pedir<T>(resposta: Resposta<T> | Promise<Resposta<T>>): Promise<T> {
  const res = await resposta;
  if (!res.ok) return lancarErro(res);
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Como `pedir`, para respostas em texto (a cópia). */
export async function pedirTexto(
  resposta:
    | (Resposta<unknown> & { text(): Promise<string> })
    | Promise<Resposta<unknown> & { text(): Promise<string> }>,
): Promise<string> {
  const res = await resposta;
  if (!res.ok) return lancarErro(res);
  return res.text();
}

/** Mensagem para o usuário a partir de qualquer erro. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof ErroApi || erro instanceof ConflitoApi) return erro.message;
  if (erro instanceof TypeError) return 'Sem conexão com o servidor.';
  return erro instanceof Error ? erro.message : String(erro);
}
