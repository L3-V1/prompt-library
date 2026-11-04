import { diffLines } from 'diff';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConflitoApi, ErroApi, mensagemDeErro, type Prompt } from '../dados/cliente';
import {
  copiarPrompt,
  excluirPrompt,
  favoritarPrompt,
  filtrosDe,
  moverPrompt,
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
import { SEM_COLECAO, TECLA_MOD } from '../textos';
import { CampoTags } from './CampoTags';
import { Confirmacao } from './Confirmacao';
import { Editor } from './Editor';
import { EstadoVazio } from './EstadoVazio';
import { Icone } from './Icone';
import { ModalConflito, type DadosConflito } from './ModalConflito';
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
  return <div className="p-6 text-sm text-suave">Carregando…</div>;
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
        if (evento.tipo === 'diretrizes') return;
        if (
          evento.tipo === 'acervo' &&
          !evento.dados.alterados.includes(id) &&
          !evento.dados.removidos.includes(id)
        ) {
          return;
        }
        relerPrompt(id).then(
          (novo) => aplicar(reagirAMudancaExterna(estadoRef.current, novo)),
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

  // Ctrl+S com o foco fora do editor (o CodeMirror trata o seu e marca `defaultPrevented`).
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !e.defaultPrevented) {
        e.preventDefault();
        void salvar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [salvar]);

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

  async function mover(colecao: string | null) {
    try {
      const novo = await moverPrompt(id, colecao);
      aplicar(reagirAMudancaExterna(estadoRef.current, novo));
      toast.sucesso(`Movido para ${colecao ?? SEM_COLECAO}`);
    } catch (erro) {
      toast.erro(`Não foi possível mover: ${mensagemDeErro(erro)}`);
    }
  }

  async function copiar() {
    try {
      await copiarPrompt(id);
      if (pendente(estadoRef.current)) {
        toast.info('Copiado o texto salvo; há alterações não salvas');
      } else {
        toast.sucesso('Copiado');
      }
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

  const favorito = favoritoOtimista ?? base.favorito;
  const nomesColecoes = (colecoes.data ?? []).flatMap((c) => (c.nome === null ? [] : [c.nome]));
  if (base.colecao && !nomesColecoes.includes(base.colecao)) nomesColecoes.push(base.colecao);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b border-borda px-4 pt-3 pb-3 md:px-6">
        <div className="flex items-center gap-1">
          <BotaoVoltar />
          <input
            value={rascunho.titulo}
            onChange={(e) => mudarRascunho({ titulo: e.target.value })}
            aria-label="Título do Prompt"
            placeholder="Sem título"
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 font-serif text-xl font-semibold placeholder:text-suave hover:bg-realce/60 focus:bg-realce/60 focus:outline-none"
          />
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
            title="Versões"
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-1">
          <label className="flex items-center gap-1.5 text-xs text-suave">
            <Icone nome="pasta" className="size-3.5" />
            <span className="sr-only">Coleção</span>
            <select
              value={base.colecao ?? ''}
              onChange={(e) => void mover(e.target.value === '' ? null : e.target.value)}
              className="max-w-44 rounded-md border border-transparent bg-transparent py-0.5 pr-1 text-xs text-texto hover:border-borda focus:border-terracota focus:outline-none"
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
          <div className="flex min-w-40 flex-1 items-center gap-1.5">
            <Icone nome="tag" className="size-3.5 shrink-0 text-suave" />
            <CampoTags
              tags={rascunho.tags}
              sugestoes={(tags.data ?? []).map((t) => t.tag)}
              onMudar={(novas) => mudarRascunho({ tags: novas })}
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            {temPendencias && (
              <span className="flex items-center gap-1.5 text-xs text-suave" role="status">
                <span className="size-2 rounded-full bg-terracota" aria-hidden="true" />
                Alterações não salvas
              </span>
            )}
            <button
              type="button"
              className="botao-primario"
              disabled={!temPendencias || salvando}
              onClick={() => void salvar()}
              title={`Salvar (${TECLA_MOD}+S)`}
            >
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </header>

      {removido && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-borda bg-perigo-fundo px-6 py-2.5 text-sm"
        >
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
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-borda bg-realce px-6 py-2.5 text-sm"
        >
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

      <div className="relative min-h-0 flex-1">
        <Editor
          documento={id}
          valor={rascunho.corpo}
          onMudar={(corpo) => mudarRascunho({ corpo })}
          onSalvar={() => void salvar()}
          placeholder="Escreva o Prompt…"
          rotulo="Texto do Prompt"
        />
        {versoesAbertas && (
          <PainelVersoes
            id={id}
            pendente={temPendencias}
            onRestaurar={restaurar}
            onFechar={() => setVersoesAbertas(false)}
          />
        )}
      </div>

      <ModalConflito
        aberto={conflito !== null}
        conflito={conflito}
        titulo="Este Prompt mudou no disco"
        onFechar={() => setConflito(null)}
        onRecarregar={() => conflito && recarregarDoDisco(conflito.atual)}
        onSobrescrever={() => conflito && void sobrescrever(conflito)}
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
