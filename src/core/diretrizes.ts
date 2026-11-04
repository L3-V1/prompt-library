import fs from 'node:fs/promises';
import path from 'node:path';

import { gravarAtomico, hashDe } from './arquivos.js';
import { DiretrizesConflitoError } from './erros.js';
import type { EstadoDiretrizes, Pastas } from './tipos.js';

/** Leitura e gravação de `Prompts/_Diretrizes.md`, com detecção de conflito por hash. Sem Versões. */
export function criarDiretrizes(pastas: Pastas) {
  async function ler(): Promise<EstadoDiretrizes> {
    let bytes: Buffer;
    try {
      bytes = await fs.readFile(pastas.diretrizes);
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return { conteudo: '', hash: null };
      throw erro;
    }
    return { conteudo: bytes.toString('utf8'), hash: hashDe(bytes) };
  }

  /**
   * Grava o conteúdo, desde que o arquivo no disco ainda tenha o hash `baseHash`
   * (`null` = o arquivo não existia). Senão, lança `DiretrizesConflitoError`.
   */
  async function salvar(conteudo: string, baseHash: string | null): Promise<EstadoDiretrizes> {
    const atual = await ler();
    if (atual.hash !== baseHash) throw new DiretrizesConflitoError(atual);
    if (atual.conteudo === conteudo && atual.hash !== null) return atual;
    await fs.mkdir(path.dirname(pastas.diretrizes), { recursive: true });
    await gravarAtomico(pastas.diretrizes, conteudo);
    return { conteudo, hash: hashDe(conteudo) };
  }

  return { ler, salvar };
}

export type Diretrizes = ReturnType<typeof criarDiretrizes>;
