import { useEffect, useState, type DragEvent, type ReactNode } from 'react';

import { mensagemDeErro, type PreviaExclusao } from '../dados/cliente';
import {
  criarColecao,
  excluirColecao,
  previaExclusaoColecao,
  renomearColecao,
  useColecoes,
  useTags,
} from '../dados/consultas';
import { arrastado, MIME_PROMPT, moverParaColecao } from '../mover';
import {
  abrirDiretrizes,
  comFiltro,
  filtrar,
  navegacaoAtual,
  navegar,
  semPrompt,
  useNavegacao,
  type Filtro,
} from '../navegacao';
import { SEM_COLECAO, textoExclusaoColecao } from '../textos';
import { definirPreferencia, usePreferenciaTema, type PreferenciaTema } from '../tema';
import { Confirmacao } from './Confirmacao';
import { Dialogo } from './Dialogo';
import { Icone, type NomeIcone } from './Icone';
import { toast } from './Toaster';

function Item({
  icone,
  rotulo,
  total,
  ativo,
  onClick,
  soltar,
  children,
}: {
  icone?: NomeIcone;
  rotulo: string;
  total?: number | undefined;
  ativo: boolean;
  onClick: () => void;
  /** Coleção de destino ao soltar um Prompt aqui (`null` = "Sem coleção"); sem ela, não aceita. */
  soltar?: string | null;
  children?: ReactNode;
}) {
  const [alvo, setAlvo] = useState(false);
  const aceita = (e: DragEvent) =>
    soltar !== undefined &&
    e.dataTransfer.types.includes(MIME_PROMPT) &&
    arrastado()?.colecao !== soltar;

  // Arrasto cancelado (Esc, soltar fora): nem sempre vem um `dragleave` neste item.
  useEffect(() => {
    if (!alvo) return;
    const limpar = () => setAlvo(false);
    document.addEventListener('dragend', limpar);
    document.addEventListener('drop', limpar);
    return () => {
      document.removeEventListener('dragend', limpar);
      document.removeEventListener('drop', limpar);
    };
  }, [alvo]);

  return (
    <li
      className="group relative"
      onDragEnter={(e) => {
        if (aceita(e)) setAlvo(true);
      }}
      onDragOver={(e) => {
        if (!aceita(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAlvo(false);
      }}
      onDrop={(e) => {
        setAlvo(false);
        const id = e.dataTransfer.getData(MIME_PROMPT);
        if (!aceita(e) || !id || soltar === undefined) return;
        e.preventDefault();
        void moverParaColecao(id, soltar);
      }}
    >
      <button
        type="button"
        aria-current={ativo}
        onClick={onClick}
        className={`item item-nav flex w-full items-center gap-2.5 text-left text-sm ${
          ativo ? 'font-medium text-texto' : 'text-texto/85'
        } ${alvo ? 'item-alvo' : ''}`}
      >
        {icone && (
          <Icone
            nome={icone}
            className={`size-4 shrink-0 ${ativo ? 'text-terracota' : 'text-suave'}`}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{rotulo}</span>
        {total !== undefined && <span className="text-xs text-suave tabular-nums">{total}</span>}
      </button>
      {children}
    </li>
  );
}

/** Campo inline para criar ou renomear Coleção; o erro do servidor aparece embaixo. */
function CampoColecao({
  inicial,
  rotulo,
  onConfirmar,
  onCancelar,
}: {
  inicial: string;
  rotulo: string;
  onConfirmar: (nome: string) => Promise<void>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!nome.trim()) {
      setErro('Digite um nome para a Coleção.');
      return;
    }
    setEnviando(true);
    try {
      await onConfirmar(nome.trim());
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      className="px-1 py-1"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar();
      }}
    >
      <input
        autoFocus
        value={nome}
        disabled={enviando}
        aria-label={rotulo}
        aria-invalid={erro !== null}
        aria-describedby={erro ? 'erro-colecao' : undefined}
        placeholder="Nome da Coleção"
        onChange={(e) => {
          setNome(e.target.value);
          setErro(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancelar();
          }
        }}
        onBlur={() => {
          if (!nome.trim() || nome === inicial) onCancelar();
        }}
        className={`campo py-1 ${erro ? 'border-perigo' : ''}`}
      />
      {erro && (
        <p id="erro-colecao" className="mt-1 px-1 text-xs text-perigo">
          {erro}
        </p>
      )}
    </form>
  );
}

const TEMAS: { valor: PreferenciaTema; icone: NomeIcone; rotulo: string }[] = [
  { valor: 'sistema', icone: 'monitor', rotulo: 'Tema do sistema' },
  { valor: 'claro', icone: 'sol', rotulo: 'Tema claro' },
  { valor: 'escuro', icone: 'lua', rotulo: 'Tema escuro' },
];

/** Painel 1: filtros, Coleções, Tags e o rodapé com Diretrizes, tema e Novo Prompt. */
export function Navegacao({
  onEscolher,
  onNovoPrompt,
}: {
  /** Chamado depois de escolher um filtro (fecha a gaveta nas telas estreitas). */
  onEscolher: () => void;
  onNovoPrompt: () => void;
}) {
  const nav = useNavegacao();
  const colecoes = useColecoes();
  const tags = useTags();
  const tema = usePreferenciaTema();
  const [criando, setCriando] = useState(false);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<{ nome: string; previa: PreviaExclusao } | null>(null);

  const listaColecoes = colecoes.data ?? [];
  const totalSem = listaColecoes.find((c) => c.nome === null)?.total;
  const totalTodos = listaColecoes.reduce((s, c) => s + c.total, 0);
  const emPrompts = nav.vista === 'prompts';
  const semFiltro = nav.colecao === undefined && !nav.tag && !nav.favoritos;

  const escolher = (filtro: Filtro) => {
    // Nas telas estreitas a lista toma o lugar do Prompt aberto.
    if (window.matchMedia('(max-width: 767px)').matches) {
      navegar((n) => semPrompt(comFiltro(n, filtro)));
    } else {
      filtrar(filtro);
    }
    onEscolher();
  };

  async function pedirExclusao(nome: string) {
    try {
      setExcluindo({ nome, previa: await previaExclusaoColecao(nome) });
    } catch (e) {
      toast.erro(mensagemDeErro(e));
    }
  }

  async function confirmarExclusao(nome: string) {
    setExcluindo(null);
    try {
      await excluirColecao(nome);
      if (navegacaoAtual().colecao === nome) filtrar({});
      toast.sucesso(`Coleção "${nome}" excluída`);
    } catch (e) {
      toast.erro(mensagemDeErro(e));
    }
  }

  return (
    <nav aria-label="Coleções e Tags" className="flex h-full min-h-0 flex-col">
      <div className="px-[1.125rem] pt-5 pb-4">
        <h1 className="font-serif text-[1.1875rem] leading-none font-semibold">
          Biblioteca de Prompts
        </h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <ul className="flex flex-col gap-0.5">
          <Item
            icone="todos"
            rotulo="Todos"
            total={colecoes.data ? totalTodos : undefined}
            ativo={emPrompts && semFiltro}
            onClick={() => escolher({})}
          />
          <Item
            icone="estrela"
            rotulo="Favoritos"
            ativo={emPrompts && nav.favoritos}
            onClick={() => escolher({ favoritos: true })}
          />
          <Item
            icone="inbox"
            rotulo={SEM_COLECAO}
            total={totalSem}
            ativo={emPrompts && nav.colecao === null}
            onClick={() => escolher({ colecao: null })}
            soltar={null}
          />
        </ul>

        <div className="mt-6 mb-1 flex items-center justify-between pr-1 pl-2.5">
          <h2 className="rotulo-secao">Coleções</h2>
          <button
            type="button"
            className="botao-icone size-6"
            aria-label="Nova Coleção"
            title="Nova Coleção"
            onClick={() => setCriando(true)}
          >
            <Icone nome="mais" className="size-3.5" />
          </button>
        </div>
        <ul className="flex flex-col gap-0.5">
          {criando && (
            <li>
              <CampoColecao
                inicial=""
                rotulo="Nome da nova Coleção"
                onCancelar={() => setCriando(false)}
                onConfirmar={async (nome) => {
                  const criada = await criarColecao(nome);
                  setCriando(false);
                  toast.sucesso(`Coleção "${criada}" criada`);
                }}
              />
            </li>
          )}
          {listaColecoes.map((c) =>
            c.nome === null ? null : renomeando === c.nome ? (
              <li key={c.nome}>
                <CampoColecao
                  inicial={c.nome}
                  rotulo={`Novo nome para ${c.nome}`}
                  onCancelar={() => setRenomeando(null)}
                  onConfirmar={async (novoNome) => {
                    const antigo = c.nome as string;
                    const nome = await renomearColecao(antigo, novoNome);
                    setRenomeando(null);
                    if (nav.colecao === antigo) filtrar({ colecao: nome });
                    toast.sucesso(`Coleção renomeada para "${nome}"`);
                  }}
                />
              </li>
            ) : (
              <Item
                key={c.nome}
                icone="pasta"
                rotulo={c.nome}
                total={c.total}
                ativo={emPrompts && nav.colecao === c.nome}
                onClick={() => escolher({ colecao: c.nome })}
                soltar={c.nome}
              >
                <div className="absolute top-1/2 right-1 flex -translate-y-1/2 gap-0.5 rounded-lg bg-elevada opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    className="botao-icone size-6"
                    aria-label={`Renomear a Coleção ${c.nome}`}
                    title="Renomear"
                    onClick={() => setRenomeando(c.nome)}
                  >
                    <Icone nome="lapis" className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    className="botao-icone size-6 hover:text-perigo"
                    aria-label={`Excluir a Coleção ${c.nome}`}
                    title="Excluir"
                    onClick={() => void pedirExclusao(c.nome as string)}
                  >
                    <Icone nome="lixeira" className="size-3.5" />
                  </button>
                </div>
              </Item>
            ),
          )}
          {colecoes.isSuccess && listaColecoes.length <= 1 && !criando && (
            <li className="px-2.5 py-1 text-xs text-suave">Nenhuma Coleção ainda.</li>
          )}
          {colecoes.isError && (
            <li className="px-2.5 py-1 text-xs text-perigo">{mensagemDeErro(colecoes.error)}</li>
          )}
        </ul>

        <Dialogo
          aberto={excluindo !== null && excluindo.previa.conflitos.length > 0}
          onFechar={() => setExcluindo(null)}
          titulo="Não é possível excluir a Coleção"
        >
          <div className="corpo-modal flex flex-col gap-3 text-sm text-suave">
            <p>
              Ao excluir a Coleção &ldquo;{excluindo?.nome}&rdquo;, os Prompts dela vão para{' '}
              {SEM_COLECAO}. Estes ficariam com o mesmo nome de arquivo de outro Prompt:
            </p>
            <ul className="list-disc pl-5 text-texto">
              {excluindo?.previa.conflitos.map((t, i) => (
                <li key={`${t}-${i}`}>{t}</li>
              ))}
            </ul>
            <p>Renomeie-os e tente de novo.</p>
          </div>
          <div className="rodape-modal">
            <button
              type="button"
              className="botao-primario"
              onClick={() => setExcluindo(null)}
              data-autofocus
            >
              Entendi
            </button>
          </div>
        </Dialogo>
        <Confirmacao
          aberto={excluindo !== null && excluindo.previa.conflitos.length === 0}
          titulo={`Excluir a Coleção "${excluindo?.nome ?? ''}"?`}
          rotuloConfirmar="Excluir Coleção"
          onCancelar={() => setExcluindo(null)}
          onConfirmar={() => excluindo && void confirmarExclusao(excluindo.nome)}
        >
          {excluindo && textoExclusaoColecao(excluindo.previa)}
        </Confirmacao>

        <h2 className="rotulo-secao mt-6 mb-1.5 px-2.5">Tags</h2>
        <ul className="flex flex-col gap-0.5">
          {(tags.data ?? []).map((t) => (
            <Item
              key={t.tag}
              icone="tag"
              rotulo={t.tag}
              total={t.total}
              ativo={emPrompts && nav.tag === t.tag}
              onClick={() => escolher({ tag: t.tag })}
            />
          ))}
          {tags.isSuccess && tags.data.length === 0 && (
            <li className="px-2.5 py-1 text-xs text-suave">Nenhuma Tag ainda.</li>
          )}
        </ul>
      </div>

      <div className="flex flex-col gap-2 border-t border-borda p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-current={nav.vista === 'diretrizes'}
            onClick={() => {
              abrirDiretrizes();
              onEscolher();
            }}
            className={`item item-nav flex min-w-0 flex-1 items-center gap-2.5 text-left text-sm ${
              nav.vista === 'diretrizes' ? 'font-medium' : ''
            }`}
          >
            <Icone
              nome="livro"
              className={`size-4 ${nav.vista === 'diretrizes' ? 'text-terracota' : 'text-suave'}`}
            />
            Diretrizes
          </button>
          <div
            role="radiogroup"
            aria-label="Tema"
            className="flex shrink-0 rounded-lg bg-realce/70 p-0.5"
          >
            {TEMAS.map((t) => (
              <button
                key={t.valor}
                type="button"
                role="radio"
                aria-checked={tema === t.valor}
                aria-label={t.rotulo}
                title={t.rotulo}
                onClick={() => {
                  definirPreferencia(t.valor);
                  toast.sucesso(`${t.rotulo} ativado`);
                }}
                className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                  tema === t.valor
                    ? 'bg-elevada text-terracota shadow-cartao'
                    : 'text-suave hover:text-texto'
                }`}
              >
                <Icone nome={t.icone} className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="botao-primario w-full" onClick={onNovoPrompt}>
          <Icone nome="mais" />
          Novo Prompt
        </button>
      </div>
    </nav>
  );
}
