import { Hono } from 'hono';
import { z } from 'zod';

import { PromptNaoEncontradoError, type Prompt } from '../../core/index.js';
import type { Deps } from '../deps.js';
import { comDiffNoConflito } from '../erros.js';
import { resumir } from '../indice.js';
import { semIndefinidos, validar } from '../validacao.js';

const filtros = z.object({
  q: z.string().optional(),
  colecao: z.string().optional(),
  tag: z.string().optional(),
  favorito: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const tags = z.array(z.string());

const novo = z.object({
  titulo: z.string(),
  corpo: z.string(),
  tags: tags.optional(),
  favorito: z.boolean().optional(),
  colecao: z.string().nullable().optional(),
});

const alteracoes = z.object({
  titulo: z.string().optional(),
  tags: tags.optional(),
  corpo: z.string().optional(),
  baseHash: z.string(),
});

export function rotasPrompts({ acervo, indice }: Deps) {
  function obter(id: string): Prompt {
    const prompt = indice.obter(id);
    if (!prompt) throw new PromptNaoEncontradoError(id);
    return prompt;
  }

  /** Executa uma escrita e relê o índice, para a resposta e a próxima leitura verem o novo estado. */
  async function escrever<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } finally {
      await indice.atualizar();
    }
  }

  return new Hono()
    .get('/', validar('query', filtros), (c) => {
      const prompts = indice.listar(semIndefinidos(c.req.valid('query'))).map(resumir);
      return c.json({ prompts, problemas: indice.problemas() });
    })
    .get('/:id', (c) => c.json(obter(c.req.param('id'))))
    .post('/', validar('json', novo), async (c) => {
      const dados = semIndefinidos(c.req.valid('json'));
      const prompt = await escrever(() => acervo.criar(dados));
      return c.json(prompt, 201);
    })
    .put('/:id', validar('json', alteracoes), async (c) => {
      const { baseHash, ...resto } = c.req.valid('json');
      const prompt = await escrever(() =>
        comDiffNoConflito(resto.corpo, () =>
          acervo.salvar(c.req.param('id'), semIndefinidos(resto), baseHash),
        ),
      );
      return c.json(prompt);
    })
    .put(
      '/:id/colecao',
      validar('json', z.object({ colecao: z.string().nullable() })),
      async (c) => {
        const { colecao } = c.req.valid('json');
        return c.json(await escrever(() => acervo.mover(c.req.param('id'), colecao)));
      },
    )
    .put('/:id/favorito', validar('json', z.object({ favorito: z.boolean() })), async (c) => {
      const { favorito } = c.req.valid('json');
      return c.json(await escrever(() => acervo.favoritar(c.req.param('id'), favorito)));
    })
    .delete('/:id', async (c) => {
      await escrever(() => acervo.excluir(c.req.param('id')));
      return c.body(null, 204);
    })
    .get('/:id/copia', (c) => {
      // Decisão 25: só o corpo, verbatim, sem título nem frontmatter.
      c.header('Content-Type', 'text/plain; charset=utf-8');
      return c.body(obter(c.req.param('id')).corpo);
    });
}
