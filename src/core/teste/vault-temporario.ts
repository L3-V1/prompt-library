import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolverPastas } from '../config.js';
import type { Pastas } from '../tipos.js';

const criados: string[] = [];

export interface VaultTemporario {
  pastas: Pastas;
  /** Caminho absoluto a partir de um caminho relativo ao vault. */
  caminho(relativo: string): string;
  ler(relativo: string): Promise<string>;
  escrever(relativo: string, conteudo: string | Uint8Array): Promise<void>;
  existe(relativo: string): Promise<boolean>;
  /** Todos os arquivos (inclusive ocultos) sob `relativo`, relativos a ele, ordenados. */
  arquivos(relativo?: string): Promise<string[]>;
}

/** Cria um vault em `os.tmpdir()` com os arquivos dados (`{ 'Prompts/x.md': '...' }`). */
export async function criarVaultTemporario(
  arquivos: Record<string, string | Uint8Array> = {},
): Promise<VaultTemporario> {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-library-'));
  criados.push(raiz);
  const caminho = (relativo: string) => path.join(raiz, relativo);
  const vault: VaultTemporario = {
    pastas: resolverPastas({ PROMPT_LIBRARY_VAULT: raiz }),
    caminho,
    ler: (relativo) => fs.readFile(caminho(relativo), 'utf8'),
    async escrever(relativo, conteudo) {
      await fs.mkdir(path.dirname(caminho(relativo)), { recursive: true });
      await fs.writeFile(caminho(relativo), conteudo);
    },
    async existe(relativo) {
      try {
        await fs.access(caminho(relativo));
        return true;
      } catch {
        return false;
      }
    },
    async arquivos(relativo = '') {
      try {
        const nomes = await fs.readdir(caminho(relativo), { recursive: true, withFileTypes: true });
        return nomes
          .filter((d) => d.isFile())
          .map((d) => path.relative(caminho(relativo), path.join(d.parentPath, d.name)))
          .sort();
      } catch {
        return [];
      }
    },
  };
  for (const [relativo, conteudo] of Object.entries(arquivos)) {
    await vault.escrever(relativo, conteudo);
  }
  return vault;
}

/** Remove os vaults criados; chame no `afterEach`. */
export async function limparVaultsTemporarios(): Promise<void> {
  await Promise.all(criados.splice(0).map((r) => fs.rm(r, { recursive: true, force: true })));
}
