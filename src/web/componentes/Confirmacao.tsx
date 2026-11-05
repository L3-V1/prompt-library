import type { ReactNode } from 'react';

import { Dialogo } from './Dialogo';

/** Confirmação com a ação destrutiva destacada. */
export function Confirmacao({
  aberto,
  titulo,
  children,
  rotuloConfirmar,
  destrutiva = true,
  onConfirmar,
  onCancelar,
}: {
  aberto: boolean;
  titulo: string;
  children: ReactNode;
  rotuloConfirmar: string;
  destrutiva?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  return (
    <Dialogo aberto={aberto} onFechar={onCancelar} titulo={titulo}>
      <div className="corpo-modal text-sm text-suave">{children}</div>
      <div className="rodape-modal">
        <button type="button" className="botao" onClick={onCancelar} data-autofocus>
          Cancelar
        </button>
        <button
          type="button"
          className={destrutiva ? 'botao-perigo' : 'botao-primario'}
          onClick={onConfirmar}
        >
          {rotuloConfirmar}
        </button>
      </div>
    </Dialogo>
  );
}

/** "Descartar alterações?" ao sair com pendências (decisão 9). */
export function ConfirmarSaida({
  aberto,
  onEscolher,
}: {
  aberto: boolean;
  onEscolher: (escolha: 'salvar' | 'descartar' | 'continuar') => void;
}) {
  return (
    <Dialogo
      aberto={aberto}
      onFechar={() => onEscolher('continuar')}
      titulo="Descartar alterações?"
    >
      <div className="corpo-modal text-sm text-suave">
        Há alterações não salvas. Se sair agora sem salvar, elas serão perdidas.
      </div>
      <div className="rodape-modal">
        <button type="button" className="botao mr-auto" onClick={() => onEscolher('continuar')}>
          Continuar editando
        </button>
        <button type="button" className="botao-perigo" onClick={() => onEscolher('descartar')}>
          Descartar
        </button>
        <button
          type="button"
          className="botao-primario"
          onClick={() => onEscolher('salvar')}
          data-autofocus
        >
          Salvar
        </button>
      </div>
    </Dialogo>
  );
}
