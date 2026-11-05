import { useCallback, useEffect, useRef, useState } from 'react';

import { toast } from './componentes/Toaster';
import { salvarRascunhoAnalise, type Analise } from './dados/analise';
import { mensagemDeErro } from './dados/cliente';

export const ESPERA_RASCUNHO_MS = 400;

/** Envio que sobrevive ao fechamento da aba (o `fetch` comum é cancelado). */
function enviarAoSair(id: string, rascunho: string): void {
  void fetch(`/api/prompts/${encodeURIComponent(id)}/analise/rascunho`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rascunho }),
    keepalive: true,
  }).catch(() => undefined);
}

/**
 * O Rascunho da Análise no editor principal. A tela é a dona do texto: as edições vão ao
 * servidor por `PUT .../rascunho` com espera de 400 ms, e `flush` manda o que estiver pendente
 * (antes de aceitar, rejeitar, regenerar, concluir e no Ctrl+S). O texto do servidor só entra
 * ao abrir a Análise e por `adotar`, com a resposta de uma ação (aceitar muda o Rascunho).
 */
export function useRascunhoAnalise(id: string, analise: Analise | null) {
  const [texto, setTexto] = useState<string | null>(analise?.rascunho ?? null);
  // Análise que originou o texto (por `criadaEm`): trocou, o texto vem do servidor.
  const [origem, setOrigem] = useState<string | null>(analise?.criadaEm ?? null);
  const atual = analise?.criadaEm ?? null;
  if (atual !== origem) {
    setOrigem(atual);
    setTexto(analise?.rascunho ?? null);
  }

  const pendente = useRef<string | null>(null);
  const espera = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emVoo = useRef<Promise<boolean> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(espera.current);
    while (emVoo.current) await emVoo.current;
    const enviado = pendente.current;
    if (enviado === null) return true;
    pendente.current = null;
    const pedido = salvarRascunhoAnalise(id, enviado)
      .then(
        () => true,
        (erro: unknown) => {
          // Volta para a fila, a não ser que já haja um texto mais novo.
          pendente.current ??= enviado;
          toast.erro(`Não foi possível salvar o Rascunho: ${mensagemDeErro(erro)}`);
          return false;
        },
      )
      .finally(() => {
        emVoo.current = null;
      });
    emVoo.current = pedido;
    return pedido;
  }, [id]);

  const mudar = useCallback(
    (novo: string) => {
      setTexto(novo);
      pendente.current = novo;
      clearTimeout(espera.current);
      espera.current = setTimeout(() => void flush(), ESPERA_RASCUNHO_MS);
    },
    [flush],
  );

  /** Adota o Rascunho devolvido por uma ação (feita depois de um `flush`). */
  const adotar = useCallback((a: Analise) => {
    clearTimeout(espera.current);
    pendente.current = null;
    setTexto(a.rascunho);
  }, []);

  // Trocar de Prompt ou fechar a aba manda o que faltar.
  useEffect(() => {
    const aoSair = () => {
      if (pendente.current !== null) enviarAoSair(id, pendente.current);
      pendente.current = null;
    };
    window.addEventListener('pagehide', aoSair);
    return () => {
      window.removeEventListener('pagehide', aoSair);
      clearTimeout(espera.current);
      aoSair();
    };
  }, [id]);

  return { texto, mudar, flush, adotar };
}
