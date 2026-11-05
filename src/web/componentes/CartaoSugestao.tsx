import { useState } from 'react';

import { miniDiff, ROTULO_STATUS } from '../analise-ui';
import type { Sugestao } from '../dados/analise';
import { Icone } from './Icone';

const SELO: Record<Sugestao['status'], string> = {
  pendente: 'bg-realce text-suave',
  aceita: 'bg-diff-add text-sucesso',
  rejeitada: 'bg-realce text-suave',
  desatualizada: 'bg-perigo-fundo text-perigo',
};

function MiniDiff({ original, novo }: { original: string; novo: string }) {
  return (
    <p className="rounded-lg border border-borda bg-fundo px-3 py-2 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
      {miniDiff(original, novo).map((p, i) =>
        p.tipo === 'igual' ? (
          <span key={i}>{p.texto}</span>
        ) : p.tipo === 'removido' ? (
          <del key={i} className="rounded-sm bg-diff-rem-forte/70 text-texto line-through">
            {p.texto}
          </del>
        ) : (
          <ins key={i} className="rounded-sm bg-diff-add-forte/70 text-texto no-underline">
            {p.texto}
          </ins>
        ),
      )}
    </p>
  );
}

/**
 * Uma Sugestão: justificativa, mini-diff por palavra e as ações do status. Passar o mouse ou
 * focar destaca o trecho no editor. Aceitas e rejeitadas ficam recolhidas.
 */
export function CartaoSugestao({
  sugestao,
  ocupado,
  regenerando,
  onAceitar,
  onRejeitar,
  onRegenerar,
  onDestacar,
}: {
  sugestao: Sugestao;
  /** Outra ação ou geração em andamento: os botões ficam desabilitados. */
  ocupado: boolean;
  regenerando: boolean;
  onAceitar: () => void;
  onRejeitar: () => void;
  onRegenerar: () => void;
  onDestacar: (ativo: boolean) => void;
}) {
  const decidida = sugestao.status === 'aceita' || sugestao.status === 'rejeitada';
  const [expandida, setExpandida] = useState(false);
  const recolhida = decidida && !expandida;
  const destacavel = sugestao.status === 'pendente';

  return (
    <li
      className={`rounded-xl border bg-elevada transition-[border-color,box-shadow] ${
        regenerando ? 'border-terracota' : 'border-borda'
      } ${destacavel ? 'hover:border-borda-forte hover:shadow-cartao focus-within:border-borda-forte' : ''} ${
        decidida ? 'opacity-80' : ''
      }`}
      onMouseEnter={() => destacavel && onDestacar(true)}
      onMouseLeave={() => destacavel && onDestacar(false)}
      onFocus={() => destacavel && onDestacar(true)}
      onBlur={(e) => {
        if (destacavel && !e.currentTarget.contains(e.relatedTarget)) onDestacar(false);
      }}
    >
      <div className="flex items-start gap-2 px-4 pt-4 pb-2">
        <span
          className={`selo mt-0.5 shrink-0 px-2 text-[11px] font-medium ${SELO[sugestao.status]}`}
        >
          {ROTULO_STATUS[sugestao.status]}
        </span>
        <p
          className={`min-w-0 flex-1 text-sm ${recolhida ? 'truncate text-suave' : ''}`}
          title={recolhida ? sugestao.justificativa : undefined}
        >
          {sugestao.justificativa || 'Sem justificativa.'}
        </p>
        {decidida && (
          <button
            type="button"
            className="botao-icone -my-1 -mr-2 size-7"
            aria-expanded={expandida}
            aria-label={expandida ? 'Recolher' : 'Ver a Sugestão'}
            onClick={() => setExpandida((v) => !v)}
          >
            <Icone nome="voltar" className={`size-3.5 ${expandida ? 'rotate-90' : '-rotate-90'}`} />
          </button>
        )}
      </div>

      {!recolhida && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          <MiniDiff original={sugestao.trechoOriginal} novo={sugestao.trechoNovo} />
          {sugestao.status === 'desatualizada' && (
            <p className="text-xs text-suave">
              O trecho original não existe mais no Rascunho. Regenere para uma Sugestão nova ou
              rejeite.
            </p>
          )}
          {regenerando ? (
            <p className="text-xs text-terracota" role="status">
              Regenerando esta Sugestão…
            </p>
          ) : (
            !decidida && (
              <div className="flex flex-wrap gap-2">
                {sugestao.status === 'pendente' && (
                  <button
                    type="button"
                    className="botao-primario"
                    disabled={ocupado}
                    onClick={onAceitar}
                  >
                    <Icone nome="certo" className="size-3.5" />
                    Aceitar
                  </button>
                )}
                <button type="button" className="botao" disabled={ocupado} onClick={onRejeitar}>
                  <Icone nome="x" className="size-3.5" />
                  Rejeitar
                </button>
                <button
                  type="button"
                  className="botao"
                  disabled={ocupado}
                  onClick={onRegenerar}
                  title="Pedir outra Sugestão para este trecho"
                >
                  <Icone nome="recarregar" className="size-3.5" />
                  Regenerar
                </button>
              </div>
            )
          )}
        </div>
      )}
    </li>
  );
}
