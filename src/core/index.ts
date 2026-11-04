export { criarAcervo, type Acervo, type AlteracoesPrompt, type NovoPrompt } from './acervo.js';
export { resolverPastas, VAULT_PADRAO } from './config.js';
export { criarDiretrizes, type Diretrizes } from './diretrizes.js';
export {
  ColecaoInvalidaError,
  ColecaoJaExisteError,
  ColecaoNaoEncontradaError,
  ConflitoError,
  DiretrizesConflitoError,
  FrontmatterInvalidoError,
  PromptNaoEncontradoError,
  VersaoNaoEncontradaError,
} from './erros.js';
export { nomeSeguro } from './arquivos.js';
export { normalizar } from './texto.js';
export type { Change } from 'diff';
export {
  MOTIVOS_VERSAO,
  type EstadoDiretrizes,
  type MotivoVersao,
  type Origem,
  type Pastas,
  type Problema,
  type Prompt,
  type ResultadoListagem,
  type Versao,
  type VersaoComConteudo,
} from './tipos.js';
