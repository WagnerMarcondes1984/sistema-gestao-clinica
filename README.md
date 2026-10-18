# Sistema de Gestão Clínica — MindOS

Plataforma web de gestão clínica com foco em psicologia e saúde mental, com módulos de agenda, pacientes, prontuário, recepção, financeiro, portal e administração de conteúdo.

## Situação atual

Esta é a base do projeto antes da execução do plano de conclusão. Existem funcionalidades parciais, dados demonstrativos e simulações de pagamentos e emissão fiscal. A preparação do ambiente e as correções de autenticação, permissões e isolamento entre clínicas são as primeiras entregas previstas. A versão atual ainda não foi homologada para operação com dados reais.

## Documentação

- [Plano de conclusão e critérios de aceite](PLANO-DE-CONCLUSAO-MINDOS.md)
- [Guia de instalação e operação](GUIA-VS-CODE-CLINICA.md)
- [Histórico de tarefas](todo.md) — marcações históricas devem ser confirmadas pelos critérios do plano.

## Tecnologias

React, TypeScript, Vite, Node.js, Express, tRPC, Drizzle ORM e MySQL/TiDB.

## Desenvolvimento

Requer Node.js compatível com o projeto, pnpm e banco MySQL/TiDB. Configure as variáveis conforme o guia; o login atual depende de OAuth Manus.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm dev
```

Não envie arquivos `.env`, credenciais, dados reais de pacientes, dependências instaladas ou saídas de build ao repositório.
