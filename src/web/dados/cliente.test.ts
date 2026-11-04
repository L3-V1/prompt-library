import { describe, expect, it } from 'vitest';

import { ConflitoApi, ErroApi, pedir } from './cliente';

const json = (corpo: unknown, status: number) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('pedir', () => {
  it('200 devolve o JSON', async () => {
    await expect(pedir(json({ ok: true }, 200))).resolves.toEqual({ ok: true });
  });

  it('204 devolve undefined', async () => {
    await expect(pedir(new Response(null, { status: 204 }))).resolves.toBeUndefined();
  });

  it('409 de conflito lança ConflitoApi com atual e diff', async () => {
    const atual = { conteudo: 'disco', hash: 'h2' };
    const diff = [{ value: 'meu\n', removed: true, added: false, count: 1 }];
    const erro = await pedir(
      json({ erro: 'O arquivo mudou no disco.', codigo: 'conflito', atual, diff }, 409),
    ).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflitoApi);
    expect(erro).toMatchObject({ message: 'O arquivo mudou no disco.', atual, diff });
  });

  it('409 de outro código é ErroApi', async () => {
    const erro = await pedir(json({ erro: 'Já existe.', codigo: 'colecao_ja_existe' }, 409)).catch(
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).not.toBeInstanceOf(ConflitoApi);
  });

  it('404 lança ErroApi com a mensagem do servidor', async () => {
    const erro = await pedir(
      json({ erro: 'Prompt não encontrado: x', codigo: 'prompt_nao_encontrado' }, 404),
    ).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroApi);
    expect(erro).toMatchObject({
      status: 404,
      codigo: 'prompt_nao_encontrado',
      message: 'Prompt não encontrado: x',
    });
  });

  it('400 de validação', async () => {
    const erro = await pedir(json({ erro: 'nome: obrigatório', codigo: 'validacao' }, 400)).catch(
      (e: unknown) => e,
    );
    expect(erro).toMatchObject({ status: 400, codigo: 'validacao', message: 'nome: obrigatório' });
  });

  it('erro sem corpo JSON tem mensagem genérica', async () => {
    const erro = await pedir(new Response('falhou', { status: 502 })).catch((e: unknown) => e);
    expect(erro).toMatchObject({ status: 502, codigo: 'desconhecido' });
    expect((erro as Error).message).toContain('502');
  });
});
