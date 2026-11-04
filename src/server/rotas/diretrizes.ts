import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from '../deps.js';
import { comDiffNoConflito } from '../erros.js';
import { validar } from '../validacao.js';

const edicao = z.object({ conteudo: z.string(), baseHash: z.string().nullable() });

export function rotasDiretrizes({ diretrizes }: Deps) {
  return new Hono()
    .get('/', async (c) => c.json(await diretrizes.ler()))
    .put('/', validar('json', edicao), async (c) => {
      const { conteudo, baseHash } = c.req.valid('json');
      return c.json(await comDiffNoConflito(conteudo, () => diretrizes.salvar(conteudo, baseHash)));
    });
}
