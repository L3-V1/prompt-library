export { criarArmazenamentoAnalises, type ArmazenamentoAnalises } from './analise/armazenamento.js';
export {
  aceitar,
  incorporar,
  inferirEdicao,
  localizar,
  recalcular,
  rejeitar,
  type AlvoIncorporacao,
  type Edicao,
} from './analise/regras.js';
export { criarAcervo, type Acervo, type AlteracoesPrompt, type NovoPrompt } from './acervo.js';
export { resolverPastas, VAULT_PADRAO } from './config.js';
export { criarDiretrizes, type Diretrizes } from './diretrizes.js';
export {
  AnaliseInvalidaError,
  AnaliseNaoEncontradaError,
  ColecaoComConflitosError,
  ColecaoInvalidaError,
  ColecaoJaExisteError,
  ColecaoNaoEncontradaError,
  ConflitoError,
  DiretrizesConflitoError,
  FrontmatterInvalidoError,
  PromptNaoEncontradoError,
  SugestaoIndisponivelError,
  VersaoNaoEncontradaError,
} from './erros.js';
export { nomeSeguro } from './arquivos.js';
export { normalizar } from './texto.js';
export type { Change } from 'diff';
export {
  MOTIVOS_VERSAO,
  type Analise,
  type EstadoDiretrizes,
  type ExecucaoAnalise,
  type ModeloClaude,
  type MotivoVersao,
  type Origem,
  type Pastas,
  type PreviaExclusao,
  type Problema,
  type Prompt,
  type ResultadoListagem,
  type StatusSugestao,
  type Sugestao,
  type SugestaoGerada,
  type UltimaExecucao,
  type Versao,
  type VersaoComConteudo,
} from './tipos.js';
