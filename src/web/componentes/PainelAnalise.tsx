import { useEffect, useId, useState, type ReactNode } from 'react';

import {
  formatarCusto,
  formatarDuracao,
  lerModeloSalvo,
  MODELOS,
  plural,
  resumoStatus,
  salvarModelo,
  tempoDecorrido,
  textoAtividade,
  textoResumo,
  type ModeloEscolhido,
} from '../analise-ui';
import {
  aceitarSugestao,
  cancelarAnalise,
  descartarAnalise,
  iniciarAnalise,
  regenerarAnalise,
  regenerarSugestao,
  rejeitarSugestao,
  type Analise,
  type OpcoesAnalise,
  type Sugestao,
} from '../dados/analise';
import { useAtividade } from '../dados/atividade';
import { ErroApi, mensagemDeErro } from '../dados/cliente';
import { CartaoSugestao } from './CartaoSugestao';
import { Confirmacao } from './Confirmacao';
import { Icone } from './Icone';
import { toast } from './Toaster';

/** Instrução opcional e modelo; o último modelo escolhido fica no `localStorage`. */
function FormAnalise({
  inicial,
  rotuloEnviar,
  desabilitado,
  aviso,
  onEnviar,
  onCancelar,
}: {
  inicial?: OpcoesAnalise;
  rotuloEnviar: string;
  desabilitado: boolean;
  aviso?: string | undefined;
  onEnviar: (opcoes: OpcoesAnalise) => void;
  onCancelar?: () => void;
}) {
  const [instrucao, setInstrucao] = useState(inicial?.instrucao ?? '');
  const [modelo, setModelo] = useState<ModeloEscolhido>(() =>
    inicial ? inicial.modelo : lerModeloSalvo(),
  );
  const idInstrucao = useId();
  const idModelo = useId();

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        salvarModelo(modelo);
        onEnviar({ instrucao: instrucao.trim(), modelo });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idInstrucao} className="text-sm font-medium">
          Instrução <span className="font-normal text-suave">(opcional)</span>
        </label>
        <textarea
          id={idInstrucao}
          value={instrucao}
          onChange={(e) => setInstrucao(e.target.value)}
          rows={3}
          maxLength={10_000}
          placeholder="Ex.: foque em concisão"
          className="campo resize-y"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={idModelo} className="text-sm font-medium">
          Modelo
        </label>
        <select
          id={idModelo}
          value={modelo ?? ''}
          onChange={(e) => setModelo((e.target.value || null) as ModeloEscolhido)}
          className="campo"
        >
          {MODELOS.map((m) => (
            <option key={m.rotulo} value={m.valor ?? ''}>
              {m.rotulo}
            </option>
          ))}
        </select>
      </div>
      {aviso && <p className="text-xs text-suave">{aviso}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {onCancelar && (
          <button type="button" className="botao" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        <button type="submit" className="botao-primario" disabled={desabilitado}>
          <Icone nome="faisca" className="size-3.5" />
          {rotuloEnviar}
        </button>
      </div>
    </form>
  );
}

/** Tempo desde `inicio`, atualizado a cada segundo. */
function Decorrido({ inicio }: { inicio: string }) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="tabular-nums">{tempoDecorrido(inicio, agora)}</span>;
}

/**
 * Painel lateral da Análise (decisões 13 a 18): começa com Instrução e modelo, mostra a fase
 * enquanto o Claude gera e, depois, os cards das Sugestões com Concluir e Descartar. O Rascunho
 * fica no editor principal; `antes` grava o que estiver pendente nele antes de cada ação.
 */
export function PainelAnalise({
  id,
  analise,
  carregando,
  erroLeitura,
  podeIniciar,
  concluindo,
  antes,
  onAdotar,
  onDestacar,
  onConcluir,
  onFechar,
}: {
  id: string;
  analise: Analise | null;
  carregando: boolean;
  erroLeitura: unknown;
  /** Sem alterações não salvas no Prompt. */
  podeIniciar: boolean;
  concluindo: boolean;
  antes: () => Promise<boolean>;
  onAdotar: (analise: Analise) => void;
  onDestacar: (sugestao: Sugestao | null) => void;
  onConcluir: () => void;
  onFechar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [regenerandoTudo, setRegenerandoTudo] = useState(false);
  const [confirmar, setConfirmar] = useState<'concluir' | 'descartar' | null>(null);

  async function agir(
    fn: () => Promise<Analise | void>,
    erro: string,
    sucesso?: string,
  ): Promise<void> {
    if (ocupado) return;
    setOcupado(true);
    try {
      if (!(await antes())) return;
      const a = await fn();
      if (a) onAdotar(a);
      if (sucesso) toast.sucesso(sucesso);
    } catch (e) {
      toast.erro(`${erro}: ${mensagemDeErro(e)}`);
    } finally {
      setOcupado(false);
    }
  }

  const iniciar = (opcoes: OpcoesAnalise) =>
    agir(() => iniciarAnalise(id, opcoes), 'Não foi possível iniciar a Análise');
  const regenerarTudo = (opcoes?: OpcoesAnalise) => {
    setRegenerandoTudo(false);
    void agir(() => regenerarAnalise(id, opcoes), 'Não foi possível regenerar');
  };
  const cancelar = () =>
    agir(() => cancelarAnalise(id), 'Não foi possível cancelar', 'Geração cancelada');
  const descartar = () => {
    setConfirmar(null);
    onDestacar(null);
    void agir(
      () => descartarAnalise(id),
      'Não foi possível descartar',
      'Análise descartada; o Prompt ficou como estava',
    );
  };

  const gerando = analise?.execucao ?? null;
  const atividade = useAtividade(id);
  const textoAtual = gerando && atividade ? textoAtividade(atividade) : null;
  const resumo = resumoStatus(analise?.sugestoes ?? []);

  let conteudo: ReactNode;
  if (carregando) {
    conteudo = <p className="text-sm text-suave">Carregando…</p>;
  } else if (erroLeitura) {
    const invalida = erroLeitura instanceof ErroApi && erroLeitura.codigo === 'analise_invalida';
    conteudo = (
      <div className="flex flex-col gap-3 text-sm">
        <p className="cartao border-transparent bg-perigo-fundo text-perigo">
          {mensagemDeErro(erroLeitura)}
        </p>
        {invalida && (
          <button
            type="button"
            className="botao-perigo self-end"
            onClick={() => setConfirmar('descartar')}
          >
            Descartar a Análise
          </button>
        )}
      </div>
    );
  } else if (!analise) {
    conteudo = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-suave">
          O Claude lê as Diretrizes, a Instrução e o Prompt e propõe Sugestões pontuais. Você
          aceita, rejeita ou regenera cada uma, e pode editar o Rascunho à vontade. Ao concluir, o
          Prompt ganha uma única Versão.
        </p>
        <FormAnalise
          rotuloEnviar="Iniciar"
          desabilitado={!podeIniciar || ocupado}
          aviso={podeIniciar ? undefined : 'Salve ou descarte as alterações antes de analisar.'}
          onEnviar={(o) => void iniciar(o)}
        />
      </div>
    );
  } else {
    conteudo = (
      <div className="flex flex-col gap-4">
        {gerando && (
          <div role="status" className="cartao flex items-center gap-3 text-sm">
            <span
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-terracota border-t-transparent"
              aria-hidden="true"
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span>
                {gerando.tipo === 'sugestao' ? 'Regenerando a Sugestão…' : 'Gerando Sugestões…'}{' '}
                <span className="text-suave">
                  <Decorrido inicio={gerando.iniciadaEm} />
                </span>
              </span>
              {textoAtual && (
                <span className="truncate text-xs text-suave" title={textoAtual} aria-live="off">
                  {textoAtual}
                </span>
              )}
            </span>
            <button
              type="button"
              className="botao"
              disabled={ocupado}
              onClick={() => void cancelar()}
            >
              Cancelar
            </button>
          </div>
        )}

        {analise.erro && !gerando && (
          <div
            role="alert"
            className="cartao flex flex-col gap-3 border-transparent bg-perigo-fundo text-sm"
          >
            <p className="flex gap-2 text-perigo">
              <Icone nome="alerta" className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{analise.erro}</span>
            </p>
            <button
              type="button"
              className="botao self-end"
              disabled={ocupado}
              onClick={() => regenerarTudo()}
            >
              <Icone nome="recarregar" className="size-3.5" />
              Tentar de novo
            </button>
          </div>
        )}

        {!gerando && !analise.erro && analise.sugestoes.length === 0 && (
          <p className="cartao text-sm text-suave">
            O Claude não propôs Sugestões. Edite o Rascunho, regenere com outra Instrução ou
            conclua.
          </p>
        )}

        {analise.sugestoes.length > 0 && (
          <div className="flex flex-col gap-1 text-xs text-suave">
            <span>{textoResumo(resumo)}</span>
          </div>
        )}
        {analise.ultimaExecucao && (
          <p className="-mt-3 text-xs text-suave">
            Última execução: {formatarCusto(analise.ultimaExecucao.custoUsd)},{' '}
            {formatarDuracao(analise.ultimaExecucao.duracaoMs)} ({analise.ultimaExecucao.modelo})
            {analise.ultimaExecucao.descartadas > 0 &&
              `. ${plural(analise.ultimaExecucao.descartadas, 'Sugestão descartada', 'Sugestões descartadas')}: o trecho não existia no Rascunho, não mudava nada ou repetia uma rejeitada.`}
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {analise.sugestoes.map((s) => (
            <CartaoSugestao
              key={s.id}
              sugestao={s}
              ocupado={ocupado || gerando !== null}
              regenerando={gerando?.tipo === 'sugestao' && gerando.sugestaoId === s.id}
              onDestacar={(ativo) => onDestacar(ativo ? s : null)}
              onAceitar={() => {
                onDestacar(null);
                void agir(
                  () => aceitarSugestao(id, s.id),
                  'Não foi possível aceitar',
                  'Sugestão aceita',
                );
              }}
              onRejeitar={() => {
                onDestacar(null);
                void agir(
                  () => rejeitarSugestao(id, s.id),
                  'Não foi possível rejeitar',
                  'Sugestão rejeitada',
                );
              }}
              onRegenerar={() =>
                void agir(
                  () => regenerarSugestao(id, s.id),
                  'Não foi possível regenerar a Sugestão',
                )
              }
            />
          ))}
        </ul>

        {regenerandoTudo && !gerando && (
          <div className="cartao">
            <h3 className="mb-3 text-sm font-semibold">Regenerar tudo</h3>
            <p className="mb-3 text-xs text-suave">
              As Sugestões pendentes e desatualizadas são trocadas por novas. As aceitas e
              rejeitadas ficam, e as rejeitadas não são repetidas.
            </p>
            <FormAnalise
              inicial={{ instrucao: analise.instrucao, modelo: analise.modelo }}
              rotuloEnviar="Regenerar"
              desabilitado={ocupado}
              onEnviar={(o) => regenerarTudo(o)}
              onCancelar={() => setRegenerandoTudo(false)}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="cabecalho-painel">
        <Icone nome="faisca" className="size-4 text-terracota" />
        <h2 className="titulo-painel">Análise</h2>
        {/* Com Análise, em telas largas o painel fica sempre aberto; só a gaveta fecha. */}
        <button
          type="button"
          className={`botao-icone ml-auto ${analise ? 'lg:hidden' : ''}`}
          aria-label="Fechar o painel da Análise"
          onClick={onFechar}
        >
          <Icone nome="x" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{conteudo}</div>

      {analise && (
        <div className="flex flex-wrap items-center gap-2 border-t border-borda px-4 py-3">
          <button
            type="button"
            className="botao"
            disabled={ocupado || gerando !== null || regenerandoTudo}
            onClick={() => setRegenerandoTudo(true)}
            title="Gerar de novo as Sugestões não decididas"
          >
            <Icone nome="recarregar" className="size-3.5" />
            Regenerar tudo
          </button>
          <button
            type="button"
            className="botao ml-auto hover:text-perigo"
            disabled={ocupado || concluindo}
            onClick={() => setConfirmar('descartar')}
          >
            Descartar
          </button>
          <button
            type="button"
            className="botao-primario"
            disabled={ocupado || concluindo || gerando !== null}
            title={gerando ? 'Aguarde a geração terminar ou cancele' : undefined}
            onClick={() => setConfirmar('concluir')}
          >
            {concluindo ? 'Concluindo…' : 'Concluir'}
          </button>
        </div>
      )}

      <Confirmacao
        aberto={confirmar === 'concluir'}
        titulo="Concluir a Análise?"
        rotuloConfirmar="Concluir"
        destrutiva={false}
        onCancelar={() => setConfirmar(null)}
        onConfirmar={() => {
          setConfirmar(null);
          onDestacar(null);
          onConcluir();
        }}
      >
        <p>
          O Rascunho vira o texto do Prompt, com uma única Versão nova (motivo Análise).
          {resumo.pendente + resumo.desatualizada > 0 &&
            ` ${plural(resumo.pendente + resumo.desatualizada, 'Sugestão ainda não decidida será ignorada', 'Sugestões ainda não decididas serão ignoradas')}.`}
        </p>
      </Confirmacao>
      <Confirmacao
        aberto={confirmar === 'descartar'}
        titulo="Descartar a Análise?"
        rotuloConfirmar="Descartar"
        onCancelar={() => setConfirmar(null)}
        onConfirmar={descartar}
      >
        <p>
          O Rascunho e as Sugestões serão perdidos. O Prompt fica exatamente como estava antes da
          Análise.
        </p>
      </Confirmacao>
    </>
  );
}
