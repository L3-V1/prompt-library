import { diffLines, type Change } from 'diff';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';

import {
  AnaliseInvalidaError,
  AnaliseNaoEncontradaError,
  ColecaoComConflitosError,
  ColecaoInvalidaError,
  ColecaoJaExisteError,
  ColecaoNaoEncontradaError,
  ConflitoError,
  DiretrizesConflitoError,
  PromptNaoEncontradoError,
  SugestaoIndisponivelError,
  VersaoNaoEncontradaError,
  type EstadoDiretrizes,
  type Prompt,
} from '../core/index.js';

// Mensagens de validação do zod em pt-BR.
z.config(z.locales.ptBR());

/** Corpo de toda resposta de erro da API. */
export interface CorpoErro {
  erro: string;
  codigo: string;
}

/** Corpo do 409 de conflito: o estado no disco e o diff do texto enviado contra ele. */
export interface CorpoConflito extends CorpoErro {
  codigo: 'conflito';
  atual: Prompt | EstadoDiretrizes;
  diff: Change[];
}

/** Corpo do 409 da exclusão de Coleção com conflitos (decisão 124). */
export type CorpoColecaoComConflitos = CorpoErro & {
  codigo: 'colecao_com_conflitos';
  titulos: string[];
};

/** Erro com status e código próprios, lançado pelas rotas e middlewares. */
export class ErroHttp extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** Conflito já acompanhado do diff entre o texto enviado e o do disco. */
export class ConflitoComDiff extends Error {
  constructor(
    readonly causa: ConflitoError | DiretrizesConflitoError,
    readonly diff: Change[],
  ) {
    super(causa.message);
  }
}

/**
 * Executa `fn` e, se ela lançar conflito, anexa `diffLines(enviado, texto no disco)`.
 * Sem texto enviado, o diff fica vazio.
 */
export async function comDiffNoConflito<T>(
  enviado: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (erro) {
    if (erro instanceof ConflitoError || erro instanceof DiretrizesConflitoError) {
      const noDisco = erro instanceof ConflitoError ? erro.atual.corpo : erro.atual.conteudo;
      throw new ConflitoComDiff(erro, enviado === undefined ? [] : diffLines(enviado, noDisco));
    }
    throw erro;
  }
}

/** Mensagem única a partir dos problemas de validação do zod. */
export function mensagemDeValidacao(erro: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): string {
  return erro.issues
    .map((i) => (i.path.length > 0 ? `${i.path.map(String).join('.')}: ${i.message}` : i.message))
    .join('; ');
}

function conflito(c: Context, erro: ConflitoError | DiretrizesConflitoError, diff: Change[]) {
  const corpo: CorpoConflito = { erro: erro.message, codigo: 'conflito', atual: erro.atual, diff };
  return c.json(corpo, 409);
}

function resposta(c: Context, status: ContentfulStatusCode, codigo: string, erro: string) {
  const corpo: CorpoErro = { erro, codigo };
  return c.json(corpo, status);
}

export const tratarErro: ErrorHandler = (erro, c) => {
  if (erro instanceof ConflitoComDiff) return conflito(c, erro.causa, erro.diff);
  if (erro instanceof ConflitoError || erro instanceof DiretrizesConflitoError) {
    return conflito(c, erro, []);
  }
  if (erro instanceof ErroHttp) return resposta(c, erro.status, erro.codigo, erro.message);
  if (erro instanceof PromptNaoEncontradoError) {
    return resposta(c, 404, 'prompt_nao_encontrado', erro.message);
  }
  if (erro instanceof VersaoNaoEncontradaError) {
    return resposta(c, 404, 'versao_nao_encontrada', erro.message);
  }
  if (erro instanceof ColecaoNaoEncontradaError) {
    return resposta(c, 404, 'colecao_nao_encontrada', erro.message);
  }
  if (erro instanceof ColecaoInvalidaError) {
    return resposta(c, 400, 'colecao_invalida', erro.message);
  }
  if (erro instanceof ColecaoJaExisteError) {
    return resposta(c, 409, 'colecao_ja_existe', erro.message);
  }
  if (erro instanceof ColecaoComConflitosError) {
    const corpo: CorpoColecaoComConflitos = {
      erro: erro.message,
      codigo: 'colecao_com_conflitos',
      titulos: erro.titulos,
    };
    return c.json(corpo, 409);
  }
  if (erro instanceof AnaliseNaoEncontradaError) {
    return resposta(c, 404, 'analise_nao_encontrada', erro.message);
  }
  if (erro instanceof SugestaoIndisponivelError) {
    return resposta(c, 409, 'sugestao_indisponivel', erro.message);
  }
  if (erro instanceof AnaliseInvalidaError) {
    return resposta(c, 409, 'analise_invalida', erro.message);
  }
  if (erro instanceof HTTPException) {
    // Lançada pelo validador do Hono, por exemplo com JSON malformado.
    const mensagem =
      erro.status === 400 ? 'Requisição inválida: corpo JSON malformado.' : erro.message;
    return resposta(c, erro.status, 'requisicao_invalida', mensagem);
  }
  console.error(erro);
  return resposta(c, 500, 'erro_interno', 'Erro interno do servidor.');
};

export const rotaNaoEncontrada: NotFoundHandler = (c) =>
  resposta(c, 404, 'rota_nao_encontrada', `Rota não encontrada: ${c.req.method} ${c.req.path}`);
