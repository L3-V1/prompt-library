import { useState } from 'react';

import type { Change } from '../dados/cliente';
import { semDiferencas } from '../diff-lado-a-lado';
import { DiffLadoALado } from './DiffLadoALado';
import { Dialogo } from './Dialogo';

/** Título e Tags dos dois lados, para quando o corpo é igual. */
export interface MetadadosConflito {
  meu: { titulo: string; tags: string[] };
  disco: { titulo: string; tags: string[] };
}

export interface DadosConflito {
  diff: Change[];
  metadados?: MetadadosConflito;
}

function Metadado({ rotulo, a, b }: { rotulo: string; a: string; b: string }) {
  const mudou = a !== b;
  return (
    <tr>
      <th className="py-1.5 pr-4 text-left align-top font-medium text-suave">{rotulo}</th>
      <td className={`rounded px-2 py-1.5 ${mudou ? 'bg-diff-rem' : ''}`}>{a || '(nenhuma)'}</td>
      <td className={`rounded px-2 py-1.5 ${mudou ? 'bg-diff-add' : ''}`}>{b || '(nenhuma)'}</td>
    </tr>
  );
}

/**
 * Conflito ao salvar (decisão 10): o arquivo mudou no disco desde que foi aberto. Oferece
 * recarregar, sobrescrever ou ver o diff (o seu texto à esquerda, o do disco à direita).
 */
export function ModalConflito({
  aberto,
  conflito,
  titulo,
  onRecarregar,
  onSobrescrever,
  onFechar,
}: {
  aberto: boolean;
  conflito: DadosConflito | null;
  titulo: string;
  onRecarregar: () => void;
  onSobrescrever: () => void;
  onFechar: () => void;
}) {
  const [verDiff, setVerDiff] = useState(false);
  const fechar = () => {
    setVerDiff(false);
    onFechar();
  };
  const textoIgual = conflito ? semDiferencas(conflito.diff) : true;
  const meta = conflito?.metadados;

  return (
    <Dialogo
      aberto={aberto}
      onFechar={fechar}
      titulo={titulo}
      className={verDiff ? 'w-[min(72rem,calc(100vw-2rem))]' : 'w-[min(34rem,calc(100vw-2rem))]'}
    >
      <div className="flex min-h-0 flex-col gap-4 px-6 pt-1 pb-5 text-sm">
        <p className="text-suave">
          O arquivo foi alterado fora do app (no Obsidian ou por uma Captura) depois que você o
          abriu. Escolha o que fazer com as suas alterações.
        </p>
        {verDiff && conflito && (
          <>
            {textoIgual ? (
              <div className="rounded-lg border border-borda bg-superficie p-4">
                <p className="mb-3">
                  O texto é igual nos dois lados; a diferença está no título ou nas Tags.
                </p>
                {meta && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-suave">
                        <th />
                        <th className="px-2 pb-1 text-left font-medium">Suas alterações</th>
                        <th className="px-2 pb-1 text-left font-medium">No disco</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Metadado rotulo="Título" a={meta.meu.titulo} b={meta.disco.titulo} />
                      <Metadado
                        rotulo="Tags"
                        a={meta.meu.tags.join(', ')}
                        b={meta.disco.tags.join(', ')}
                      />
                    </tbody>
                  </table>
                )}
              </div>
            ) : (
              <div className="flex max-h-[55dvh] min-h-0 flex-col">
                <DiffLadoALado
                  diff={conflito.diff}
                  rotuloEsquerda="Suas alterações"
                  rotuloDireita="No disco"
                />
              </div>
            )}
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-borda px-6 py-4">
        {!verDiff && (
          <button type="button" className="botao mr-auto" onClick={() => setVerDiff(true)}>
            Ver diferenças
          </button>
        )}
        <button
          type="button"
          className="botao"
          onClick={() => {
            setVerDiff(false);
            onRecarregar();
          }}
        >
          Recarregar do disco
        </button>
        <button
          type="button"
          className="botao-perigo"
          onClick={() => {
            setVerDiff(false);
            onSobrescrever();
          }}
        >
          Sobrescrever
        </button>
      </div>
    </Dialogo>
  );
}
