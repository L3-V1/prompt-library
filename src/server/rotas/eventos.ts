import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import type { Deps } from '../deps.js';
import type { Evento } from '../eventos.js';

export const INTERVALO_PING_MS = 30_000;

export function rotasEventos({ eventos }: Deps) {
  return new Hono().get('/', (c) =>
    streamSSE(c, async (stream) => {
      const enviar = (evento: string, dados: unknown) =>
        stream.writeSSE({ event: evento, data: JSON.stringify(dados) }).catch(() => undefined);

      const cancelar = eventos.assinar((e: Evento) => void enviar(e.tipo, e.dados));
      const ping = setInterval(() => void enviar('ping', {}), INTERVALO_PING_MS);
      const fim = new Promise<void>((resolve) => stream.onAbort(resolve));
      try {
        await enviar('ping', {});
        await fim;
      } finally {
        clearInterval(ping);
        cancelar();
      }
    }),
  );
}
