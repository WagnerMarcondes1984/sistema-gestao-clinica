# Atualização geral do sistema de gestão

Consolidação das entregas até a etapa 5, solicitada em 18/10/2026. Mensagem do commit: `atulização geral do sistema de gestão`.

O código, os testes, as migrações até 0013, os planos e as instruções das etapas anteriores foram comparados com o checkpoint remoto da etapa 5. O estado anterior é preservado como base desta consolidação. A etapa 6 não foi iniciada. A etapa 5 continua com integrações financeiras/fiscais pendentes e pacotes/repasses sem automação, por decisão do usuário.

A árvore navegável está em [ARVORE-DO-PROJETO.md](ARVORE-DO-PROJETO.md). O GitHub também mantém a árvore Git completa no próprio commit. O README já existente no repositório é preservado.

## Diferença no seed

O arquivo `server/seed-db.mjs` possui cadastros demonstrativos plausíveis e seu reenvio integral foi bloqueado pela revisão automática em uma publicação anterior. O arquivo remoto anterior permanece inalterado. A pequena alteração local de proteção está preservada em [seed-finance-guard.patch](../patches/seed-finance-guard.patch), contendo somente nomes de tabelas e nenhum cadastro.

O patch adiciona `financial_operations`, `financial_movements` e `financial_installments` à verificação que recusa seed em banco preenchido. Foi validado contra uma cópia temporária da versão remota e reproduz exatamente o arquivo local, sem executar o seed e sem modificar banco.

Para recuperar essa diferença em um checkout da consolidação, confira e aplique somente o patch:

```bash
git apply --check patches/seed-finance-guard.patch
git apply patches/seed-finance-guard.patch
```

O seed não deve ser executado como parte dessa aplicação. Seu uso continua exclusivo para banco vazio de desenvolvimento, com o guard e a autorização local documentados em DESENVOLVIMENTO-LOCAL.md.

## Arquivos locais que não compõem o código publicado

`.env`, chaves, credenciais, dados do MySQL, `.mindos-private`, logs, perfis/sessões temporários do navegador, dependências e builds não são enviados. Para recuperar uma instalação, configurar novamente o ambiente e restaurar banco, armazenamento privado e chaves pelos procedimentos próprios; GitHub não substitui esses backups.

As capturas das etapas 4 e 5 foram inspecionadas visualmente e correspondem às fixtures fictícias de `scripts/verify-browser.mjs`, com nomes marcados como fictícios, identificadores aleatórios e contatos em example.com. Nenhum documento privado é anexado por este relatório. Sua publicação depende da revisão de autorização; a relação final fica registrada abaixo.

## Resultado da publicação das capturas

O usuário autorizou especificamente publicar as sete imagens em `docs/previews` após o bloqueio inicial da revisão automática. Os sete blobs foram aceitos e seus hashes conferidos contra os arquivos locais. As capturas passam a integrar esta consolidação; a informação de que eram somente locais nos relatos anteriores se refere aos checkpoints anteriores.

## Validação deste checkpoint

O código de execução corresponde ao checkpoint da etapa 5 já validado: TypeScript/build aprovados, 145 testes unitários aprovados (um caso antigo dependente de banco ignorado nessa suíte) e 82 testes MySQL aprovados, além de navegador desktop/celular. Esta consolidação acrescenta documentação, árvore, manifesto, patch e capturas; o código do aplicativo não foi alterado.

`MANIFESTO-DO-CHECKPOINT.json` registra os hashes Git dos arquivos publicados, com exceção do próprio manifesto para evitar autorreferência. A conferência final compara esses hashes com a árvore retornada pelo GitHub. O seed publicado deve manter o hash anterior, enquanto o patch reproduz o reforço local.

A consolidação é publicada em `codex/atualizacao-geral-sistema-gestao`, com PR destinado a `main`. As branches e commits anteriores são preservados; não é feito merge automaticamente. Nenhuma implantação ou etapa 6 foi iniciada.
