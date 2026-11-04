import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';

import { ErroHttp, mensagemDeValidacao } from './erros.js';

/** `zValidator` que responde 400 `{ erro, codigo: 'validacao' }` com a mensagem em pt-BR. */
export function validar<Alvo extends keyof ValidationTargets, Esquema extends z.ZodType>(
  alvo: Alvo,
  esquema: Esquema,
) {
  return zValidator(alvo, esquema, (resultado) => {
    if (!resultado.success) {
      throw new ErroHttp(400, 'validacao', mensagemDeValidacao(resultado.error));
    }
  });
}

type ChavesObrigatorias<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T];
type ChavesOpcionais<T> = Exclude<keyof T, ChavesObrigatorias<T>>;

/** Tipo com as chaves `undefined` tornadas opcionais (para `exactOptionalPropertyTypes`). */
export type SemIndefinidos<T> = { [K in ChavesObrigatorias<T>]: T[K] } & {
  [K in ChavesOpcionais<T>]?: Exclude<T[K], undefined>;
};

/** Remove as chaves com valor `undefined` (saída do zod para campos opcionais). */
export function semIndefinidos<T extends object>(objeto: T): SemIndefinidos<T> {
  return Object.fromEntries(
    Object.entries(objeto).filter(([, v]) => v !== undefined),
  ) as SemIndefinidos<T>;
}
