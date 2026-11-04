import { Command } from 'cmdk';
import { useEffect, useState } from 'react';

import { mensagemDeErro, type Resumo } from '../dados/cliente';
import { copiarPrompt, usePrompts } from '../dados/consultas';
import { abrirPrompt } from '../navegacao';
import { SEM_COLECAO, TECLA_MOD } from '../textos';
import { Dialogo } from './Dialogo';
import { Icone } from './Icone';
import { toast } from './Toaster';

/** Abre a paleta com Ctrl+K, inclusive com o foco no CodeMirror (listener em captura). */
export function usePaletaAtalho(abrir: () => void): void {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        abrir();
      }
    };
    window.addEventListener('keydown', aoTeclar, { capture: true });
    return () => window.removeEventListener('keydown', aoTeclar, { capture: true });
  }, [abrir]);
}

/** Paleta Ctrl+K (decisão 25): busca no servidor; Enter copia, Ctrl+Enter abre. */
export function Paleta({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  return (
    <Dialogo
      aberto={aberta}
      onFechar={onFechar}
      rotulo="Buscar e copiar Prompt"
      className="mt-[12vh] mb-auto w-[min(40rem,calc(100vw-2rem))]"
    >
      {aberta && <Conteudo onFechar={onFechar} />}
    </Dialogo>
  );
}

function Conteudo({ onFechar }: { onFechar: () => void }) {
  const [texto, setTexto] = useState('');
  const [q, setQ] = useState('');
  const [selecionado, setSelecionado] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 120);
    return () => clearTimeout(t);
  }, [texto]);

  const consulta = usePrompts(q ? { q } : {});
  const lista = consulta.data?.prompts ?? [];
  // Sem busca, os Favoritos primeiro (mantendo a ordem do servidor dentro de cada grupo).
  const prompts: Resumo[] = q
    ? lista
    : [...lista.filter((p) => p.favorito), ...lista.filter((p) => !p.favorito)];

  // Com a busca no servidor, o cmdk não reescolhe quando a lista muda: a seleção cai no primeiro.
  const valor = prompts.some((p) => p.id === selecionado) ? selecionado : (prompts[0]?.id ?? '');

  async function copiar(p: Resumo) {
    onFechar();
    try {
      await copiarPrompt(p.id);
      toast.sucesso(`Copiado: ${p.titulo}`);
    } catch (erro) {
      toast.erro(`Não foi possível copiar: ${mensagemDeErro(erro)}`);
    }
  }

  function abrir(id: string) {
    onFechar();
    abrirPrompt(id);
  }

  return (
    <Command
      shouldFilter={false}
      loop
      value={valor}
      onValueChange={setSelecionado}
      label="Buscar e copiar Prompt"
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        if (valor) abrir(valor);
      }}
      className="flex max-h-[min(32rem,70dvh)] flex-col"
    >
      <div className="flex items-center gap-2 border-b border-borda px-4">
        <Icone nome="busca" className="size-4 text-suave" />
        <Command.Input
          data-autofocus
          value={texto}
          onValueChange={setTexto}
          placeholder="Buscar Prompt para copiar…"
          className="h-12 flex-1 bg-transparent text-base placeholder:text-suave focus:outline-none"
        />
      </div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
        {consulta.isError && (
          <p className="p-4 text-sm text-perigo">{mensagemDeErro(consulta.error)}</p>
        )}
        {consulta.isSuccess && prompts.length === 0 && (
          <Command.Empty className="p-6 text-center text-sm text-suave">
            {q ? `Nada encontrado para "${q}".` : 'O acervo está vazio.'}
          </Command.Empty>
        )}
        {prompts.map((p) => (
          <Command.Item
            key={p.id}
            value={p.id}
            onSelect={() => void copiar(p)}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.titulo}</span>
              <span className="block truncate text-xs text-suave">
                {p.colecao ?? SEM_COLECAO}
                {p.tags.length > 0 && ` · ${p.tags.join(', ')}`}
              </span>
            </span>
            {p.favorito && (
              <Icone nome="estrela" preenchido className="size-3.5 shrink-0 text-terracota" />
            )}
          </Command.Item>
        ))}
      </Command.List>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-borda px-4 py-2 text-xs text-suave">
        <span>
          <kbd className="font-sans font-semibold text-texto">Enter</kbd> copia
        </span>
        <span>
          <kbd className="font-sans font-semibold text-texto">{TECLA_MOD}+Enter</kbd> abre
        </span>
        <span>
          <kbd className="font-sans font-semibold text-texto">Esc</kbd> fecha
        </span>
      </div>
    </Command>
  );
}
