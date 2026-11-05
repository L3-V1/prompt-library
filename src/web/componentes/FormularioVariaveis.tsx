import { useId, useState } from 'react';

import { fecharCopia, useCopiaPendente, type CopiaPendente } from '../copia';
import { mensagemDeErro } from '../dados/cliente';
import { TECLA_MOD } from '../textos';
import { lerValoresSalvos, preencher, salvarValores } from '../variaveis';
import { Dialogo } from './Dialogo';
import { toast } from './Toaster';

/** Altura máxima de cada campo; passando dela, o campo rola. */
const ALTURA_MAXIMA = 192;

/** Ajusta a altura do `<textarea>` ao texto (sem depender de `field-sizing`). */
function ajustarAltura(campo: HTMLTextAreaElement | null): void {
  if (!campo?.isConnected) return;
  campo.style.height = 'auto';
  const altura = campo.scrollHeight + campo.offsetHeight - campo.clientHeight;
  campo.style.height = `${Math.min(altura, ALTURA_MAXIMA)}px`;
  campo.style.overflowY = altura > ALTURA_MAXIMA ? 'auto' : 'hidden';
}

/** Antes do `showModal` o diálogo está oculto e a altura daria zero: espera um quadro. */
function ajustarAoMontar(campo: HTMLTextAreaElement | null): void {
  if (campo) requestAnimationFrame(() => ajustarAltura(campo));
}

/** "Preencher Variáveis" (decisões 115 e 116): abre ao copiar um Prompt com `{{nome}}`. */
export function FormularioVariaveis() {
  const copia = useCopiaPendente();
  return (
    <Dialogo aberto={copia !== null} onFechar={fecharCopia} titulo="Preencher Variáveis">
      {copia && <Formulario key={copia.pedido} copia={copia} />}
    </Dialogo>
  );
}

function Formulario({ copia }: { copia: CopiaPendente }) {
  const prefixo = useId();
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const salvos = lerValoresSalvos(copia.id);
    return Object.fromEntries(copia.variaveis.map((nome) => [nome, salvos[nome] ?? '']));
  });

  async function copiar() {
    // Grava no próprio gesto do usuário (clique ou tecla), antes de qualquer outra espera.
    try {
      await navigator.clipboard.writeText(preencher(copia.corpo, valores));
    } catch (erro) {
      toast.erro(`Não foi possível copiar: ${mensagemDeErro(erro)}`);
      return;
    }
    salvarValores(copia.id, valores);
    fecharCopia();
    copia.aoCopiar();
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void copiar();
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
        e.preventDefault();
        void copiar();
      }}
      className="flex min-h-0 flex-col"
    >
      <div className="corpo-modal flex min-h-0 flex-col gap-4 overflow-y-auto">
        <p className="-mt-1 truncate text-sm text-suave">{copia.titulo}</p>
        {copia.variaveis.map((nome, i) => (
          <div key={nome} className="flex flex-col gap-1.5 text-sm">
            <label htmlFor={`${prefixo}-${i}`} className="font-mono font-medium break-all">
              {nome}
            </label>
            <textarea
              id={`${prefixo}-${i}`}
              ref={ajustarAoMontar}
              data-autofocus={i === 0 ? true : undefined}
              rows={1}
              value={valores[nome] ?? ''}
              onChange={(e) => {
                ajustarAltura(e.currentTarget);
                setValores((v) => ({ ...v, [nome]: e.target.value }));
              }}
              className="campo resize-none"
            />
          </div>
        ))}
      </div>
      <div className="rodape-modal items-center">
        <span className="mr-auto text-xs text-suave">
          <kbd className="font-sans font-semibold text-texto">{TECLA_MOD}+Enter</kbd> copia
        </span>
        <button type="button" className="botao" onClick={fecharCopia}>
          Cancelar
        </button>
        <button type="submit" className="botao-primario">
          Copiar
        </button>
      </div>
    </form>
  );
}
