import { useCallback, useEffect, useState } from 'react';

import { useEventos } from './dados/eventos';
import { ConfirmarSaida } from './componentes/Confirmacao';
import { Diretrizes } from './componentes/Diretrizes';
import { EstadoVazio } from './componentes/EstadoVazio';
import { FormularioVariaveis } from './componentes/FormularioVariaveis';
import { Layout } from './componentes/Layout';
import { ListaPrompts } from './componentes/ListaPrompts';
import { Navegacao } from './componentes/Navegacao';
import { NovoPrompt } from './componentes/NovoPrompt';
import { PainelPrompt } from './componentes/PainelPrompt';
import { Paleta, usePaletaAtalho } from './componentes/Paleta';
import {
  confirmarSaida,
  navegacaoAtual,
  registrarPergunta,
  useNavegacao,
  type EscolhaSaida,
} from './navegacao';
import { TECLA_MOD } from './textos';

/** O diálogo "Descartar alterações?", ligado ao `confirmarSaida` da navegação. */
function useConfirmacaoDeSaida() {
  const [pendente, setPendente] = useState<((e: EscolhaSaida) => void) | null>(null);
  useEffect(
    () =>
      registrarPergunta(() => new Promise<EscolhaSaida>((resolve) => setPendente(() => resolve))),
    [],
  );
  const escolher = (escolha: EscolhaSaida) => {
    pendente?.(escolha);
    setPendente(null);
  };
  return { aberta: pendente !== null, escolher };
}

export function App() {
  useEventos();
  const nav = useNavegacao();
  const [gaveta, setGaveta] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [novo, setNovo] = useState<{ colecao: string | null } | null>(null);
  const saida = useConfirmacaoDeSaida();

  const abrirPaleta = useCallback(() => setPaleta(true), []);
  const fecharGaveta = useCallback(() => setGaveta(false), []);
  usePaletaAtalho(abrirPaleta);

  const abrirNovo = () => {
    setGaveta(false);
    void confirmarSaida(() => setNovo({ colecao: navegacaoAtual().colecao ?? null }));
  };

  const principalAberto = nav.vista === 'diretrizes' || nav.p !== undefined;
  const principal =
    nav.vista === 'diretrizes' ? (
      <Diretrizes />
    ) : nav.p ? (
      <PainelPrompt key={nav.p} id={nav.p} />
    ) : (
      <EstadoVazio icone="livro" titulo="Nenhum Prompt aberto">
        <p>
          Escolha um Prompt na lista para ver e editar. Use{' '}
          <kbd className="font-semibold text-texto">{TECLA_MOD}+K</kbd> para buscar e copiar de
          qualquer lugar.
        </p>
      </EstadoVazio>
    );

  return (
    <>
      <Layout
        navegacao={<Navegacao onEscolher={fecharGaveta} onNovoPrompt={abrirNovo} />}
        lista={<ListaPrompts onAbrirMenu={() => setGaveta(true)} />}
        principal={principal}
        principalAberto={principalAberto}
        gavetaAberta={gaveta}
        onFecharGaveta={fecharGaveta}
      />
      <Paleta aberta={paleta} onFechar={() => setPaleta(false)} />
      <FormularioVariaveis />
      <NovoPrompt
        aberto={novo !== null}
        colecaoInicial={novo?.colecao ?? null}
        onFechar={() => setNovo(null)}
      />
      <ConfirmarSaida aberto={saida.aberta} onEscolher={saida.escolher} />
    </>
  );
}
