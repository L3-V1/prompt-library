import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { Origem } from '../../src/core/index.js';
import { novoId } from '../../src/core/ids.js';

/**
 * Captura em andamento, guardada entre `extract`, `context` e `write` (decisão 32): o texto
 * nunca passa pelo Claude nem por argumentos de linha de comando.
 */
export interface Captura {
  texto: string;
  origem: Origem;
  imagens: number;
  colagens: number;
  /** Hash de cada parecido no momento do `context`, para detectar conflito no `write`. */
  parecidos: { id: string; hash: string }[];
}

export const DIR_CAPTURAS_PADRAO = path.join(os.tmpdir(), 'prompt-library-capturas');

const VALIDADE_MS = 24 * 60 * 60 * 1000;
const ID_CAPTURA = /^[0-9a-z]{12}$/;

function caminhoDe(dir: string, id: string): string {
  if (!ID_CAPTURA.test(id)) throw new Error(`Id de Captura inválido: ${id}`);
  return path.join(dir, `${id}.json`);
}

export async function salvarCaptura(dir: string, captura: Captura): Promise<string> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const id = novoId();
  await fs.writeFile(caminhoDe(dir, id), JSON.stringify(captura), { mode: 0o600, flag: 'wx' });
  return id;
}

export async function lerCaptura(dir: string, id: string): Promise<Captura> {
  try {
    return JSON.parse(await fs.readFile(caminhoDe(dir, id), 'utf8')) as Captura;
  } catch (erro) {
    if ((erro as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Captura ${id} não encontrada (pode ter expirado); rode o /save de novo.`, {
        cause: erro,
      });
    }
    throw erro;
  }
}

export async function atualizarCaptura(dir: string, id: string, captura: Captura): Promise<void> {
  await fs.writeFile(caminhoDe(dir, id), JSON.stringify(captura), { mode: 0o600 });
}

export async function apagarCaptura(dir: string, id: string): Promise<void> {
  await fs.rm(caminhoDe(dir, id), { force: true });
}

/** Apaga as Capturas com mais de 24 h. */
export async function limparCapturasAntigas(dir: string, agora = Date.now()): Promise<void> {
  let nomes: string[];
  try {
    nomes = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const nome of nomes) {
    if (!nome.endsWith('.json')) continue;
    const caminho = path.join(dir, nome);
    try {
      const { mtimeMs } = await fs.stat(caminho);
      if (agora - mtimeMs > VALIDADE_MS) await fs.rm(caminho, { force: true });
    } catch {
      // apagada por outro processo
    }
  }
}
