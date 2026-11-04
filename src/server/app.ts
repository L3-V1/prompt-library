import { Hono, type MiddlewareHandler } from 'hono';

import type { Deps } from './deps.js';
import { ErroHttp, rotaNaoEncontrada, tratarErro } from './erros.js';
import { rotasColecoes } from './rotas/colecoes.js';
import { rotasDiretrizes } from './rotas/diretrizes.js';
import { rotasEventos } from './rotas/eventos.js';
import { rotasPrompts } from './rotas/prompts.js';
import { rotasTags } from './rotas/tags.js';
import { rotasVersoes } from './rotas/versoes.js';

export type { Deps } from './deps.js';

// Decisão 23: escuta apenas em loopback, sem autenticação.
export const HOST = '127.0.0.1';
export const PORTA = 5174;
/** Porta do Vite em desenvolvimento, que repassa `/api` para cá. */
export const PORTA_WEB = 5173;

const HOSTS_ACEITOS = new Set(
  ['127.0.0.1', 'localhost'].flatMap((h) => [PORTA, PORTA_WEB].map((p) => `${h}:${p}`)),
);
const ORIGENS_ACEITAS = new Set([...HOSTS_ACEITOS].map((h) => `http://${h}`));
const METODOS_COM_CORPO = new Set(['POST', 'PUT', 'PATCH']);
const METODOS_DE_ESCRITA = new Set([...METODOS_COM_CORPO, 'DELETE']);

/**
 * Protege a API em loopback: recusa `Host` fora de 127.0.0.1/localhost nas portas do app
 * (DNS rebinding) e, nas escritas, `Origin` de outra página e corpo que não seja JSON (CSRF).
 */
export const protegerLoopback: MiddlewareHandler = async (c, next) => {
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  if (!HOSTS_ACEITOS.has(host.toLowerCase())) {
    throw new ErroHttp(403, 'host_recusado', `Host não permitido: ${host}`);
  }
  if (METODOS_DE_ESCRITA.has(c.req.method)) {
    const origem = c.req.header('origin');
    if (origem !== undefined && !ORIGENS_ACEITAS.has(origem.toLowerCase())) {
      throw new ErroHttp(403, 'origem_recusada', `Origem não permitida: ${origem}`);
    }
    const tamanho = c.req.header('content-length');
    const temCorpo =
      METODOS_COM_CORPO.has(c.req.method) ||
      (tamanho !== undefined && Number(tamanho) > 0) ||
      c.req.header('transfer-encoding') !== undefined;
    const tipo = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
    if (temCorpo && tipo !== 'application/json') {
      throw new ErroHttp(
        415,
        'tipo_de_conteudo',
        'O corpo da requisição precisa ser JSON (application/json).',
      );
    }
  }
  await next();
};

/** Monta a API sem tocar na rede (testável com `app.request()`). */
export function criarApp(deps: Deps) {
  return new Hono()
    .onError(tratarErro)
    .notFound(rotaNaoEncontrada)
    .use('*', protegerLoopback)
    .get('/api/health', (c) => c.json({ ok: true }))
    .route('/api/prompts', rotasPrompts(deps))
    .route('/api/prompts', rotasVersoes(deps))
    .route('/api/colecoes', rotasColecoes(deps))
    .route('/api/tags', rotasTags(deps))
    .route('/api/diretrizes', rotasDiretrizes(deps))
    .route('/api/eventos', rotasEventos(deps));
}

/** Tipo da API para o cliente `hc` do Hono (M4). */
export type AppType = ReturnType<typeof criarApp>;
