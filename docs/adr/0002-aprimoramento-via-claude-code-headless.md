# Aprimoramento por IA via Claude Code headless, não pela API

As Sugestões são geradas chamando o Claude Code local em modo headless (`claude -p`) a partir do servidor da aplicação, em vez de chamar a API da Anthropic diretamente. Isso aproveita a autenticação e a assinatura que já existem na máquina, sem gerenciar chave de API. Por consequência, a aplicação só funciona onde o Claude Code está instalado e autenticado, e por isso escuta apenas em `127.0.0.1`, sem login: o servidor executa um processo na máquina do usuário e não deve ficar exposto na rede.
