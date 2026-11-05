// O comando `prompt-library` (symlink em `~/.local/bin`) e a espera pelo app. Funções puras,
// testáveis; quem mexe no disco e na rede é `scripts/servico.mjs` e `scripts/prompt-library.mjs`.
import path from 'node:path';

/** O script do comando, relativo ao repositório. */
export const ORIGEM_COMANDO = path.join('scripts', 'prompt-library.mjs');

export const LIMITE_ESPERA_MS = 10_000;
export const INTERVALO_ESPERA_MS = 250;

/** Se o symlink aponta para um `scripts/prompt-library.mjs` (deste ou de outro clone). */
export function comandoNosso(alvo) {
  return path.resolve(alvo).endsWith(path.sep + ORIGEM_COMANDO);
}

/**
 * O que fazer no `instalar`. `existente` é `null` (nada no lugar), `{ tipo: 'link', alvo }`
 * (alvo já resolvido) ou `{ tipo: 'outro' }` (arquivo, diretório...).
 * @returns {'criar' | 'nada' | 'refazer' | 'conflito'}
 */
export function acaoInstalarComando({ existente, origem }) {
  if (existente === null) return 'criar';
  if (existente.tipo === 'link') {
    if (existente.alvo === origem) return 'nada';
    if (comandoNosso(existente.alvo)) return 'refazer';
  }
  return 'conflito';
}

/**
 * O que fazer no `remover`: só apaga o symlink que é nosso.
 * @returns {'ausente' | 'apagar' | 'alheio'}
 */
export function acaoRemoverComando({ existente }) {
  if (existente === null) return 'ausente';
  if (existente.tipo === 'link' && comandoNosso(existente.alvo)) return 'apagar';
  return 'alheio';
}

/**
 * Consulta até `consultar()` dar `true` ou passar `limiteMs` desde a primeira consulta.
 * Relógio (`agora`), sono (`dormir`) e consulta são injetados.
 */
export async function esperarApp({
  consultar,
  agora,
  dormir,
  limiteMs = LIMITE_ESPERA_MS,
  intervaloMs = INTERVALO_ESPERA_MS,
}) {
  const inicio = agora();
  if (await consultar()) return true;
  while (agora() - inicio < limiteMs) {
    await dormir(Math.min(intervaloMs, limiteMs - (agora() - inicio)));
    if (await consultar()) return true;
  }
  return false;
}
