---
name: save
description: Faz a Captura do último prompt digitado nesta conversa (ou do N-ésimo mais recente) e o grava na Biblioteca de Prompts do vault, exatamente como foi escrito.
disable-model-invocation: true
argument-hint: '[N]'
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/capture *), AskUserQuestion
---

# /save: Captura de prompt

Você vai guardar na Biblioteca de Prompts um prompt que o usuário digitou nesta conversa. O texto é lido do transcript por um script e gravado por ele; **você nunca reescreve, resume, corrige nem passa o texto do prompt em argumentos**. Você só escolhe título, Coleção e Tags. Fale com o usuário em pt-BR.

Todos os comandos devolvem JSON no stdout. Se a saída tiver `erro`, mostre a mensagem ao usuário e pare.

## 1. Extrair

Rode:

```bash
${CLAUDE_SKILL_DIR}/capture extract $ARGUMENTS
```

A saída traz `captura` (id da Captura), `previa` (os primeiros 500 caracteres), `caracteres`, `linhas`, `imagens`, `colagens` e `origem`. Use a `previa` só para entender do que o prompt trata.

## 2. Contexto

Rode:

```bash
${CLAUDE_SKILL_DIR}/capture context <captura>
```

A saída traz `colecoes` (as Coleções existentes), `tags` (as Tags existentes, as mais usadas primeiro) e `parecidos` (até 3 Prompts parecidos, com `pontuacao` de 0 a 1).

Se algum parecido tiver `identico: true`, diga que esse prompt já está salvo como "<titulo>" e pare.

## 3. Confirmar com o usuário

Proponha:

- **Título:** curto e descritivo, em pt-BR, dizendo para que o prompt serve.
- **Coleção:** uma das `colecoes` existentes que combine com o prompt; crie uma nova só se nenhuma servir; "Sem coleção" também é válido.
- **Tags:** de 1 a 3, reaproveitando as `tags` existentes sempre que fizerem sentido.

Faça **uma única** chamada ao AskUserQuestion com estas perguntas:

1. Título: a sua proposta como primeira opção (marcada como recomendada) e uma alternativa.
2. Coleção: a proposta como primeira opção, mais até duas alternativas (outra Coleção ou "Sem coleção").
3. Tags (`multiSelect: true`): as Tags propostas e outras existentes que possam servir.
4. Só se houver `parecidos`: "Nova Versão de _<titulo>_" para o parecido de maior pontuação (e para os outros, se couber) ou "Prompt novo". Recomende "Nova Versão" quando a `pontuacao` for 0,7 ou mais; abaixo disso, recomende "Prompt novo". Nova Versão troca só o corpo: título, Tags, Favorito, Coleção e Origem do Prompt existente ficam como estão, então nesse caso as respostas de título, Coleção e Tags são ignoradas.

O usuário pode responder com texto livre ("Other"); use o que ele escrever.

## 4. Gravar

Para um Prompt novo:

```bash
${CLAUDE_SKILL_DIR}/capture write <captura> --titulo "<título>" [--colecao "<Coleção>"] [--tag "<tag>"]...
```

Omita `--colecao` para "Sem coleção". Repita `--tag` para cada Tag.

Para uma nova Versão de um parecido:

```bash
${CLAUDE_SKILL_DIR}/capture write <captura> --versao-de <id>
```

## 5. Responder

Em uma ou duas linhas, diga o que foi gravado (Prompt novo ou nova Versão de "<titulo>") e o `caminho` devolvido pelo `write`. Se `imagens` for maior que 0, avise que as imagens anexadas ficaram de fora e só o texto foi salvo.
