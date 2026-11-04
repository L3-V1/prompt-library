import { describe, expect, it } from 'vitest';

import * as core from './index.js';

describe('core', () => {
  it('carrega o módulo', () => {
    expect(core).toBeDefined();
  });
});
