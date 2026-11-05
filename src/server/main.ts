import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

import {
  criarAcervo,
  criarArmazenamentoAnalises,
  criarDiretrizes,
  resolverPastas,
} from '../core/index.js';
import { criarExecutorClaude } from './analise/claude.js';
import { criarServicoAnalise } from './analise/servico.js';
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

const analises = criarServicoAnalise({
  acervo,
  diretrizes,
  armazenamento: criarArmazenamentoAnalises(pastas),
  eventos,
  executor: criarExecutorClaude({ binario: process.env['PROMPT_LIBRARY_CLAUDE'] || 'claude' }),
  pastas,
});

const app = criarApp({ acervo, indice, diretrizes, eventos, analises });

if (process.env['NODE_ENV'] === 'production') {
  app.use('/*', serveStatic({ root: './dist/web' }));
  app.get('*', serveStatic({ path: './dist/web/index.html' }));
}

const servidor = serve({ fetch: app.fetch, hostname: HOST, port: PORTA }, (info) => {
  console.log(`servidor em http://${info.address}:${info.port} (vault: ${pastas.vault})`);
});

async function desligar() {
  // Mata os `claude` em andamento; as Análises voltam como interrompidas na próxima partida.
  analises.encerrar();
  await observador.fechar();
  servidor.close();
  // Conexões SSE abertas seguram o `close`; não há estado a gravar.
  process.exit(0);
}
process.once('SIGINT', () => void desligar());
process.once('SIGTERM', () => void desligar());
