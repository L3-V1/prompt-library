import path from 'node:path';

import type { Pastas } from './tipos.js';

export const VAULT_PADRAO = '/home/levi/Documentos/vault';

/** Resolve as pastas do vault a partir de `PROMPT_LIBRARY_VAULT` (padrão: o vault do usuário). */
export function resolverPastas(env: NodeJS.ProcessEnv = process.env): Pastas {
  const vault = path.resolve(env['PROMPT_LIBRARY_VAULT'] || VAULT_PADRAO);
  const prompts = path.join(vault, 'Prompts');
  return {
    vault,
    prompts,
    versoes: path.join(prompts, '.versoes'),
    lixeira: path.join(vault, '.trash'),
  };
}
