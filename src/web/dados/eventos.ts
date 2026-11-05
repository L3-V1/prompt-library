import { useEffect } from 'react';
import type { QueryKey } from '@tanstack/react-query';

import type { AtividadeClaude } from '../../core/index';
import { guardarAnalise, type AnaliseOuNada } from './analise';
import { guardarAtividade, limparAtividades } from './atividade';
import type { Mudancas, Prompt } from './cliente';
import { chaves, clienteConsultas } from './consultas';

/** Eventos do SSE em `/api/eventos` (decisão 68), sem o `ping`. */
export type EventoServidor =
  | { tipo: 'acervo'; dados: Mudancas }
  | { tipo: 'diretrizes'; dados: { hash: string | null } }
  | { tipo: 'analise'; dados: { promptId: string; analise: AnaliseOuNada } }
  | { tipo: 'atividade'; dados: { promptId: string; atividade: AtividadeClaude | null } };

/**
 * Queries a invalidar para um evento (prefixos de chave). A Análise não é invalidada: o evento
 * já traz o estado novo, gravado direto no cache (com o conjunto das abertas). A atividade fica
 * num store à parte.
 */
export function chavesParaInvalidar(evento: EventoServidor): QueryKey[] {
  if (evento.tipo === 'diretrizes') return [chaves.diretrizes];
  if (evento.tipo === 'analise' || evento.tipo === 'atividade') return [];
  const chavesAcervo: QueryKey[] = [['prompts'], chaves.colecoes, chaves.tags];
  const ids = new Set([...evento.dados.alterados, ...evento.dados.removidos]);
  for (const id of ids) {
    chavesAcervo.push(chaves.prompt(id), chaves.versoes(id), ['diff', id]);
  }
  return chavesAcervo;
}

/**
 * `reconectado`: o SSE caiu e voltou, e eventos podem ter se perdido. `gravado`: esta aba
 * gravou o Prompt fora do painel dele (ao soltar na Coleção), com o estado novo já em mãos.
 */
export type EventoLocal =
  EventoServidor | { tipo: 'reconectado' } | { tipo: 'gravado'; dados: Prompt };

type Ouvinte = (evento: EventoLocal) => void;
const ouvintes = new Set<Ouvinte>();

/** Ouve os eventos do servidor (o Prompt e as Diretrizes abertos reagem por aqui). */
export function ouvirEventos(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/** Avisa os ouvintes que esta aba gravou o Prompt (o painel aberto troca a base na hora). */
export function avisarGravado(prompt: Prompt): void {
  for (const ouvinte of ouvintes) ouvinte({ tipo: 'gravado', dados: prompt });
}

/** Aplica um evento do servidor ao cache e avisa os ouvintes. */
export function emitir(evento: EventoServidor): void {
  if (evento.tipo === 'analise') {
    guardarAnalise(evento.dados.promptId, evento.dados.analise);
    // Geração terminada (ou Análise fechada): a linha de atividade some.
    if (!evento.dados.analise?.execucao) guardarAtividade(evento.dados.promptId, null);
  }
  if (evento.tipo === 'atividade') guardarAtividade(evento.dados.promptId, evento.dados.atividade);
  for (const chave of chavesParaInvalidar(evento)) {
    void clienteConsultas.invalidateQueries({ queryKey: chave });
  }
  for (const ouvinte of ouvintes) ouvinte(evento);
}

/** O servidor manda `ping` a cada 15 s; sem nada por este tempo, a conexão é tida como morta. */
export const SILENCIO_MAXIMO_MS = 25_000;
const ESPERA_RECONEXAO_MS = 1_000;

/**
 * Mantém o `EventSource` aberto enquanto o app está montado. Além da reconexão automática do
 * navegador, recria a conexão quando ela fecha de vez (o navegador desiste se a reconexão
 * recebe um erro HTTP, como o 502 do proxy do Vite com o servidor reiniciando) ou quando fica
 * muda além de `SILENCIO_MAXIMO_MS`.
 */
export function useEventos(): void {
  useEffect(() => {
    let fonte: EventSource | null = null;
    let caiu = false;
    let vigia: ReturnType<typeof setTimeout> | undefined;
    let reconexao: ReturnType<typeof setTimeout> | undefined;

    const reconectar = () => {
      caiu = true;
      fonte?.close();
      clearTimeout(vigia);
      clearTimeout(reconexao);
      reconexao = setTimeout(conectar, ESPERA_RECONEXAO_MS);
    };
    const vivo = () => {
      clearTimeout(vigia);
      vigia = setTimeout(reconectar, SILENCIO_MAXIMO_MS);
    };
    const ler = (tipo: EventoServidor['tipo']) => (e: MessageEvent<string>) => {
      vivo();
      try {
        emitir({ tipo, dados: JSON.parse(e.data) } as EventoServidor);
      } catch (erro) {
        console.error('evento SSE inválido:', erro);
      }
    };

    function conectar() {
      const atual = new EventSource('/api/eventos');
      fonte = atual;
      atual.addEventListener('acervo', ler('acervo'));
      atual.addEventListener('diretrizes', ler('diretrizes'));
      atual.addEventListener('analise', ler('analise'));
      atual.addEventListener('atividade', ler('atividade'));
      atual.addEventListener('ping', vivo);
      atual.addEventListener('error', () => {
        caiu = true;
        if (atual.readyState === EventSource.CLOSED) reconectar();
      });
      atual.addEventListener('open', () => {
        vivo();
        // Reconectou: eventos podem ter se perdido, então tudo fica obsoleto.
        if (caiu) {
          limparAtividades();
          void clienteConsultas.invalidateQueries();
          for (const ouvinte of ouvintes) ouvinte({ tipo: 'reconectado' });
        }
        caiu = false;
      });
    }

    conectar();
    return () => {
      clearTimeout(vigia);
      clearTimeout(reconexao);
      fonte?.close();
    };
  }, []);
}
