import { useState } from 'react';

import { mensagemDeErro } from '../dados/cliente';
import { useDiff, useVersoes } from '../dados/consultas';
import { semDiferencas } from '../diff-lado-a-lado';
import { formatarData, MOTIVOS } from '../textos';
import { Confirmacao } from './Confirmacao';
import { DiffLadoALado } from './DiffLadoALado';
import { EstadoVazio } from './EstadoVazio';
import { Icone } from './Icone';

type Comparacao = 'atual' | 'anterior';

/** Gaveta das Versões sobre o painel 3: lista, diff lado a lado e restauração. */
export function PainelVersoes({
  id,
  pendente,
  onRestaurar,
  onFechar,
}: {
  id: string;
  pendente: boolean;
  onRestaurar: (versaoId: string) => Promise<boolean>;
  onFechar: () => void;
}) {
  const versoes = useVersoes(id);
  const lista = versoes.data ?? [];
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [comparacao, setComparacao] = useState<Comparacao>('atual');
  const [confirmar, setConfirmar] = useState(false);

  const indice = lista.findIndex((v) => v.id === escolhida);
  const versao = indice >= 0 ? lista[indice] : undefined;
  const anterior = indice >= 0 ? lista[indice + 1] : undefined;
  const modo: Comparacao = comparacao === 'anterior' && anterior ? 'anterior' : 'atual';

  // Esquerda sempre a mais antiga: anterior → escolhida, ou escolhida → atual.
  const diff = useDiff(
    id,
    versao ? (modo === 'anterior' && anterior ? anterior.id : versao.id) : null,
    modo === 'anterior' ? (versao?.id ?? 'atual') : 'atual',
  );

  const rotulo = (v: { criadaEm: string; motivo: keyof typeof MOTIVOS }) =>
    `${MOTIVOS[v.motivo]}, ${formatarData(v.criadaEm)}`;

  return (
    <aside
      aria-label="Versões"
      className="absolute inset-0 z-20 flex flex-col border-l border-borda bg-superficie shadow-flutuante lg:left-auto lg:w-[min(64rem,100%)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !confirmar) onFechar();
      }}
    >
      <div className="flex items-center gap-2 border-b border-borda px-4 py-3">
        <Icone nome="historico" className="size-4 text-terracota" />
        <h2 className="font-serif text-base font-semibold">Versões</h2>
        <span className="text-xs text-suave">{lista.length > 0 && `(${lista.length})`}</span>
        <button
          type="button"
          className="botao-icone ml-auto"
          aria-label="Fechar Versões"
          onClick={onFechar}
          autoFocus
        >
          <Icone nome="x" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Sem Versões, a lista some e fica só o estado vazio ao lado. */}
        <ol
          className={`max-h-48 shrink-0 overflow-y-auto border-b border-borda p-2 md:max-h-none md:w-64 md:border-r md:border-b-0 ${
            versoes.isSuccess && lista.length === 0 ? 'hidden' : ''
          }`}
        >
          {versoes.isPending && <li className="p-3 text-sm text-suave">Carregando…</li>}
          {versoes.isError && (
            <li className="p-3 text-sm text-perigo">{mensagemDeErro(versoes.error)}</li>
          )}
          {lista.map((v, i) => (
            <li key={v.id}>
              <button
                type="button"
                aria-current={v.id === escolhida}
                onClick={() => setEscolhida(v.id)}
                className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-realce ${
                  v.id === escolhida ? 'bg-realce' : ''
                }`}
              >
                <span className="font-medium">
                  {MOTIVOS[v.motivo]}
                  {i === 0 && (
                    <span className="selo ml-2 bg-elevada text-[11px] font-normal text-suave">
                      mais recente
                    </span>
                  )}
                </span>
                <span className="text-xs text-suave">{formatarData(v.criadaEm)}</span>
              </button>
            </li>
          ))}
        </ol>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 p-4">
          {versoes.isSuccess && lista.length === 0 ? (
            <EstadoVazio icone="historico" titulo="Ainda não há Versões">
              <p>A primeira é registrada no próximo salvamento.</p>
            </EstadoVazio>
          ) : !versao ? (
            <EstadoVazio icone="diff" titulo="Escolha uma Versão">
              <p>Veja o que mudou em relação ao texto atual ou à Versão anterior.</p>
            </EstadoVazio>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <div
                  role="radiogroup"
                  aria-label="Comparar com"
                  className="flex items-center gap-1 text-sm"
                >
                  <span className="mr-1 text-suave">Comparar com:</span>
                  {(['atual', 'anterior'] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={modo === c}
                      disabled={c === 'anterior' && !anterior}
                      onClick={() => setComparacao(c)}
                      className={`rounded-md px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        modo === c ? 'bg-elevada font-medium shadow-sm' : 'hover:bg-realce'
                      }`}
                    >
                      {c === 'atual' ? 'atual' : 'Versão anterior'}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {pendente && (
                    <span className="text-xs text-suave">
                      Salve ou descarte as alterações antes de restaurar.
                    </span>
                  )}
                  <button
                    type="button"
                    className="botao"
                    disabled={pendente}
                    onClick={() => setConfirmar(true)}
                  >
                    Restaurar esta Versão
                  </button>
                </div>
              </div>
              {diff.isError ? (
                <p className="text-sm text-perigo">{mensagemDeErro(diff.error)}</p>
              ) : !diff.data ? (
                <p className="text-sm text-suave">Carregando…</p>
              ) : semDiferencas(diff.data) ? (
                <p className="rounded-lg border border-borda bg-fundo p-4 text-sm text-suave">
                  Sem diferenças: {modo === 'atual' ? 'o arquivo atual' : 'a Versão anterior'} é
                  igual a esta Versão.
                </p>
              ) : (
                <DiffLadoALado
                  diff={diff.data}
                  rotuloEsquerda={
                    modo === 'anterior' && anterior ? rotulo(anterior) : rotulo(versao)
                  }
                  rotuloDireita={modo === 'anterior' ? rotulo(versao) : 'Atual (no disco)'}
                />
              )}
            </>
          )}
        </div>
      </div>

      <Confirmacao
        aberto={confirmar}
        titulo="Restaurar esta Versão?"
        rotuloConfirmar="Restaurar"
        destrutiva={false}
        onCancelar={() => setConfirmar(false)}
        onConfirmar={() => {
          setConfirmar(false);
          if (versao) void onRestaurar(versao.id).then((ok) => ok && setEscolhida(null));
        }}
      >
        <p>
          O título, as Tags e o texto voltam ao estado de{' '}
          {versao && <strong className="text-texto">{rotulo(versao)}</strong>}. O estado atual
          continua guardado nas Versões, e a restauração cria uma Versão nova.
        </p>
      </Confirmacao>
    </aside>
  );
}
