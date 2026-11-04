import { useState, type ReactNode } from 'react';

import { mensagemDeErro } from '../dados/cliente';
import { criarColecao, renomearColecao, useColecoes, useTags } from '../dados/consultas';
import {
  abrirDiretrizes,
  comFiltro,
  filtrar,
  navegar,
  semPrompt,
  useNavegacao,
  type Filtro,
} from '../navegacao';
import { SEM_COLECAO } from '../textos';
import { definirPreferencia, usePreferenciaTema, type PreferenciaTema } from '../tema';
import { Icone, type NomeIcone } from './Icone';
import { toast } from './Toaster';

function Item({
  icone,
  rotulo,
  total,
  ativo,
  onClick,
  children,
}: {
  icone?: NomeIcone;
  rotulo: string;
  total?: number | undefined;
  ativo: boolean;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <li className="group relative">
      <button
        type="button"
        aria-current={ativo}
        onClick={onClick}
        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
          ativo ? 'bg-realce font-medium text-texto' : 'text-texto/85 hover:bg-realce/60'
        }`}
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

  return (
    <nav aria-label="Coleções e Tags" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <div className="flex size-7 items-center justify-center rounded-lg bg-terracota text-white">
          <Icone nome="livro" className="size-4" />
        </div>
        <h1 className="font-serif text-base font-semibold">Biblioteca de Prompts</h1>
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
          />
        </ul>

        <div className="mt-5 mb-1 flex items-center justify-between px-2.5">
          <h2 className="text-xs font-semibold tracking-wide text-suave uppercase">Coleções</h2>
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
              >
                <button
                  type="button"
                  className="botao-icone absolute top-1/2 right-1 size-6 -translate-y-1/2 bg-realce opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
                  aria-label={`Renomear a Coleção ${c.nome}`}
                  title="Renomear"
                  onClick={() => setRenomeando(c.nome)}
                >
                  <Icone nome="lapis" className="size-3.5" />
                </button>
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

        <h2 className="mt-5 mb-1 px-2.5 text-xs font-semibold tracking-wide text-suave uppercase">
          Tags
        </h2>
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
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors ${
              nav.vista === 'diretrizes' ? 'bg-realce font-medium' : 'hover:bg-realce/60'
            }`}
          >
            <Icone nome="livro" className="size-4 text-suave" />
            Diretrizes
          </button>
          <div
            role="radiogroup"
            aria-label="Tema"
            className="flex shrink-0 rounded-lg border border-borda bg-elevada p-0.5"
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
                  tema === t.valor ? 'bg-realce text-terracota' : 'text-suave hover:text-texto'
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
