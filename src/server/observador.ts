import fs from 'node:fs/promises';
import path from 'node:path';

import { watch } from 'chokidar';

import type { Diretrizes, Pastas } from '../core/index.js';
import type { Eventos } from './eventos.js';
import type { Indice } from './indice.js';

export const ESPERA_RELEITURA_MS = 150;

export interface DepsObservador {
  pastas: Pastas;
  indice: Pick<Indice, 'atualizar'>;
  diretrizes: Pick<Diretrizes, 'ler'>;
  eventos: Pick<Eventos, 'emitir'>;
}

/**
 * Observa `Prompts/` e relê o índice quando um `.md` ou uma pasta muda (com debounce).
 * Ignora qualquer segmento que comece com `.` (`.versoes`, `.analises`, temporários).
 * Mudanças em `_Diretrizes.md` geram o evento `diretrizes`.
 */
export async function criarObservador({ pastas, indice, diretrizes, eventos }: DepsObservador) {
  await fs.mkdir(pastas.prompts, { recursive: true });

  const ignorado = (absoluto: string) => {
    const relativo = path.relative(pastas.prompts, absoluto);
    if (relativo === '' || relativo.startsWith('..')) return false;
    return relativo.split(path.sep).some((s) => s.startsWith('.'));
  };

  let hashDiretrizes = (await diretrizes.ler()).hash;
  let timer: NodeJS.Timeout | undefined;
  let fechado = false;

  function agendarReleitura() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (fechado) return;
      indice.atualizar().catch((erro: unknown) => console.error('erro ao reler o acervo:', erro));
    }, ESPERA_RELEITURA_MS);
  }

  async function verificarDiretrizes() {
    const { hash } = await diretrizes.ler();
    if (fechado || hash === hashDiretrizes) return;
    hashDiretrizes = hash;
    eventos.emitir({ tipo: 'diretrizes', dados: { hash } });
  }

  const watcher = watch(pastas.prompts, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 100 },
    ignored: ignorado,
  });

  watcher.on('all', (evento, absoluto) => {
    if (absoluto === pastas.diretrizes) {
      verificarDiretrizes().catch((erro: unknown) =>
        console.error('erro ao ler as Diretrizes:', erro),
      );
      return;
    }
    const pasta = evento === 'addDir' || evento === 'unlinkDir';
    if (pasta || absoluto.endsWith('.md')) agendarReleitura();
  });
  watcher.on('error', (erro) => console.error('erro no watcher:', erro));

  await new Promise<void>((resolve) => watcher.once('ready', () => resolve()));

  async function fechar(): Promise<void> {
    fechado = true;
    clearTimeout(timer);
    await watcher.close();
  }

  return { fechar };
}

export type Observador = Awaited<ReturnType<typeof criarObservador>>;
