import {
  aceitar as aceitarSugestao,
  AnaliseNaoEncontradaError,
  ConflitoError,
  incorporar,
  recalcular,
  rejeitar as rejeitarSugestao,
  SugestaoIndisponivelError,
  type Acervo,
  type AlvoIncorporacao,
  type Analise,
  type ArmazenamentoAnalises,
  type Diretrizes,
  type ExecucaoAnalise,
  type ModeloClaude,
  type Pastas,
  type Prompt,
} from '../../core/index.js';
import { ErroHttp } from '../erros.js';
import type { Eventos } from '../eventos.js';
import {
  esquemaSaida,
  ExecucaoClaudeError,
  TIMEOUT_PADRAO_MS,
  type ExecutorClaude,
} from './claude.js';
import { montarPrompt } from './prompt.js';

export const MENSAGEM_INTERROMPIDA = 'A execução foi interrompida (servidor reiniciado).';

export interface OpcoesAnalise {
  instrucao?: string;
  modelo?: ModeloClaude | null;
}

interface Job {
  controlador: AbortController;
}

export interface DepsServicoAnalise {
  acervo: Pick<Acervo, 'ler' | 'salvar'>;
  diretrizes: Pick<Diretrizes, 'ler'>;
  armazenamento: ArmazenamentoAnalises;
  eventos: Pick<Eventos, 'emitir'>;
  executor: ExecutorClaude;
  pastas: Pick<Pastas, 'prompts'>;
  timeoutMs?: number;
  agora?: () => Date;
}

function mensagemDe(erro: unknown): string {
  if (erro instanceof ExecucaoClaudeError) return erro.message;
  if (erro instanceof Error) return `Falha na Análise: ${erro.message}`;
  return `Falha na Análise: ${String(erro)}`;
}

/**
 * A Análise de cada Prompt (decisões 13 a 18): cria, roda o Claude em segundo plano, aplica as
 * decisões do usuário e conclui numa Versão `analise`. As escritas de um Prompt (rotas e fim de
 * job) passam por uma fila própria, então nunca se intercalam.
 */
export function criarServicoAnalise(deps: DepsServicoAnalise) {
  const { acervo, diretrizes, armazenamento, eventos, executor, pastas } = deps;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_PADRAO_MS;
  const agora = () => (deps.agora ?? (() => new Date()))().toISOString();

  const filas = new Map<string, Promise<unknown>>();
  const jobs = new Map<string, Job>();

  /** Executa `fn` depois das operações já enfileiradas para o Prompt. */
  function naFila<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const anterior = filas.get(id) ?? Promise.resolve();
    const atual = anterior.then(fn);
    const cauda = atual.catch(() => undefined);
    filas.set(id, cauda);
    void cauda.then(() => {
      if (filas.get(id) === cauda) filas.delete(id);
    });
    return atual;
  }

  function emitir(promptId: string, analise: Analise | null): void {
    eventos.emitir({ tipo: 'analise', dados: { promptId, analise } });
  }

  async function gravar(analise: Analise): Promise<Analise> {
    const nova = { ...analise, atualizadaEm: agora() };
    await armazenamento.gravar(nova);
    emitir(nova.promptId, nova);
    return nova;
  }

  /** Lê a Análise; uma `execucao` sem job vivo é de antes de um reinício e vira erro. */
  async function lerInterno(id: string): Promise<Analise | null> {
    const analise = await armazenamento.ler(id);
    if (analise?.execucao && !jobs.has(id)) {
      return gravar({ ...analise, execucao: null, erro: MENSAGEM_INTERROMPIDA });
    }
    return analise;
  }

  async function exigir(id: string): Promise<Analise> {
    const analise = await lerInterno(id);
    if (!analise) throw new AnaliseNaoEncontradaError(id);
    return analise;
  }

  function exigirParada(id: string): void {
    if (jobs.has(id)) {
      throw new ErroHttp(
        409,
        'analise_em_execucao',
        'Já há uma geração de Sugestões em andamento. Aguarde ou cancele.',
      );
    }
  }

  /** Dispara o Claude em segundo plano; o resultado entra pela fila, se o job ainda valer. */
  function disparar(analise: Analise, alvo: AlvoIncorporacao): void {
    const id = analise.promptId;
    const job: Job = { controlador: new AbortController() };
    jobs.set(id, job);
    const vale = () => jobs.get(id) === job;

    void (async () => {
      try {
        const [estadoDiretrizes, prompt] = await Promise.all([diretrizes.ler(), acervo.ler(id)]);
        const antiga = alvo === 'tudo' ? undefined : analise.sugestoes.find((s) => s.id === alvo);
        const texto = montarPrompt({
          diretrizes: estadoDiretrizes.conteudo,
          instrucao: analise.instrucao,
          titulo: prompt.titulo,
          caminho: prompt.caminho,
          rascunho: analise.rascunho,
          rejeitadas: analise.sugestoes.filter((s) => s.status === 'rejeitada'),
          ...(antiga ? { alvo: antiga } : {}),
        });
        const resposta = await executor({
          prompt: texto,
          modelo: analise.modelo,
          cwd: pastas.prompts,
          sinal: job.controlador.signal,
          timeoutMs,
        });
        const saida = esquemaSaida.safeParse(resposta.saida);
        if (!saida.success) {
          throw new ExecucaoClaudeError(
            'A resposta do Claude não segue o formato de Sugestões esperado.',
          );
        }
        await naFila(id, async () => {
          if (!vale()) return;
          jobs.delete(id);
          const atual = await armazenamento.ler(id);
          if (!atual) return;
          const r = incorporar(atual, saida.data.sugestoes, alvo);
          await gravar({
            ...r.analise,
            execucao: null,
            erro: null,
            ultimaExecucao: {
              custoUsd: resposta.custoUsd,
              duracaoMs: resposta.duracaoMs,
              modelo: resposta.modelo,
              descartadas: r.descartadas,
            },
          });
        });
      } catch (erro) {
        await naFila(id, async () => {
          if (!vale()) return;
          jobs.delete(id);
          const atual = await armazenamento.ler(id);
          if (!atual) return;
          await gravar({ ...atual, execucao: null, erro: mensagemDe(erro) });
        }).catch((e: unknown) => console.error('erro ao gravar a falha da Análise:', e));
      }
    })();
  }

  function execucao(tipo: ExecucaoAnalise['tipo'], sugestaoId?: string): ExecucaoAnalise {
    return { tipo, ...(sugestaoId ? { sugestaoId } : {}), iniciadaEm: agora() };
  }

  /** A Análise do Prompt, ou `null`. */
  function ler(id: string): Promise<Analise | null> {
    return naFila(id, () => lerInterno(id));
  }

  /** Cria a Análise (Rascunho = corpo atual) e dispara a geração das Sugestões. */
  function iniciar(id: string, opcoes: OpcoesAnalise = {}): Promise<Analise> {
    return naFila(id, async () => {
      if (await lerInterno(id)) {
        throw new ErroHttp(
          409,
          'analise_existente',
          'Este Prompt já tem uma Análise em andamento. Conclua ou descarte antes.',
        );
      }
      const prompt = await acervo.ler(id);
      const momento = agora();
      const analise = await gravar({
        promptId: id,
        baseHash: prompt.hash,
        corpoOriginal: prompt.corpo,
        rascunho: prompt.corpo,
        instrucao: opcoes.instrucao?.trim() ?? '',
        modelo: opcoes.modelo ?? null,
        sugestoes: [],
        execucao: execucao('analise'),
        erro: null,
        criadaEm: momento,
        atualizadaEm: momento,
      });
      disparar(analise, 'tudo');
      return analise;
    });
  }

  /** Gera de novo as Sugestões não decididas, opcionalmente com outra Instrução ou modelo. */
  function regenerar(id: string, opcoes: OpcoesAnalise = {}): Promise<Analise> {
    return naFila(id, async () => {
      const atual = await exigir(id);
      exigirParada(id);
      const analise = await gravar({
        ...atual,
        ...(opcoes.instrucao !== undefined ? { instrucao: opcoes.instrucao.trim() } : {}),
        ...(opcoes.modelo !== undefined ? { modelo: opcoes.modelo } : {}),
        execucao: execucao('analise'),
        erro: null,
      });
      disparar(analise, 'tudo');
      return analise;
    });
  }

  /** Pede ao Claude uma substituta para uma Sugestão pendente ou desatualizada. */
  function regenerarSugestao(id: string, sid: string): Promise<Analise> {
    return naFila(id, async () => {
      const atual = await exigir(id);
      exigirParada(id);
      const s = atual.sugestoes.find((x) => x.id === sid);
      if (!s) throw new SugestaoIndisponivelError(sid, 'Sugestão não encontrada.');
      if (s.status !== 'pendente' && s.status !== 'desatualizada') {
        throw new SugestaoIndisponivelError(sid, 'A Sugestão já foi decidida.');
      }
      const analise = await gravar({ ...atual, execucao: execucao('sugestao', sid), erro: null });
      disparar(analise, sid);
      return analise;
    });
  }

  function alterar(id: string, fn: (a: Analise) => Analise): Promise<Analise> {
    return naFila(id, async () => gravar(fn(await exigir(id))));
  }

  const aceitar = (id: string, sid: string) => alterar(id, (a) => aceitarSugestao(a, sid));
  const rejeitar = (id: string, sid: string) => alterar(id, (a) => rejeitarSugestao(a, sid));
  const salvarRascunho = (id: string, texto: string) =>
    alterar(id, (a) => (a.rascunho === texto ? a : recalcular(a, texto)));

  /** Aborta a geração em andamento, se houver. */
  function cancelar(id: string): Promise<Analise> {
    return naFila(id, async () => {
      const job = jobs.get(id);
      jobs.delete(id);
      job?.controlador.abort();
      // Lê direto: pelo `lerInterno`, a execução sem job viraria "interrompida".
      const atual = await armazenamento.ler(id);
      if (!atual) throw new AnaliseNaoEncontradaError(id);
      return atual.execucao ? gravar({ ...atual, execucao: null }) : atual;
    });
  }

  /**
   * Grava o Rascunho no Prompt como uma Versão `analise` (decisão 15) e apaga a Análise. Com o
   * Prompt alterado fora desde o início, lança `ConflitoError`, a não ser que só os metadados
   * tenham mudado (Favorito, título no Obsidian): aí o corpo é o mesmo e a gravação segue.
   * `baseHash` sobrescreve (o hash do disco, vindo do modal de conflito).
   */
  function concluir(id: string, opcoes: { baseHash?: string } = {}): Promise<Prompt> {
    return naFila(id, async () => {
      const atual = await exigir(id);
      exigirParada(id);
      const salvar = (hash: string) =>
        acervo.salvar(id, { corpo: atual.rascunho }, hash, 'analise');
      let prompt: Prompt;
      try {
        prompt = await salvar(opcoes.baseHash ?? atual.baseHash);
      } catch (erro) {
        if (
          !(erro instanceof ConflitoError) ||
          opcoes.baseHash !== undefined ||
          erro.atual.corpo !== atual.corpoOriginal
        ) {
          throw erro;
        }
        prompt = await salvar(erro.atual.hash);
      }
      await armazenamento.apagar(id);
      emitir(id, null);
      return prompt;
    });
  }

  /** Aborta a geração e apaga a Análise; o Prompt fica intacto. Não lê o arquivo antes. */
  function descartar(id: string): Promise<boolean> {
    const job = jobs.get(id);
    jobs.delete(id);
    job?.controlador.abort();
    return naFila(id, async () => {
      const havia = await armazenamento.apagar(id);
      if (havia) emitir(id, null);
      return havia;
    });
  }

  /** Aborta todos os jobs (ao desligar); as Análises ficam e voltam como interrompidas. */
  function encerrar(): void {
    for (const job of jobs.values()) job.controlador.abort();
    jobs.clear();
  }

  return {
    ler,
    iniciar,
    regenerar,
    regenerarSugestao,
    aceitar,
    rejeitar,
    salvarRascunho,
    cancelar,
    concluir,
    descartar,
    encerrar,
    emExecucao: (id: string) => jobs.has(id),
  };
}

export type ServicoAnalise = ReturnType<typeof criarServicoAnalise>;
