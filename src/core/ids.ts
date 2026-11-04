import { customAlphabet } from 'nanoid';

const ALFABETO = '0123456789abcdefghijklmnopqrstuvwxyz';

/** Id de Prompt: 12 caracteres `[0-9a-z]`, seguro como nome de pasta. */
export const novoId: () => string = customAlphabet(ALFABETO, 12);

/**
 * Ids aceitos vindos do frontmatter. O id vira nome de pasta em `.versoes/`, então
 * qualquer coisa fora deste formato é tratada como id ausente.
 */
const ID_VALIDO = /^[A-Za-z0-9_-]{1,64}$/;

export function idValido(id: unknown): id is string {
  return typeof id === 'string' && ID_VALIDO.test(id);
}
