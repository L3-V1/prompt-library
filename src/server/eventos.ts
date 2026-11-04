import type { Mudancas } from './indice.js';

export type Evento =
  { tipo: 'acervo'; dados: Mudancas } | { tipo: 'diretrizes'; dados: { hash: string | null } };

type Ouvinte = (evento: Evento) => void;

/** Hub dos eventos enviados por SSE em `/api/eventos`. */
export function criarEventos() {
  const ouvintes = new Set<Ouvinte>();

  function emitir(evento: Evento): void {
    for (const ouvinte of ouvintes) {
      try {
        ouvinte(evento);
      } catch (erro) {
        console.error('erro num ouvinte de eventos:', erro);
      }
    }
  }

  function assinar(ouvinte: Ouvinte): () => void {
    ouvintes.add(ouvinte);
    return () => ouvintes.delete(ouvinte);
  }

  return { emitir, assinar, total: () => ouvintes.size };
}

export type Eventos = ReturnType<typeof criarEventos>;
