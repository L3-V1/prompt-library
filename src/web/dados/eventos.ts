import { useEffect } from 'react';
import type { QueryKey } from '@tanstack/react-query';

import type { Mudancas } from './cliente';
import { chaves, clienteConsultas } from './consultas';

/** Eventos do SSE em `/api/eventos` (decisão 68), sem o `ping`. */
export type EventoServidor =
  { tipo: 'acervo'; dados: Mudancas } | { tipo: 'diretrizes'; dados: { hash: string | null } };

/** Queries a invalidar para um evento (prefixos de chave). */
export function chavesParaInvalidar(evento: EventoServidor): QueryKey[] {
  if (evento.tipo === 'diretrizes') return [chaves.diretrizes];
  const chavesAcervo: QueryKey[] = [['prompts'], chaves.colecoes, chaves.tags];
  const ids = new Set([...evento.dados.alterados, ...evento.dados.removidos]);
  for (const id of ids) {
    chavesAcervo.push(chaves.prompt(id), chaves.versoes(id), ['diff', id]);
  }
  return chavesAcervo;
}

/** `reconectado`: o SSE caiu e voltou, e eventos podem ter se perdido. */
export type EventoLocal = EventoServidor | { tipo: 'reconectado' };

type Ouvinte = (evento: EventoLocal) => void;
const ouvintes = new Set<Ouvinte>();

/** Ouve os eventos do servidor (o Prompt e as Diretrizes abertos reagem por aqui). */
export function ouvirEventos(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function emitir(evento: EventoServidor): void {
  for (const chave of chavesParaInvalidar(evento)) {
    void clienteConsultas.invalidateQueries({ queryKey: chave });
  }
  for (const ouvinte of ouvintes) ouvinte(evento);
}

/** Mantém o `EventSource` aberto enquanto o app está montado. */
export function useEventos(): void {
  useEffect(() => {
    const fonte = new EventSource('/api/eventos');
    let caiu = false;
    const ler = (tipo: EventoServidor['tipo']) => (e: MessageEvent<string>) => {
      try {
        emitir({ tipo, dados: JSON.parse(e.data) } as EventoServidor);
      } catch (erro) {
        console.error('evento SSE inválido:', erro);
      }
    };
    fonte.addEventListener('acervo', ler('acervo'));
    fonte.addEventListener('diretrizes', ler('diretrizes'));
    fonte.addEventListener('error', () => {
      caiu = true;
    });
    fonte.addEventListener('open', () => {
      // Reconectou: eventos podem ter se perdido, então tudo fica obsoleto.
      if (caiu) {
        void clienteConsultas.invalidateQueries();
        for (const ouvinte of ouvintes) ouvinte({ tipo: 'reconectado' });
      }
      caiu = false;
    });
    return () => fonte.close();
  }, []);
}
