import { useEffect, useRef, useState } from 'react';

import { useAnalisesAbertas } from '../dados/analise';
import { mensagemDeErro } from '../dados/cliente';
import { filtrosDe, usePrompts } from '../dados/consultas';
import { abrirPrompt, buscarTexto, useNavegacao, type Navegacao } from '../navegacao';
import { ANALISE_EM_ANDAMENTO, SEM_COLECAO, TECLA_MOD } from '../textos';
import { EstadoVazio } from './EstadoVazio';
import { Icone } from './Icone';

function tituloDoFiltro(nav: Navegacao): string {
  if (nav.favoritos) return 'Favoritos';
  if (nav.tag) return `#${nav.tag}`;
  if (nav.colecao === null) return SEM_COLECAO;
  if (nav.colecao !== undefined) return nav.colecao;
  return 'Todos os Prompts';
}

/** Painel 2: busca e lista dos Prompts do filtro. */
export function ListaPrompts({ onAbrirMenu }: { onAbrirMenu: () => void }) {
  const nav = useNavegacao();
  const [texto, setTexto] = useState(nav.q);
  // A busca mudou por fora (voltar do navegador): o campo acompanha.
  const [qVisto, setQVisto] = useState(nav.q);
  if (nav.q !== qVisto) {
    setQVisto(nav.q);
    setTexto(nav.q);
  }
  const lista = useRef<HTMLUListElement>(null);

  // Busca com debounce de 200 ms; a URL guarda o termo.
  useEffect(() => {
    if (texto === nav.q) return;
    const t = setTimeout(() => buscarTexto(texto), 200);
    return () => clearTimeout(t);
  }, [texto, nav.q]);

  const consulta = usePrompts(filtrosDe(nav));
  const abertas = new Set(useAnalisesAbertas().data);
  const prompts = consulta.data?.prompts ?? [];
  const problemas = consulta.data?.problemas ?? [];
  const semFiltro = !nav.q && !nav.tag && !nav.favoritos && nav.colecao === undefined;

  const focarItem = (i: number) => {
    const botoes = lista.current?.querySelectorAll<HTMLButtonElement>('button[data-item]');
    if (!botoes || botoes.length === 0) return;
    botoes[Math.max(0, Math.min(i, botoes.length - 1))]?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-borda px-3 pt-3 pb-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="botao-icone lg:hidden"
            aria-label="Abrir Coleções e Tags"
            onClick={onAbrirMenu}
          >
            <Icone nome="menu" />
          </button>
          <h2 className="min-w-0 flex-1 truncate px-1 font-serif text-base font-semibold">
            {tituloDoFiltro(nav)}
          </h2>
          <span className="px-1 text-xs text-suave">{consulta.data && prompts.length}</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar Prompts</span>
          <Icone
            nome="busca"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-suave"
          />
          <input
            type="search"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                focarItem(0);
              } else if (e.key === 'Enter' && prompts[0]) {
                abrirPrompt(prompts[0].id);
              }
            }}
            placeholder={`Buscar (${TECLA_MOD}+K copia)`}
            className="campo pl-8"
          />
        </label>
      </div>

      {problemas.length > 0 && (
        <details className="border-b border-borda px-4 py-2 text-xs text-suave">
          <summary className="cursor-pointer select-none">
            <Icone nome="alerta" className="mr-1 inline size-3.5 text-terracota" />
            {problemas.length === 1
              ? '1 arquivo não pôde ser lido'
              : `${problemas.length} arquivos não puderam ser lidos`}
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {problemas.map((p) => (
              <li key={p.caminho}>
                <code className="break-all text-texto">{p.caminho}</code>
                <div>{p.mensagem}</div>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {consulta.isPending ? (
          <p className="p-4 text-sm text-suave">Carregando…</p>
        ) : consulta.isError ? (
          <p className="p-4 text-sm text-perigo">{mensagemDeErro(consulta.error)}</p>
        ) : prompts.length === 0 ? (
          semFiltro ? (
            <EstadoVazio icone="inbox" titulo="O acervo está vazio">
              <p>
                Crie o primeiro com <strong className="text-texto">Novo Prompt</strong> ou capture
                um prompt numa conversa com o comando <code>/save</code>.
              </p>
            </EstadoVazio>
          ) : (
            <EstadoVazio icone="busca" titulo="Nenhum resultado">
              <p>
                {nav.q
                  ? `Nada encontrado para "${nav.q}" neste filtro.`
                  : 'Nenhum Prompt neste filtro.'}
              </p>
            </EstadoVazio>
          )
        ) : (
          <ul
            ref={lista}
            className="flex flex-col gap-0.5 p-2"
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              const botoes = [
                ...(lista.current?.querySelectorAll<HTMLButtonElement>('button[data-item]') ?? []),
              ];
              const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
              e.preventDefault();
              focarItem(e.key === 'ArrowDown' ? i + 1 : i - 1);
            }}
          >
            {prompts.map((p) => {
              const aberto = nav.p === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    data-item
                    aria-current={aberto}
                    onClick={() => abrirPrompt(p.id)}
                    className={`flex w-full flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      aberto ? 'bg-realce' : 'hover:bg-realce/60'
                    }`}
                  >
                    <span className="flex w-full items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {p.titulo}
                      </span>
                      {abertas.has(p.id) && (
                        <span
                          role="img"
                          title={ANALISE_EM_ANDAMENTO}
                          aria-label={ANALISE_EM_ANDAMENTO}
                          className="mt-0.5 shrink-0 text-terracota"
                        >
                          <Icone nome="faisca" className="size-3.5" />
                        </span>
                      )}
                      {p.favorito && (
                        <span
                          role="img"
                          title="Favorito"
                          aria-label="Favorito"
                          className="mt-0.5 shrink-0 text-terracota"
                        >
                          <Icone nome="estrela" preenchido className="size-3.5" />
                        </span>
                      )}
                    </span>
                    <span className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-suave">
                      <span className="max-w-full truncate">{p.colecao ?? SEM_COLECAO}</span>
                      {p.tags.map((t) => (
                        <span key={t} className="selo max-w-40 bg-realce" title={t}>
                          {t}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
