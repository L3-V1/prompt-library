import type { EstadoDiretrizes, Prompt } from './tipos.js';

/** O arquivo mudou no disco desde a leitura em que a edição se baseou (decisões 9 e 10). */
export class ConflitoError extends Error {
  override name = 'ConflitoError';
  readonly hashNoDisco: string;
  /** Estado atual do Prompt no disco. */
  readonly atual: Prompt;

  constructor(atual: Prompt) {
    super(`O Prompt "${atual.titulo}" foi alterado fora do app desde a última leitura.`);
    this.hashNoDisco = atual.hash;
    this.atual = atual;
  }
}

export class PromptNaoEncontradoError extends Error {
  override name = 'PromptNaoEncontradoError';
  constructor(readonly id: string) {
    super(`Prompt não encontrado: ${id}`);
  }
}

export class VersaoNaoEncontradaError extends Error {
  override name = 'VersaoNaoEncontradaError';
  constructor(
    readonly promptId: string,
    readonly versaoId: string,
  ) {
    super(`Versão não encontrada: ${versaoId} (Prompt ${promptId})`);
  }
}

export class ColecaoInvalidaError extends Error {
  override name = 'ColecaoInvalidaError';
  constructor(readonly nome: string) {
    super(`Nome de Coleção inválido: "${nome}"`);
  }
}

export class ColecaoJaExisteError extends Error {
  override name = 'ColecaoJaExisteError';
  constructor(readonly nome: string) {
    super(`Já existe uma Coleção chamada "${nome}"`);
  }
}

export class ColecaoNaoEncontradaError extends Error {
  override name = 'ColecaoNaoEncontradaError';
  constructor(readonly nome: string) {
    super(`Coleção não encontrada: "${nome}"`);
  }
}

/** Frontmatter com YAML inválido ou que não é um mapa. */
export class FrontmatterInvalidoError extends Error {
  override name = 'FrontmatterInvalidoError';
}

/** `_Diretrizes.md` mudou no disco desde a leitura em que a edição se baseou. */
export class DiretrizesConflitoError extends Error {
  override name = 'DiretrizesConflitoError';
  constructor(readonly atual: EstadoDiretrizes) {
    super('As Diretrizes foram alteradas fora do app desde a última leitura.');
  }
}
