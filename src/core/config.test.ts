import { describe, expect, it } from 'vitest';

import { resolverPastas, VAULT_PADRAO } from './config.js';

describe('resolverPastas', () => {
  it('usa PROMPT_LIBRARY_VAULT', () => {
    expect(resolverPastas({ PROMPT_LIBRARY_VAULT: '/tmp/v' })).toEqual({
      vault: '/tmp/v',
      prompts: '/tmp/v/Prompts',
      versoes: '/tmp/v/Prompts/.versoes',
      lixeira: '/tmp/v/.trash',
    });
  });

  it('cai no vault padrão', () => {
    expect(resolverPastas({}).vault).toBe(VAULT_PADRAO);
    expect(resolverPastas({ PROMPT_LIBRARY_VAULT: '' }).vault).toBe(VAULT_PADRAO);
  });
});
