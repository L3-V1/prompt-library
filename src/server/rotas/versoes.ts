import { Hono } from 'hono';
import { z } from 'zod';

import { PromptNaoEncontradoError } from '../../core/index.js';
import type { Deps } from '../deps.js';
import { comDiffNoConflito } from '../erros.js';
import { validar } from '../validacao.js';

/** Versões de um Prompt; montadas em `/api/prompts`. */
export function rotasVersoes({ acervo, indice }: Deps) {
  function exigirPrompt(id: string): void {
    if (!indice.obter(id)) throw new PromptNaoEncontradoError(id);
  }

  return new Hono()
    .get('/:id/versoes', async (c) => {
      const id = c.req.param('id');
      exigirPrompt(id);
      return c.json(await acervo.listarVersoes(id));
    })
    .get('/:id/versoes/:versaoId', async (c) => {
      const { id, versaoId } = c.req.param();
      exigirPrompt(id);
      return c.json(await acervo.lerVersao(id, versaoId));
    })
    .get(
      '/:id/versoes/:versaoId/diff',
      validar('query', z.object({ para: z.string().min(1).default('atual') })),
      async (c) => {
        const { id, versaoId } = c.req.param();
        exigirPrompt(id);
        return c.json(await acervo.diff(id, versaoId, c.req.valid('query').para));
      },
    )
    .post(
      '/:id/versoes/:versaoId/restaurar',
      validar('json', z.object({ baseHash: z.string() })),
      async (c) => {
        const { id, versaoId } = c.req.param();
        const { baseHash } = c.req.valid('json');
        try {
          // Sem corpo no pedido, o 409 vem com diff vazio.
          const prompt = await comDiffNoConflito(undefined, () =>
            acervo.restaurar(id, versaoId, baseHash),
          );
          return c.json(prompt);
        } finally {
          await indice.atualizar();
        }
      },
    );
}
