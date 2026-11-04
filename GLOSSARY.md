# Biblioteca de Prompts

Aplicação pessoal para guardar, aprimorar e copiar os prompts usados no desenvolvimento com IA. Os prompts são testados no uso real do dia a dia, não dentro da aplicação.

## Linguagem

### Acervo

**Prompt**:
Um texto reutilizável, com título, que o usuário cola numa ferramenta de IA.
_Evitar_: Template, snippet, comando

**Coleção**:
Agrupamento ao qual cada Prompt pertence, no máximo um, como "Code review" ou "Planejamento". Um Prompt fora de qualquer Coleção está "Sem coleção".
_Evitar_: Pasta, categoria

**Tag**:
Rótulo livre atribuído a um Prompt; um Prompt pode ter várias.
_Evitar_: Etiqueta, label

**Favorito**:
Prompt marcado pelo usuário para aparecer em destaque.
_Evitar_: Fixado, estrela

**Versão**:
O estado completo de um Prompt num dado momento, registrado a cada alteração e passível de comparação e restauração.
_Evitar_: Revisão, snapshot

**Captura**:
O registro na biblioteca, pelo comando `/save`, de um prompt digitado numa conversa com o Claude Code, exatamente como foi escrito. Gera um Prompt novo ou uma nova Versão de um Prompt existente.
_Evitar_: Importação, salvamento

**Origem**:
De onde veio um Prompt capturado: o projeto, a data e a sessão do Claude Code em que foi digitado.
_Evitar_: Fonte, contexto

### Aprimoramento

**Aprimoramento**:
Qualquer mudança feita num Prompt para melhorá-lo, seja manual (o usuário edita) ou assistida pelo Claude.
_Evitar_: Otimização, refinamento

**Análise**:
Uma rodada de Aprimoramento assistido: o Claude examina um Prompt e propõe Sugestões, e o usuário decide sobre cada uma. Fica aberta até ser concluída, gerando uma única Versão, ou descartada.
_Evitar_: Revisão, sessão, avaliação

**Rascunho**:
O texto de trabalho de uma Análise aberta, que recebe as Sugestões aceitas e as edições manuais feitas durante ela.
_Evitar_: Cópia, prévia

**Sugestão**:
Uma proposta pontual de mudança feita pelo Claude dentro de uma Análise, com justificativa e o trecho alterado, que o usuário aceita, rejeita ou regenera.
_Evitar_: Recomendação, dica

**Sugestão desatualizada**:
Sugestão que deixou de se aplicar porque o trecho a que se refere foi alterado por outra Sugestão aceita; só pode ser regenerada.
_Evitar_: Sugestão inválida, conflito

**Diretrizes**:
Texto mantido pelo usuário com os critérios do que considera um bom Prompt, levado em conta pelo Claude em toda Análise.
_Evitar_: Regras, guia de estilo, system prompt

**Instrução**:
Orientação opcional dada pelo usuário para uma Análise específica, como "foque em concisão".
_Evitar_: Diretriz, comando
