import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

const producao = process.env['NODE_ENV'] === 'production';
// `dist/web` a partir deste arquivo (`dist/server/main.js`), e não do cwd.
const pastaWeb = fileURLToPath(new URL('../web/', import.meta.url));
const indexWeb = `${pastaWeb}index.html`;
if (producao && !existsSync(indexWeb)) {
  console.error(`Build não encontrado (${indexWeb}): rode \`npm run build\`.`);
  process.exit(1);
}

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

if (producao) {
  app.use('/*', serveStatic({ root: pastaWeb }));
  app.get('*', serveStatic({ path: indexWeb }));
}

const servidor = serve({ fetch: app.fetch, hostname: HOST, port: PORTA }, (info) => {
  console.log(`servidor em http://${info.address}:${info.port} (vault: ${pastas.vault})`);
});
servidor.on('error', (erro: NodeJS.ErrnoException) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(
      `Porta ${PORTA} em uso. O serviço já está rodando? (\`systemctl --user stop prompt-library\`)`,
    );
  } else {
    console.error('erro no servidor:', erro);
  }
  analises.encerrar();
  void observador.fechar().finally(() => process.exit(1));
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
