import { Hono } from 'hono';

import type { Deps } from '../deps.js';

export function rotasTags({ indice }: Deps) {
  return new Hono().get('/', (c) => c.json(indice.tags()));
}
