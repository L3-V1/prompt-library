import { useId, useState } from 'react';

import { Icone } from './Icone';

/** Tags como chips, com sugestão das Tags existentes. Enter ou vírgula adiciona. */
export function CampoTags({
  tags,
  sugestoes,
  onMudar,
  somenteLeitura = false,
}: {
  tags: string[];
  sugestoes: string[];
  onMudar: (tags: string[]) => void;
  /** Só mostra as Tags (durante a Análise). */
  somenteLeitura?: boolean;
}) {
  const [texto, setTexto] = useState('');
  const idLista = useId();

  const adicionar = (valor: string) => {
    const tag = valor.trim().replace(/^#/, '');
    setTexto('');
    if (!tag || tags.some((t) => t.toLowerCase() === tag.toLowerCase())) return;
    onMudar([...tags, tag]);
  };

  const disponiveis = sugestoes.filter((s) => !tags.includes(s));

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-realce py-0.5 pr-1 pl-2.5 text-xs whitespace-nowrap"
        >
          <span className="max-w-48 truncate" title={tag}>
            {tag}
          </span>
          {!somenteLeitura && (
            <button
              type="button"
              className="shrink-0 rounded-full p-0.5 text-suave hover:bg-borda hover:text-texto"
              aria-label={`Remover a Tag ${tag}`}
              onClick={() => onMudar(tags.filter((t) => t !== tag))}
            >
              <Icone nome="x" className="size-3" />
            </button>
          )}
        </span>
      ))}
      {somenteLeitura ? (
        tags.length === 0 && <span className="text-xs text-suave">Sem Tags</span>
      ) : (
        <input
          value={texto}
          list={idLista}
          aria-label="Adicionar Tag"
          placeholder={tags.length === 0 ? 'Adicionar Tags' : '+ Tag'}
          className="w-24 min-w-0 flex-1 bg-transparent py-0.5 text-xs placeholder:text-suave focus:outline-none"
          onChange={(e) => {
            const valor = e.target.value;
            if (valor.endsWith(',')) adicionar(valor.slice(0, -1));
            else setTexto(valor);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              adicionar(texto);
            } else if (e.key === 'Backspace' && texto === '' && tags.length > 0) {
              onMudar(tags.slice(0, -1));
            }
          }}
          onBlur={() => {
            if (texto.trim()) adicionar(texto);
          }}
        />
      )}
      <datalist id={idLista}>
        {disponiveis.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
