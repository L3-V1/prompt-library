import { describe, expect, it } from 'vitest';

import {
  acaoInstalarComando,
  acaoRemoverComando,
  comandoNosso,
  esperarApp,
} from './servico-comando.mjs';

const origem = '/home/u/prompt-library/scripts/prompt-library.mjs';

describe('acaoInstalarComando', () => {
  it('nada no lugar: cria', () => {
    expect(acaoInstalarComando({ existente: null, origem })).toBe('criar');
  });

  it('link já apontando para cá: nada', () => {
    expect(acaoInstalarComando({ existente: { tipo: 'link', alvo: origem }, origem })).toBe('nada');
  });

  it('link nosso de outro clone: refaz', () => {
    const alvo = '/home/u/antigo/prompt-library/scripts/prompt-library.mjs';
    expect(acaoInstalarComando({ existente: { tipo: 'link', alvo }, origem })).toBe('refazer');
  });

  it('link alheio: conflito', () => {
    const alvo = '/usr/lib/outro/bin/prompt-library';
    expect(acaoInstalarComando({ existente: { tipo: 'link', alvo }, origem })).toBe('conflito');
  });

  it('arquivo comum: conflito', () => {
    expect(acaoInstalarComando({ existente: { tipo: 'outro' }, origem })).toBe('conflito');
  });
});

describe('acaoRemoverComando', () => {
  it('nada no lugar: ausente', () => {
    expect(acaoRemoverComando({ existente: null })).toBe('ausente');
  });

  it('link nosso: apaga', () => {
    expect(acaoRemoverComando({ existente: { tipo: 'link', alvo: origem } })).toBe('apagar');
  });

  it('link alheio ou arquivo: alheio', () => {
    expect(acaoRemoverComando({ existente: { tipo: 'link', alvo: '/opt/x/prompt-library' } })).toBe(
      'alheio',
    );
    expect(acaoRemoverComando({ existente: { tipo: 'outro' } })).toBe('alheio');
  });
});

describe('comandoNosso', () => {
  it('exige o caminho inteiro scripts/prompt-library.mjs', () => {
    expect(comandoNosso(origem)).toBe(true);
    expect(comandoNosso('/x/meus-scripts/prompt-library.mjs')).toBe(false);
    expect(comandoNosso('/x/scripts/prompt-library.mjs.bak')).toBe(false);
  });
});

/** Relógio falso: `dormir` só avança o tempo. */
function relogio() {
  let agora = 0;
  const sonos: number[] = [];
  return {
    agora: () => agora,
    dormir: (ms: number) => {
      sonos.push(ms);
      agora += ms;
      return Promise.resolve();
    },
    sonos,
  };
}

describe('esperarApp', () => {
  it('responde de cara: não dorme', async () => {
    const r = relogio();
    let consultas = 0;
    const ok = await esperarApp({ ...r, consultar: () => (consultas++, true) });
    expect(ok).toBe(true);
    expect(consultas).toBe(1);
    expect(r.sonos).toEqual([]);
  });

  it('responde na 3ª consulta', async () => {
    const r = relogio();
    let consultas = 0;
    const ok = await esperarApp({ ...r, consultar: () => ++consultas === 3 });
    expect(ok).toBe(true);
    expect(consultas).toBe(3);
    expect(r.sonos).toEqual([250, 250]);
  });

  it('nunca responde: false perto de 40 consultas, sem passar do limite', async () => {
    const r = relogio();
    let consultas = 0;
    const ok = await esperarApp({ ...r, consultar: () => (consultas++, false) });
    expect(ok).toBe(false);
    expect(consultas).toBe(41);
    expect(r.agora()).toBe(10_000);
  });
});
