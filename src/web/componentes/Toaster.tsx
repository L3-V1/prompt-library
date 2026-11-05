import { useSyncExternalStore } from 'react';

import { Icone } from './Icone';

type TipoAviso = 'sucesso' | 'erro' | 'info';

interface Aviso {
  id: number;
  tipo: TipoAviso;
  texto: string;
}

let avisos: Aviso[] = [];
let proximoId = 1;
const ouvintes = new Set<() => void>();

function publicar(novos: Aviso[]): void {
  avisos = novos;
  for (const ouvinte of ouvintes) ouvinte();
}

function fechar(id: number): void {
  publicar(avisos.filter((a) => a.id !== id));
}

function mostrar(tipo: TipoAviso, texto: string): void {
  const id = proximoId++;
  publicar([...avisos.slice(-3), { id, tipo, texto }]);
  setTimeout(() => fechar(id), tipo === 'erro' ? 7000 : 3500);
}

/** Feedback de toda ação do usuário. */
export const toast = {
  sucesso: (texto: string) => mostrar('sucesso', texto),
  erro: (texto: string) => mostrar('erro', texto),
  info: (texto: string) => mostrar('info', texto),
};

function assinar(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

const ICONES = { sucesso: 'certo', erro: 'alerta', info: 'info' } as const;
const CORES = { sucesso: 'text-sucesso', erro: 'text-perigo', info: 'text-terracota' } as const;

export function Toaster() {
  const lista = useSyncExternalStore(assinar, () => avisos);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {lista.map((a) => (
        <div
          key={a.id}
          role={a.tipo === 'erro' ? 'alert' : 'status'}
          className="pointer-events-auto flex items-start gap-3 rounded-xl bg-elevada px-4 py-3 text-sm shadow-flutuante"
        >
          <Icone nome={ICONES[a.tipo]} className={`mt-0.5 size-4 shrink-0 ${CORES[a.tipo]}`} />
          <p className="min-w-0 flex-1 break-words">{a.texto}</p>
          <button
            type="button"
            className="botao-icone -my-1.5 -mr-2 size-7"
            aria-label="Fechar aviso"
            onClick={() => fechar(a.id)}
          >
            <Icone nome="x" className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
