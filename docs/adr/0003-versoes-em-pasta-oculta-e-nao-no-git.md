# Versões em pasta oculta, não em commits automáticos no git do vault

As Versões de cada Prompt ficam em `Prompts/.versoes/<id>/`, geridas pela aplicação, e não como commits automáticos no git do vault. O vault é versionado com commits manuais e mensagens descritivas; commits automáticos poluiriam esse histórico e poderiam incluir alterações pendentes do usuário em outras notas. Por isso cada Prompt carrega um `id` estável no frontmatter, atribuído pela aplicação inclusive a Prompts criados no Obsidian, para que renomear ou mover o arquivo não desligue o Prompt do seu histórico.
