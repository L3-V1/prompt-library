import type { Change } from '../dados/cliente';
import { linhasLadoALado, type Lado, type LinhaDiff } from '../diff-lado-a-lado';

const FUNDO = {
  igual: ['', ''],
  alterada: ['bg-diff-rem', 'bg-diff-add'],
  removida: ['bg-diff-rem', 'bg-realce/50'],
  adicionada: ['bg-realce/50', 'bg-diff-add'],
} as const satisfies Record<LinhaDiff['tipo'], readonly [string, string]>;

function Celula({
  lado,
  fundo,
  mudou,
  divisoria = false,
}: {
  lado: Lado | undefined;
  fundo: string;
  mudou: boolean;
  divisoria?: boolean;
}) {
  return (
    <>
      <td
        className={`px-2 text-right align-top text-suave select-none ${divisoria ? 'border-l border-borda' : ''} ${fundo}`}
      >
        {lado?.n}
      </td>
      <td className={`px-3 align-top break-words whitespace-pre-wrap ${fundo}`}>
        {lado?.texto}
        {lado?.semQuebraFinal && mudou && (
          <span className="ml-2 rounded bg-realce px-1 font-sans text-[11px] text-suave">
            sem quebra de linha no final
          </span>
        )}
      </td>
    </>
  );
}

/** Diff por linhas em duas colunas, a partir do `Change[]` do servidor. */
export function DiffLadoALado({
  diff,
  rotuloEsquerda,
  rotuloDireita,
}: {
  diff: readonly Change[];
  rotuloEsquerda: string;
  rotuloDireita: string;
}) {
  const linhas = linhasLadoALado(diff);
  return (
    <div className="min-h-0 overflow-auto rounded-lg border border-borda bg-fundo">
      <table className="w-full table-fixed border-collapse font-mono text-[12.5px] leading-relaxed">
        <colgroup>
          <col className="w-10" />
          <col />
          <col className="w-10" />
          <col />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-superficie font-sans text-xs text-suave">
          <tr>
            <th colSpan={2} className="border-b border-borda px-3 py-2 text-left font-medium">
              {rotuloEsquerda}
            </th>
            <th
              colSpan={2}
              className="border-b border-l border-borda px-3 py-2 text-left font-medium"
            >
              {rotuloDireita}
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => {
            const [esq, dir] = FUNDO[l.tipo];
            const mudou = l.tipo !== 'igual';
            return (
              <tr key={i}>
                <Celula lado={l.esquerda} fundo={esq} mudou={mudou} />
                <Celula lado={l.direita} fundo={dir} mudou={mudou} divisoria />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
