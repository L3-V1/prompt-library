import { useState } from 'react';

import { mensagemDeErro } from '../dados/cliente';
import { criarPrompt, useColecoes } from '../dados/consultas';
import { abrirPrompt } from '../navegacao';
import { SEM_COLECAO } from '../textos';
import { Dialogo } from './Dialogo';
import { toast } from './Toaster';

/** Diálogo "Novo Prompt": título e Coleção; cria com corpo vazio e abre. */
export function NovoPrompt({
  aberto,
  colecaoInicial,
  onFechar,
}: {
  aberto: boolean;
  colecaoInicial: string | null;
  onFechar: () => void;
}) {
  return (
    <Dialogo aberto={aberto} onFechar={onFechar} titulo="Novo Prompt">
      {aberto && <Formulario colecaoInicial={colecaoInicial} onFechar={onFechar} />}
    </Dialogo>
  );
}

function Formulario({
  colecaoInicial,
  onFechar,
}: {
  colecaoInicial: string | null;
  onFechar: () => void;
}) {
  const colecoes = useColecoes();
  const [titulo, setTitulo] = useState('');
  const [colecao, setColecao] = useState(colecaoInicial ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function criar() {
    if (!titulo.trim()) {
      setErro('Dê um título ao Prompt.');
      return;
    }
    setEnviando(true);
    try {
      const novo = await criarPrompt({ titulo: titulo.trim(), colecao: colecao || null });
      toast.sucesso(`"${novo.titulo}" criado`);
      onFechar();
      abrirPrompt(novo.id, { forcar: true });
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void criar();
      }}
    >
      <div className="corpo-modal flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Título</span>
          <input
            data-autofocus
            value={titulo}
            aria-invalid={erro !== null}
            aria-describedby={erro ? 'erro-novo-prompt' : undefined}
            onChange={(e) => {
              setTitulo(e.target.value);
              setErro(null);
            }}
            placeholder="Ex.: Revisão de código"
            className={`campo ${erro ? 'border-perigo' : ''}`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Coleção</span>
          <select value={colecao} onChange={(e) => setColecao(e.target.value)} className="campo">
            <option value="">{SEM_COLECAO}</option>
            {(colecoes.data ?? []).map((c) =>
              c.nome === null ? null : (
                <option key={c.nome} value={c.nome}>
                  {c.nome}
                </option>
              ),
            )}
          </select>
        </label>
        {erro && (
          <p id="erro-novo-prompt" role="alert" className="text-sm text-perigo">
            {erro}
          </p>
        )}
      </div>
      <div className="rodape-modal">
        <button type="button" className="botao" onClick={onFechar}>
          Cancelar
        </button>
        <button type="submit" className="botao-primario" disabled={enviando}>
          {enviando ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </form>
  );
}
