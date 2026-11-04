import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import { criarAcervo, criarDiretrizes, resolverPastas } from '../core/index.js';
import { criarApp, HOST, PORTA } from './app.js';
import { criarEventos } from './eventos.js';
import { criarIndice } from './indice.js';
import { criarObservador } from './observador.js';

const pastas = resolverPastas();
const acervo = criarAcervo(pastas);
const diretrizes = criarDiretrizes(pastas);
const eventos = criarEventos();
const indice = criarIndice(acervo);
indice.ouvir((mudancas) => eventos.emitir({ tipo: 'acervo', dados: mudancas }));

// O observador cria `Prompts/` se faltar; a primeira leitura vem depois, já com a pasta.
const observador = await criarObservador({ pastas, indice, diretrizes, eventos });
await indice.atualizar();

const app = criarApp({ acervo, indice, diretrizes, eventos });

if (process.env['NODE_ENV'] === 'production') {
  app.use('/*', serveStatic({ root: './dist/web' }));
  app.get('*', serveStatic({ path: './dist/web/index.html' }));
}

const servidor = serve({ fetch: app.fetch, hostname: HOST, port: PORTA }, (info) => {
  console.log(`servidor em http://${info.address}:${info.port} (vault: ${pastas.vault})`);
});

async function desligar() {
  await observador.fechar();
  servidor.close();
  // Conexões SSE abertas seguram o `close`; não há estado a gravar.
  process.exit(0);
}
process.once('SIGINT', () => void desligar());
process.once('SIGTERM', () => void desligar());
