import { diffLines } from 'diff';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ConflitoApi, mensagemDeErro, type EstadoDiretrizes as Arquivo } from '../dados/cliente';
import { lerDiretrizes, salvarDiretrizes, useDiretrizes } from '../dados/consultas';
import { ouvirEventos } from '../dados/eventos';
import {
  diretrizesPendentes,
  iniciarDiretrizes,
  reagirDiretrizes,
  type EstadoDiretrizes,
} from '../edicao';
import { registrarProtecao } from '../navegacao';
import { TECLA_MOD } from '../textos';
import { Editor } from './Editor';
import { EstadoVazio } from './EstadoVazio';
import { Icone } from './Icone';
import { ModalConflito, type DadosConflito } from './ModalConflito';
import { BotaoVoltar } from './PainelPrompt';
import { toast } from './Toaster';

interface Conflito extends DadosConflito {
  atual: Arquivo;
}

/** `vista=diretrizes` no painel 3: o mesmo editor, sobre `Prompts/_Diretrizes.md`. */
export function Diretrizes() {
  const consulta = useDiretrizes();
  if (consulta.data) return <EdicaoDiretrizes inicial={consulta.data} />;
  if (consulta.isError) {
    return (
      <EstadoVazio icone="alerta" titulo="Erro ao abrir as Diretrizes">
        <p>{mensagemDeErro(consulta.error)}</p>
      </EstadoVazio>
    );
  }
  return <div className="p-6 text-sm text-suave">Carregando…</div>;
}

function EdicaoDiretrizes({ inicial }: { inicial: Arquivo }) {
  const [estado, setEstadoReact] = useState<EstadoDiretrizes>(() => iniciarDiretrizes(inicial));
  const estadoRef = useRef(estado);
  const atualizar = useCallback((novo: EstadoDiretrizes) => {
    estadoRef.current = novo;
    setEstadoReact(novo);
  }, []);
  const [aviso, setAviso] = useState<Arquivo | null>(null);
  const [conflito, setConflito] = useState<Conflito | null>(null);
  const [salvando, setSalvando] = useState(false);
  const temPendencias = diretrizesPendentes(estado);

  // O evento `diretrizes` traz o hash novo: a mesma regra do Prompt (ignorar, recarregar, avisar).
  useEffect(
    () =>
      ouvirEventos((evento) => {
        if (evento.tipo === 'acervo' || evento.tipo === 'analise') return;
        if (evento.tipo === 'diretrizes' && evento.dados.hash === estadoRef.current.base.hash) {
          return;
        }
        lerDiretrizes().then(
          (novo) => {
            const r = reagirDiretrizes(estadoRef.current, novo);
            if (r.acao === 'avisar') setAviso(r.novo);
            else if (r.estado !== estadoRef.current) {
              atualizar(r.estado);
              if (r.acao === 'recarregar') {
                setAviso(null);
                toast.info('Diretrizes atualizadas fora do app');
              }
            }
          },
          () => undefined,
        );
      }),
    [atualizar],
  );

  const salvandoRef = useRef(false);
  const salvar = useCallback(async (): Promise<boolean> => {
    const atual = estadoRef.current;
    if (salvandoRef.current) return false;
    if (!diretrizesPendentes(atual)) return true;
    salvandoRef.current = true;
    setSalvando(true);
    const enviado = atual.rascunho;
    try {
      const novo = await salvarDiretrizes(enviado, atual.base.hash);
      atualizar(
        estadoRef.current.rascunho === enviado
          ? iniciarDiretrizes(novo)
          : { base: novo, rascunho: estadoRef.current.rascunho },
      );
      setAviso(null);
      toast.sucesso('Diretrizes salvas');
      return true;
    } catch (erro) {
      if (erro instanceof ConflitoApi) {
        setConflito({ atual: erro.atual as Arquivo, diff: erro.diff });
      } else {
        toast.erro(`Não foi possível salvar: ${mensagemDeErro(erro)}`);
      }
      return false;
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }, [atualizar]);

  useEffect(() => {
    if (!temPendencias) return;
    return registrarProtecao({
      salvar,
      descartar: () => atualizar(iniciarDiretrizes(estadoRef.current.base)),
    });
  }, [temPendencias, salvar, atualizar]);

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

  function recarregar(arquivo: Arquivo) {
    atualizar(iniciarDiretrizes(arquivo));
    setAviso(null);
    setConflito(null);
    toast.info('Recarregado do disco');
  }

  async function sobrescrever(c: Conflito) {
    setConflito(null);
    setAviso(null);
    atualizar({ base: c.atual, rascunho: estadoRef.current.rascunho });
    await salvar();
  }

  const vazio = estado.base.hash === null && estado.rascunho === '';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-borda px-4 py-3 md:px-6">
        <BotaoVoltar />
        <Icone nome="livro" className="size-5 text-terracota" />
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-xl font-semibold">Diretrizes</h2>
          <p className="text-xs text-suave">
            Critérios de um bom Prompt, usados pela Análise. Ficam em{' '}
            <code>Prompts/_Diretrizes.md</code>, sem Versões.
          </p>
        </div>
        <div className="flex items-center gap-3">
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
      </header>
      {aviso && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-borda bg-realce px-6 py-2.5 text-sm"
        >
          <Icone nome="alerta" className="size-4 text-terracota" />
          <span className="flex-1">As Diretrizes mudaram no disco.</span>
          <button
            type="button"
            className="botao"
            onClick={() =>
              setConflito({ atual: aviso, diff: diffLines(estado.rascunho, aviso.conteudo) })
            }
          >
            Ver diferenças
          </button>
          <button type="button" className="botao" onClick={() => recarregar(aviso)}>
            Recarregar
          </button>
        </div>
      )}
      {vazio && (
        <div className="border-b border-borda bg-superficie px-6 py-3 text-sm text-suave">
          Escreva aqui os critérios do que você considera um bom Prompt: tom, estrutura, o que nunca
          pode faltar. A Análise vai usá-los para sugerir melhorias.
        </div>
      )}
      <div className="min-h-0 flex-1">
        <Editor
          documento="diretrizes"
          valor={estado.rascunho}
          onMudar={(rascunho) => atualizar({ ...estadoRef.current, rascunho })}
          onSalvar={() => void salvar()}
          placeholder="Escreva aqui os critérios do que você considera um bom Prompt"
          rotulo="Texto das Diretrizes"
        />
      </div>
      <ModalConflito
        aberto={conflito !== null}
        conflito={conflito}
        titulo="As Diretrizes mudaram no disco"
        onFechar={() => setConflito(null)}
        onRecarregar={() => conflito && recarregar(conflito.atual)}
        onSobrescrever={() => conflito && void sobrescrever(conflito)}
      />
    </div>
  );
}
