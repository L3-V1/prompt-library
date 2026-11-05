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
      <th className="py-2 pr-3 text-left align-top font-medium text-suave">{rotulo}</th>
      <td className={`rounded px-3 py-2 ${mudou ? 'bg-diff-rem' : ''}`}>{a || '(nenhuma)'}</td>
      <td className={`rounded px-3 py-2 ${mudou ? 'bg-diff-add' : ''}`}>{b || '(nenhuma)'}</td>
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
  descricao = 'O arquivo foi alterado fora do app (no Obsidian ou por uma Captura) depois que você o abriu. Escolha o que fazer com as suas alterações.',
  onRecarregar,
  onSobrescrever,
  onFechar,
}: {
  aberto: boolean;
  conflito: DadosConflito | null;
  titulo: string;
  descricao?: string;
  /** Sem ele, o botão vira "Cancelar" (concluir a Análise: o Rascunho fica). */
  onRecarregar?: () => void;
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
      <div className="corpo-modal flex min-h-0 flex-col gap-4 text-sm">
        <p className="text-suave">{descricao}</p>
        {verDiff && conflito && (
          <>
            {textoIgual ? (
              <div className="cartao bg-superficie">
                <p className="mb-3">
                  O texto é igual nos dois lados; a diferença está no título ou nas Tags.
                </p>
                {meta && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-suave">
                        <th />
                        <th className="px-3 pb-1 text-left font-medium">Suas alterações</th>
                        <th className="px-3 pb-1 text-left font-medium">No disco</th>
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
      <div className="rodape-modal">
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
            if (onRecarregar) onRecarregar();
            else onFechar();
          }}
        >
          {onRecarregar ? 'Recarregar do disco' : 'Cancelar'}
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
