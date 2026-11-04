import { Hono } from 'hono';
import { z } from 'zod';

import type { Deps } from '../deps.js';
import { validar } from '../validacao.js';

export function rotasColecoes({ acervo, indice }: Deps) {
  return new Hono()
    .get('/', (c) => c.json(indice.colecoes()))
    .post('/', validar('json', z.object({ nome: z.string() })), async (c) => {
      const nome = await acervo.criarColecao(c.req.valid('json').nome);
      await indice.atualizar();
      return c.json({ nome }, 201);
    })
    .put('/:nome', validar('json', z.object({ novoNome: z.string() })), async (c) => {
      const nome = await acervo.renomearColecao(c.req.param('nome'), c.req.valid('json').novoNome);
      await indice.atualizar();
      return c.json({ nome });
    });
}
