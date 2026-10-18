# Preparação local do MindOS

Requisitos: Node.js 22.12+ ou 24, pnpm 10.4.1 (definido no package.json), Docker e Docker Compose. Este procedimento usa somente dados demonstrativos em um banco separado de outros projetos.

1. Instale: `pnpm install --frozen-lockfile`.
2. Copie `.env.example` para `.env`. Gere senhas distintas para `DEV_DB_PASSWORD` e `DEV_DB_ROOT_PASSWORD`; use a mesma senha de `DEV_DB_PASSWORD` no endereço `DATABASE_URL`. Gere também `JWT_SECRET` aleatório com pelo menos 32 caracteres. Não envie `.env` ao GitHub.
3. Inicie o banco: `pnpm db:up`. O MySQL fica acessível somente em `127.0.0.1:3307`, no banco `mindos_dev`.
4. Aplique migrações existentes: `pnpm db:migrate`. O comando não gera alterações de schema novas. `pnpm db:generate` é uma ação separada para desenvolvimento de migrações.
5. Opcionalmente, em banco vazio: `ALLOW_DEMO_SEED=true pnpm db:seed`. O seed recusa produção, host remoto, nome de banco diferente de `mindos_dev`/`mindos_test` e tabelas com dados. Ele cria um usuário demonstrativo, sem criar uma forma de login. Uma segunda execução deve ser recusada sem alterar dados.
6. Execute `pnpm check`, `pnpm test` e `pnpm build`.
7. Inicie a interface: `pnpm dev`. O endereço padrão é `http://localhost:3000`.
8. Pare somente o banco deste projeto: `pnpm db:stop`. Os dados permanecem no volume do Compose. Não remova volumes para atualizar migrações.

## Autenticação e integrações

O login continua dependente das variáveis de OAuth Manus, conforme decisão do usuário. Com elas vazias, é possível verificar a demonstração pública e testes locais; os módulos protegidos não terão uma sessão válida. Os usuários fictícios do seed não substituem contas OAuth reais. Configure `PUBLIC_TENANT_SLUG` para identificar explicitamente a clínica do agendamento público.

Pagamentos, notas fiscais, WhatsApp, e-mail e teleatendimento exigem provedores definidos nas respectivas etapas. Não configurar provedores fictícios para contornar essas pendências.

Analytics só carrega se as duas variáveis correspondentes forem preenchidas. A coleta adicional de console/rede/replay do plugin de diagnóstico está desativada por padrão (`ENABLE_MANUS_DEBUG=false`). Não habilite em ambiente com dados clínicos reais.

## Banco existente

Antes de usar uma base que já existia, confira o histórico de migrações e faça backup. O SQL inicial de usuários foi reconstruído a partir do primeiro snapshot disponível; a validação de instalação vazia não comprova compatibilidade de toda base já implantada. Não execute o seed em base existente.

## Evidências e limites

Consulte `EXECUCAO-DO-PLANO.md` para resultados desta instalação. Depois de migrar e preencher o banco de demonstração, execute `pnpm db:verify`, `pnpm db:smoke` e `pnpm test:integration`. Os testes de integração criam registros fictícios próprios e os removem ao terminar; recusam host remoto e produção. Execute verificações e build em sequência para reduzir o uso de memória.

Os testes de autorização são diferentes de uma sessão real no navegador. Testes condicionais ao banco devem aparecer como ignorados quando a conexão não estiver configurada, em vez de passar sem executar verificações.

Se uma reinicialização interromper a criação inicial do MySQL, preserve o volume e investigue os logs. Para uma instalação de desenvolvimento comprovadamente nova, `DEV_DB_VOLUME` permite selecionar um novo volume vazio sem apagar o anterior. Essa alternativa não é um procedimento de recuperação de bancos com dados reais.

## Verificação no navegador

Depois do build, `pnpm test:browser` inicia temporariamente o servidor e o Google Chrome em modo headless. Exige `google-chrome` instalado. Usa apenas o banco local e contas fictícias do seed, com sessões assinadas exclusivamente para esse teste; não substitui a homologação do OAuth Manus real. Confere as requisições HTTP, o paciente exibido, os documentos liberados e o logout, inclusive após recarregar a página. Também confere criação e aceitação de convite, desativação, reativação, financeiro somente leitura e cancelamento pela interface. Os registros temporários da equipe são removidos ao final. Servidor e navegador são encerrados ao terminar. Uma captura fictícia fica em `/tmp/mindos-portal-verificado.png`.

## Cadastro de pacientes (etapa 3)

A migração 0008 adiciona `revision` sem apagar dados. Em `/patients`, contas com `MANAGE_PATIENTS` criam e editam cadastros. O administrador deve conceder essa nova permissão explicitamente aos vínculos existentes em Equipe. Regras de duplicidade e seleção em `ETAPA-3-PACIENTES.md`. A verificação de navegador também cobre cadastro, duplicidade, persistência e seleção real no 360°, prontuário e agenda, com limpeza dos pacientes fictícios criados pelo teste.
