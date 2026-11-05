import { diffLines } from 'diff';
import { useCallback, useEffect, useRef, useState } from 'react';

import { localizar } from '../../core/analise/regras';
import { pedirCopia } from '../copia';
import { concluirAnalise, useAnalise, type Sugestao } from '../dados/analise';
import { ConflitoApi, ErroApi, mensagemDeErro, type Prompt } from '../dados/cliente';
import {
  excluirPrompt,
  favoritarPrompt,
  filtrosDe,
  relerPrompt,
  restaurarVersao,
  salvarPrompt,
  useColecoes,
  usePrompt,
  useTags,
  vizinhoNaLista,
} from '../dados/consultas';
import { ouvirEventos } from '../dados/eventos';
import {
  alteracoes,
  aposSalvar,
  iniciar,
  pendente,
  reagirAMudancaExterna,
  rebasear,
  type EstadoEdicao,
  type Reacao,
} from '../edicao';
import { abrirPrompt, fecharPainel, navegacaoAtual, registrarProtecao } from '../navegacao';
import { moverParaColecao } from '../mover';
import { useRascunhoAnalise } from '../rascunho-analise';
import { SEM_COLECAO, TECLA_MOD } from '../textos';
import { CampoTags } from './CampoTags';
import { Confirmacao } from './Confirmacao';
import { Editor, type Destaque } from './Editor';
import { EstadoVazio } from './EstadoVazio';
import { Icone } from './Icone';
import { ModalConflito, type DadosConflito } from './ModalConflito';
import { PainelAnalise } from './PainelAnalise';
import { PainelVersoes } from './PainelVersoes';
import { toast } from './Toaster';

type Estado = EstadoEdicao<Prompt>;

interface Conflito extends DadosConflito {
  atual: Prompt;
  /** O que repetir ao sobrescrever. */
  origem: { tipo: 'salvar' } | { tipo: 'restaurar'; versaoId: string };
}

/** Botão "voltar" das telas estreitas (< 768px), onde aparece um painel por vez. */
export function BotaoVoltar() {
  return (
    <button
      type="button"
      className="botao-icone md:hidden"
      aria-label="Voltar para a lista"
      onClick={() => fecharPainel()}
    >
      <Icone nome="voltar" />
    </button>
  );
}

/** Painel 3: carrega o Prompt e entrega ao editor. */
export function PainelPrompt({ id }: { id: string }) {
  const consulta = usePrompt(id);
  if (consulta.data) return <EdicaoPrompt key={id} inicial={consulta.data} />;
  if (consulta.isError) {
    const naoExiste = consulta.error instanceof ErroApi && consulta.error.status === 404;
    return (
      <div className="flex h-full flex-col">
        <div className="p-3 md:hidden">
          <BotaoVoltar />
        </div>
        <EstadoVazio icone="alerta" titulo={naoExiste ? 'Prompt não encontrado' : 'Erro ao abrir'}>
          <p>
            {naoExiste
              ? 'Ele pode ter sido excluído ou movido para fora do vault.'
              : mensagemDeErro(consulta.error)}
          </p>
        </EstadoVazio>
      </div>
    );
  }
  return <div className="coluna-folha py-6 text-sm text-suave">Carregando…</div>;
}

function EdicaoPrompt({ inicial }: { inicial: Prompt }) {
  const id = inicial.id;
  const [estado, setEstadoReact] = useState<Estado>(() => iniciar(inicial));
  const estadoRef = useRef(estado);
  const atualizar = useCallback((novo: Estado) => {
    estadoRef.current = novo;
    setEstadoReact(novo);
  }, []);

  const [aviso, setAviso] = useState<Prompt | null>(null);
  const [removido, setRemovido] = useState(false);
  const [conflito, setConflito] = useState<Conflito | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [favoritoOtimista, setFavoritoOtimista] = useState<boolean | null>(null);
  const [versoesAbertas, setVersoesAbertas] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const colecoes = useColecoes();
  const tags = useTags();

  const { base, rascunho } = estado;
  const temPendencias = pendente(estado);

  // --- Análise (M5): com uma aberta, o editor mostra o Rascunho dela ---
  const consultaAnalise = useAnalise(id);
  const analise = consultaAnalise.data ?? null;
  const emAnalise = analise !== null;
  const rascunhoAnalise = useRascunhoAnalise(id, analise);
  const [painelAnalise, setPainelAnalise] = useState(false);
  const [sugestaoDestacada, setSugestaoDestacada] = useState<Sugestao | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const concluindoRef = useRef(false);
  const [conflitoAnalise, setConflitoAnalise] = useState<
    (DadosConflito & { atual: Prompt }) | null
  >(null);
  // A Análise acabou (concluída ou descartada, aqui ou em outra aba): o painel fecha.
  const [tinhaAnalise, setTinhaAnalise] = useState(emAnalise);
  if (tinhaAnalise !== emAnalise) {
    setTinhaAnalise(emAnalise);
    if (!emAnalise) {
      setPainelAnalise(false);
      setSugestaoDestacada(null);
    }
  }

  /** Aplica a reação a uma versão do Prompt vinda do servidor. */
  const aplicar = useCallback(
    (reacao: Reacao<Estado, Prompt>) => {
      switch (reacao.acao) {
        case 'ignorar':
          if (reacao.estado !== estadoRef.current) atualizar(reacao.estado);
          return;
        case 'recarregar':
          atualizar(reacao.estado);
          setAviso(null);
          toast.info('Atualizado fora do app');
          return;
        case 'avisar':
          setAviso(reacao.novo);
          return;
        case 'removido':
          setRemovido(true);
      }
    },
    [atualizar],
  );

  // Mudanças no disco (Obsidian, Captura, outra aba), avisadas pelo SSE.
  useEffect(
    () =>
      ouvirEventos((evento) => {
        if (evento.tipo === 'diretrizes' || evento.tipo === 'analise') return;
        // Gravado por esta aba fora do painel: o estado novo já veio na resposta.
        if (evento.tipo === 'gravado') {
          if (evento.dados.id === id)
            aplicar(reagirAMudancaExterna(estadoRef.current, evento.dados));
          return;
        }
        if (
          evento.tipo === 'acervo' &&
          !evento.dados.alterados.includes(id) &&
          !evento.dados.removidos.includes(id)
        ) {
          return;
        }
        // Concluir a Análise grava o Prompt; quem atualiza a tela é a resposta.
        if (concluindoRef.current) return;
        relerPrompt(id).then(
          (novo) => {
            if (!concluindoRef.current) aplicar(reagirAMudancaExterna(estadoRef.current, novo));
          },
          () => undefined,
        );
      }),
    [id, aplicar],
  );

  const salvandoRef = useRef(false);
  const salvar = useCallback(async (): Promise<boolean> => {
    if (salvandoRef.current) return false;
    const atual = estadoRef.current;
    const mudou = alteracoes(atual);
    if (!mudou) return true;
    const enviado = atual.rascunho;
    salvandoRef.current = true;
    setSalvando(true);
    try {
      const novo = await salvarPrompt(id, mudou, atual.base.hash);
      atualizar(aposSalvar(estadoRef.current, enviado, novo));
      setAviso(null);
      toast.sucesso('Salvo');
      return true;
    } catch (erro) {
      if (erro instanceof ConflitoApi) {
        const disco = erro.atual as Prompt;
        setConflito({
          atual: disco,
          diff: erro.diff,
          metadados: { meu: enviado, disco },
          origem: { tipo: 'salvar' },
        });
      } else {
        toast.erro(`Não foi possível salvar: ${mensagemDeErro(erro)}`);
      }
      return false;
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }, [id, atualizar]);

  // Sair com pendências pede confirmação (decisão 9).
  useEffect(() => {
    if (!temPendencias) return;
    return registrarProtecao({
      salvar,
      descartar: () => atualizar(iniciar(estadoRef.current.base)),
    });
  }, [temPendencias, salvar, atualizar]);

  /** Na Análise, o Ctrl+S só grava o Rascunho (sem Versão). */
  const { flush: flushRascunho } = rascunhoAnalise;
  const salvarRascunho = useCallback(async () => {
    if (await flushRascunho()) toast.sucesso('Rascunho salvo');
  }, [flushRascunho]);
  const salvarAtalho = emAnalise ? salvarRascunho : salvar;

  // Ctrl+S com o foco fora do editor (o CodeMirror trata o seu e marca `defaultPrevented`).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.defaultPrevented) {
        e.preventDefault();
        void salvarAtalho();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [salvarAtalho]);

  /** Grava o Rascunho no Prompt (Versão `analise`); `baseHash` sobrescreve depois do conflito. */
  async function concluir(baseHash?: string) {
    if (concluindoRef.current) return;
    concluindoRef.current = true;
    setConcluindo(true);
    try {
      if (!(await rascunhoAnalise.flush())) return;
      const novo = await concluirAnalise(id, baseHash);
      atualizar(iniciar(novo));
      setAviso(null);
      toast.sucesso('Análise concluída; o Prompt ganhou uma Versão nova');
    } catch (erro) {
      if (erro instanceof ConflitoApi) {
        setConflitoAnalise({ atual: erro.atual as Prompt, diff: erro.diff });
      } else {
        toast.erro(`Não foi possível concluir: ${mensagemDeErro(erro)}`);
      }
    } finally {
      concluindoRef.current = false;
      setConcluindo(false);
    }
  }

  const mudarRascunho = (parcial: Partial<Estado['rascunho']>) =>
    atualizar({ ...estadoRef.current, rascunho: { ...estadoRef.current.rascunho, ...parcial } });

  async function alternarFavorito() {
    const valor = !(favoritoOtimista ?? base.favorito);
    setFavoritoOtimista(valor);
    try {
      const novo = await favoritarPrompt(id, valor);
      aplicar(reagirAMudancaExterna(estadoRef.current, novo));
      toast.sucesso(valor ? 'Adicionado aos Favoritos' : 'Removido dos Favoritos');
    } catch (erro) {
      toast.erro(`Não foi possível mudar o Favorito: ${mensagemDeErro(erro)}`);
    } finally {
      setFavoritoOtimista(null);
    }
  }

  async function copiar() {
    try {
      await pedirCopia({
        id,
        titulo: base.titulo,
        aoCopiar: () => {
          if (pendente(estadoRef.current)) {
            toast.info('Copiado o texto salvo; há alterações não salvas');
          } else {
            toast.sucesso('Copiado');
          }
        },
      });
    } catch (erro) {
      toast.erro(`Não foi possível copiar: ${mensagemDeErro(erro)}`);
    }
  }

  async function excluir() {
    setConfirmarExclusao(false);
    const proximo = vizinhoNaLista(filtrosDe(navegacaoAtual()), id);
    try {
      await excluirPrompt(id);
      toast.sucesso(`"${base.titulo}" foi para a lixeira do vault`);
      if (proximo) abrirPrompt(proximo, { forcar: true });
      else fecharPainel({ forcar: true });
    } catch (erro) {
      toast.erro(`Não foi possível excluir: ${mensagemDeErro(erro)}`);
    }
  }

  async function restaurar(versaoId: string, baseHash = estadoRef.current.base.hash) {
    try {
      const novo = await restaurarVersao(id, versaoId, baseHash);
      atualizar(iniciar(novo));
      setAviso(null);
      toast.sucesso('Versão restaurada');
      return true;
    } catch (erro) {
      if (erro instanceof ConflitoApi) {
        const disco = erro.atual as Prompt;
        setConflito({ atual: disco, diff: erro.diff, origem: { tipo: 'restaurar', versaoId } });
      } else {
        toast.erro(`Não foi possível restaurar: ${mensagemDeErro(erro)}`);
      }
      return false;
    }
  }

  function verDiferencasDoAviso() {
    if (!aviso) return;
    setConflito({
      atual: aviso,
      diff: diffLines(rascunho.corpo, aviso.corpo),
      metadados: { meu: rascunho, disco: aviso },
      origem: { tipo: 'salvar' },
    });
  }

  function recarregarDoDisco(prompt: Prompt) {
    atualizar(iniciar(prompt));
    setAviso(null);
    setConflito(null);
    toast.info('Recarregado do disco');
  }

  async function sobrescrever(c: Conflito) {
    setConflito(null);
    if (c.origem.tipo === 'restaurar') {
      await restaurar(c.origem.versaoId, c.atual.hash);
      return;
    }
    atualizar(rebasear(estadoRef.current, c.atual));
    setAviso(null);
    if (await salvar()) return;
  }

  let destaque: Destaque | null = null;
  if (emAnalise && sugestaoDestacada && rascunhoAnalise.texto !== null) {
    const inicio = localizar(
      rascunhoAnalise.texto,
      sugestaoDestacada.trechoOriginal,
      sugestaoDestacada.inicio,
    );
    if (inicio !== null) {
      destaque = { inicio, fim: inicio + sugestaoDestacada.trechoOriginal.length };
    }
  }
  const promptMudouFora = emAnalise && base.corpo !== analise.corpoOriginal;

  const favorito = favoritoOtimista ?? base.favorito;
  const nomesColecoes = (colecoes.data ?? []).flatMap((c) => (c.nome === null ? [] : [c.nome]));
  if (base.colecao && !nomesColecoes.includes(base.colecao)) nomesColecoes.push(base.colecao);

  const comLateral = emAnalise || painelAnalise || consultaAnalise.isError;

  return (
    <div className="relative flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="cabecalho-folha flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <BotaoVoltar />
            <div className="flex min-h-8 min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
              <label className="flex items-center gap-1.5 text-xs text-suave">
                <Icone nome="pasta" className="size-3.5" />
                <span className="sr-only">Coleção</span>
                <select
                  value={base.colecao ?? ''}
                  onChange={(e) =>
                    void moverParaColecao(id, e.target.value === '' ? null : e.target.value)
                  }
                  className="max-w-44 rounded-md border border-transparent bg-transparent py-0.5 pr-1 text-xs font-medium text-texto transition-colors hover:border-borda focus:border-terracota focus:outline-none"
                >
                  <option value="">{SEM_COLECAO}</option>
                  {nomesColecoes.map((nome) => (
                    <option key={nome} value={nome}>
                      {nome}
                    </option>
                  ))}
                </select>
              </label>
              <span className="h-4 w-px bg-borda" aria-hidden="true" />
              <div className="flex min-w-32 flex-1 items-center gap-1.5">
                <Icone nome="tag" className="size-3.5 shrink-0 text-suave" />
                <CampoTags
                  tags={rascunho.tags}
                  sugestoes={(tags.data ?? []).map((t) => t.tag)}
                  onMudar={(novas) => mudarRascunho({ tags: novas })}
                  somenteLeitura={emAnalise}
                />
              </div>
            </div>
            <div className="-mr-1.5 flex shrink-0 items-center">
              <button
                type="button"
                className={`botao-icone ${favorito ? 'text-terracota hover:text-terracota' : ''}`}
                aria-pressed={favorito}
                aria-label={favorito ? 'Remover dos Favoritos' : 'Marcar como Favorito'}
                title={favorito ? 'Remover dos Favoritos' : 'Marcar como Favorito'}
                onClick={() => void alternarFavorito()}
              >
                <Icone nome="estrela" preenchido={favorito} className="size-[18px]" />
              </button>
              <button
                type="button"
                className={`botao-icone ${painelAnalise || emAnalise ? 'text-terracota' : ''} ${painelAnalise ? 'bg-realce' : ''}`}
                aria-label="Analisar"
                aria-pressed={painelAnalise}
                title={
                  temPendencias && !emAnalise
                    ? 'Analisar: salve ou descarte as alterações antes'
                    : 'Analisar com o Claude'
                }
                disabled={temPendencias && !emAnalise}
                onClick={() => setPainelAnalise((v) => !v)}
              >
                <Icone nome="faisca" className="size-[18px]" />
              </button>
              <button
                type="button"
                className="botao-icone"
                aria-label="Copiar o texto"
                title="Copiar o texto salvo"
                onClick={() => void copiar()}
              >
                <Icone nome="copiar" className="size-[18px]" />
              </button>
              <button
                type="button"
                className={`botao-icone ${versoesAbertas ? 'bg-realce text-texto' : ''}`}
                aria-label="Versões"
                aria-pressed={versoesAbertas}
                title={emAnalise ? 'Versões: travadas durante a Análise' : 'Versões'}
                disabled={emAnalise}
                onClick={() => setVersoesAbertas((v) => !v)}
              >
                <Icone nome="historico" className="size-[18px]" />
              </button>
              <button
                type="button"
                className="botao-icone hover:text-perigo"
                aria-label="Excluir"
                title="Excluir"
                onClick={() => setConfirmarExclusao(true)}
              >
                <Icone nome="lixeira" className="size-[18px]" />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <input
              value={rascunho.titulo}
              onChange={(e) => mudarRascunho({ titulo: e.target.value })}
              readOnly={emAnalise}
              title={emAnalise ? 'O título fica travado durante a Análise' : undefined}
              aria-label="Título do Prompt"
              placeholder="Sem título"
              className="-ml-1.5 min-w-0 flex-1 basis-full rounded-lg bg-transparent px-1.5 py-0.5 font-serif text-2xl sm:basis-64 md:text-[1.875rem] leading-tight font-medium tracking-[-0.015em] transition-colors placeholder:text-suave read-only:hover:bg-transparent read-only:focus:bg-transparent hover:bg-realce/50 focus:bg-realce/50 focus:outline-none"
            />
            <div className="ml-auto flex items-center gap-3 pb-1">
              {temPendencias && (
                <span className="flex items-center gap-1.5 text-xs text-suave" role="status">
                  <span className="size-2 rounded-full bg-terracota" aria-hidden="true" />
                  Alterações não salvas
                </span>
              )}
              {!emAnalise && (
                <button
                  type="button"
                  className="botao-primario"
                  disabled={!temPendencias || salvando}
                  onClick={() => void salvar()}
                  title={`Salvar (${TECLA_MOD}+S)`}
                >
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        </header>

        {removido && (
          <div role="alert" className="faixa bg-perigo-fundo">
            <Icone nome="alerta" className="size-4 text-perigo" />
            <span className="flex-1">
              Este Prompt foi removido do disco. O texto continua aqui só para você copiar.
            </span>
            <button type="button" className="botao" onClick={() => fecharPainel({ forcar: true })}>
              Fechar
            </button>
          </div>
        )}
        {aviso && !removido && (
          <div role="alert" className="faixa bg-realce/70">
            <Icone nome="alerta" className="size-4 text-terracota" />
            <span className="flex-1">Este Prompt mudou no disco.</span>
            <button type="button" className="botao" onClick={verDiferencasDoAviso}>
              Ver diferenças
            </button>
            <button type="button" className="botao" onClick={() => recarregarDoDisco(aviso)}>
              Recarregar
            </button>
          </div>
        )}

        {emAnalise && (
          <div role="status" className="faixa bg-realce/70">
            <Icone nome="faisca" className="size-4 text-terracota" />
            <span className="min-w-0 flex-1">
              <strong className="font-semibold">Análise em andamento.</strong>{' '}
              <span className="text-suave">
                Você edita o Rascunho; título, Tags e Versões ficam travados até concluir ou
                descartar.
              </span>
            </span>
            <button
              type="button"
              className="botao lg:hidden"
              onClick={() => setPainelAnalise(true)}
            >
              Sugestões
            </button>
          </div>
        )}
        {promptMudouFora && (
          <div role="alert" className="faixa flex-nowrap bg-perigo-fundo">
            <Icone nome="alerta" className="size-4 shrink-0 text-perigo" />
            <span>
              O Prompt mudou fora do app depois que a Análise começou. Ao concluir, você poderá ver
              as diferenças e escolher se sobrescreve.
            </span>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-h-0 min-w-0 flex-1">
            {emAnalise ? (
              <Editor
                documento={`${id}:analise`}
                valor={rascunhoAnalise.texto ?? ''}
                onMudar={rascunhoAnalise.mudar}
                onSalvar={() => void salvarRascunho()}
                placeholder="O Rascunho está vazio."
                rotulo="Rascunho da Análise"
                destaque={destaque}
              />
            ) : (
              <Editor
                documento={id}
                valor={rascunho.corpo}
                onMudar={(corpo) => mudarRascunho({ corpo })}
                onSalvar={() => void salvar()}
                placeholder="Escreva o Prompt…"
                rotulo="Texto do Prompt"
              />
            )}
            {versoesAbertas && !emAnalise && (
              <PainelVersoes
                id={id}
                pendente={temPendencias}
                onRestaurar={restaurar}
                onFechar={() => setVersoesAbertas(false)}
              />
            )}
          </div>
        </div>
      </div>
      {comLateral && (
        <aside
          aria-label="Análise"
          className={`z-20 flex min-h-0 flex-col border-l border-borda bg-superficie max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:w-[min(380px,100%)] max-lg:shadow-flutuante lg:w-[380px] lg:shrink-0 ${
            painelAnalise ? '' : 'max-lg:hidden'
          }`}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !e.defaultPrevented) setPainelAnalise(false);
          }}
        >
          <PainelAnalise
            id={id}
            analise={analise}
            carregando={consultaAnalise.isPending}
            erroLeitura={consultaAnalise.error}
            podeIniciar={!temPendencias}
            concluindo={concluindo}
            antes={rascunhoAnalise.flush}
            onAdotar={rascunhoAnalise.adotar}
            onDestacar={setSugestaoDestacada}
            onConcluir={() => void concluir()}
            onFechar={() => setPainelAnalise(false)}
          />
        </aside>
      )}

      <ModalConflito
        aberto={conflito !== null}
        conflito={conflito}
        titulo="Este Prompt mudou no disco"
        onFechar={() => setConflito(null)}
        onRecarregar={() => conflito && recarregarDoDisco(conflito.atual)}
        onSobrescrever={() => conflito && void sobrescrever(conflito)}
      />
      <ModalConflito
        aberto={conflitoAnalise !== null}
        conflito={conflitoAnalise}
        titulo="O Prompt mudou fora do app"
        descricao="O arquivo foi alterado fora do app depois que a Análise começou. Sobrescrever grava o Rascunho por cima do texto no disco; Cancelar mantém a Análise aberta."
        onFechar={() => setConflitoAnalise(null)}
        onSobrescrever={() => {
          const c = conflitoAnalise;
          setConflitoAnalise(null);
          if (c) void concluir(c.atual.hash);
        }}
      />
      <Confirmacao
        aberto={confirmarExclusao}
        titulo="Excluir este Prompt?"
        rotuloConfirmar="Excluir"
        onConfirmar={() => void excluir()}
        onCancelar={() => setConfirmarExclusao(false)}
      >
        <p>
          <strong className="text-texto">{base.titulo}</strong>: o arquivo vai para a lixeira do
          vault (<code>.trash/</code>), e as Versões continuam guardadas.
        </p>
      </Confirmacao>
    </div>
  );
}
