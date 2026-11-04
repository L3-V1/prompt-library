import { describe, expect, it } from 'vitest';

import { idValido, novoId } from './ids.js';

describe('ids', () => {
  it('gera ids de 12 caracteres [0-9a-z] distintos', () => {
    const ids = new Set(Array.from({ length: 1000 }, novoId));
    expect(ids.size).toBe(1000);
    for (const id of ids) expect(id).toMatch(/^[0-9a-z]{12}$/);
  });

  it('valida ids vindos do frontmatter', () => {
    expect(idValido('k3f9x0a2m7qz')).toBe(true);
    expect(idValido('meu-id_1')).toBe(true);
    expect(idValido('../x')).toBe(false);
    expect(idValido('')).toBe(false);
    expect(idValido(123)).toBe(false);
  });
});
