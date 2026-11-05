import { Hono } from 'hono';
import { z } from 'zod';

import { PromptNaoEncontradoError, type Analise } from '../../core/index.js';
import type { Deps } from '../deps.js';
import { comDiffNoConflito } from '../erros.js';
import { semIndefinidos, validar } from '../validacao.js';

const modelo = z.enum(['opus', 'sonnet', 'haiku']).nullable();

/** As ações sem dados ainda mandam `{}`: toda escrita exige corpo JSON (decisão 71). */
const vazio = z.object({});

const opcoes = z.object({
  instrucao: z.string().max(10_000).optional(),
  modelo: modelo.optional(),
});

/** Análise de um Prompt (decisões 13 a 18); montada em `/api/prompts`. */
export function rotasAnalise({ analises, indice }: Deps) {
  function exigirPrompt(id: string): void {
    if (!indice.obter(id)) throw new PromptNaoEncontradoError(id);
  }

  return new Hono()
    .get('/:id/analise', async (c) => {
      const id = c.req.param('id');
      exigirPrompt(id);
      const analise: Analise | null = await analises.ler(id);
      return c.json(analise);
    })
    .post('/:id/analise', validar('json', opcoes), async (c) => {
      const id = c.req.param('id');
      exigirPrompt(id);
      return c.json(await analises.iniciar(id, semIndefinidos(c.req.valid('json'))), 202);
    })
    .post('/:id/analise/regenerar', validar('json', opcoes), async (c) => {
      const id = c.req.param('id');
      return c.json(await analises.regenerar(id, semIndefinidos(c.req.valid('json'))), 202);
    })
    .post('/:id/analise/sugestoes/:sid/aceitar', validar('json', vazio), async (c) => {
      const { id, sid } = c.req.param();
      return c.json(await analises.aceitar(id, sid));
    })
    .post('/:id/analise/sugestoes/:sid/rejeitar', validar('json', vazio), async (c) => {
      const { id, sid } = c.req.param();
      return c.json(await analises.rejeitar(id, sid));
    })
    .post('/:id/analise/sugestoes/:sid/regenerar', validar('json', vazio), async (c) => {
      const { id, sid } = c.req.param();
      return c.json(await analises.regenerarSugestao(id, sid), 202);
    })
    .put(
      '/:id/analise/rascunho',
      validar('json', z.object({ rascunho: z.string() })),
      async (c) => {
        const id = c.req.param('id');
        return c.json(await analises.salvarRascunho(id, c.req.valid('json').rascunho));
      },
    )
    .post('/:id/analise/cancelar', validar('json', vazio), async (c) => {
      return c.json(await analises.cancelar(c.req.param('id')));
    })
    .post(
      '/:id/analise/concluir',
      validar('json', z.object({ baseHash: z.string().optional() })),
      async (c) => {
        const id = c.req.param('id');
        const { baseHash } = c.req.valid('json');
        const rascunho = (await analises.ler(id))?.rascunho;
        try {
          const prompt = await comDiffNoConflito(rascunho, () =>
            analises.concluir(id, baseHash === undefined ? {} : { baseHash }),
          );
          return c.json(prompt);
        } finally {
          await indice.atualizar();
        }
      },
    )
    .delete('/:id/analise', async (c) => {
      await analises.descartar(c.req.param('id'));
      return c.body(null, 204);
    });
}
