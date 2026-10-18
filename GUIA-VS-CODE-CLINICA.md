# MindOS no VS Code — Guia de instalação e implantação em uma clínica

## 1. O que este projeto é

O MindOS é uma aplicação web full-stack para clínicas de psicologia. Ele possui frontend React, backend Node/Express com tRPC, banco MySQL/TiDB acessado por Drizzle ORM e autenticação OAuth.

A pasta do projeto não é um arquivo que deve ser aberto isoladamente. No VS Code, deve-se abrir a **pasta raiz inteira** do projeto:

```text
financial-fiscal-core/
├── client/       # telas React
├── server/       # API, autenticação e regras de negócio
├── drizzle/      # schema e migrações do banco
├── shared/       # tipos compartilhados
├── package.json  # scripts e dependências
└── .env          # variáveis locais; não versionar
```

## 2. Requisitos no computador

Instale:

- Node.js 20 ou superior;
- pnpm 10 ou superior;
- VS Code;
- Git, caso o projeto seja obtido por repositório;
- um banco MySQL 8, TiDB Cloud ou outro serviço MySQL compatível.

Verifique no terminal:

```bash
node --version
pnpm --version
git --version
```

## 3. Como abrir no VS Code

### Opção A — projeto em uma pasta local

No terminal:

```bash
cd caminho/onde/está/o-projeto
code .
```

Ou, no VS Code, use **File > Open Folder** e selecione a pasta `financial-fiscal-core`.

É importante abrir a raiz que contém `package.json`, e não somente `client/` ou `server/`.

### Opção B — projeto em um repositório Git

```bash
git clone URL_DO_REPOSITORIO financial-fiscal-core
cd financial-fiscal-core
code .
```

Se o projeto ainda não estiver em um repositório, exporte ou copie a pasta completa. Não copie apenas os arquivos de `client/src`, pois o backend, schema, migrações e configurações também são necessários.

## 4. Instalar dependências

Dentro da pasta raiz:

```bash
pnpm install
```

Depois valide o código:

```bash
pnpm check
pnpm test
pnpm build
```

Os testes devem passar antes de qualquer alteração estrutural.

## 5. Configurar as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto. Nunca envie esse arquivo para o Git e nunca coloque seus valores em screenshots ou mensagens públicas.

Modelo mínimo:

```env
NODE_ENV=development
DATABASE_URL=mysql://USUARIO:SENHA@HOST:3306/NOME_DO_BANCO
JWT_SECRET=gere-uma-chave-longa-e-aleatoria
VITE_APP_ID=seu-app-id-oauth
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://seu-portal-de-login
OWNER_OPEN_ID=seu-open-id
OWNER_NAME=Administrador da clínica
BUILT_IN_FORGE_API_URL=https://api.manus.im
BUILT_IN_FORGE_API_KEY=chave-do-servico
```

A aplicação lê atualmente as seguintes variáveis no backend: `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL` e `BUILT_IN_FORGE_API_KEY`.

O login não é um login local simples por e-mail e senha. O fluxo atual usa OAuth do ambiente Manus. Para uma instalação independente fora desse ambiente, será necessário substituir ou adaptar o provedor de autenticação antes de colocar a aplicação em produção.

## 6. Criar e preparar o banco

Crie um banco vazio MySQL/TiDB e configure sua `DATABASE_URL`. Em seguida, execute:

```bash
pnpm db:push
```

Esse comando gera/aplica as migrações Drizzle conforme a configuração do projeto.

Para ambiente de desenvolvimento, o projeto possui dados de seed operacionais. Execute o seed somente em banco de teste ou em uma instalação nova:

```bash
node server/seed-db.mjs
```

**Não execute o seed em um banco que já contenha dados reais da clínica sem revisar o script.** O seed cria dados demonstrativos e pode limpar/recriar registros MindOS durante a preparação inicial.

## 7. Executar localmente

Inicie o servidor de desenvolvimento:

```bash
pnpm dev
```

Abra a URL informada pelo terminal, normalmente:

```text
http://localhost:3000
```

Para interromper o servidor, use `Ctrl+C`.

Durante o desenvolvimento, o `tsx watch` reinicia o backend quando os arquivos são alterados. O navegador deve ser atualizado para validar as mudanças de frontend.

## 8. Primeiro cadastro de uma clínica

Para cada clínica, o fluxo recomendado é:

1. Criar um tenant separado para a clínica.
2. Configurar nome comercial, razão social, cidade, identidade visual e slug público.
3. Criar o usuário proprietário ou administrador.
4. Associar o usuário ao tenant por meio de uma membership.
5. Definir o papel e as permissões de cada membro da equipe.
6. Cadastrar profissionais, unidades, áreas de atendimento e horários.
7. Cadastrar pacientes apenas com os dados administrativos necessários.
8. Configurar o conteúdo público pelo Admin Studio.
9. Validar agenda, recepção, portal do paciente e regras financeiras em ambiente de teste.
10. Fazer backup e só então iniciar o uso real.

Os papéis disponíveis no modelo atual incluem:

| Papel | Uso recomendado |
|---|---|
| `OWNER` | Proprietário da clínica; controle amplo do tenant |
| `CLINIC_ADMIN` | Administração operacional e configurações |
| `PSYCHOLOGIST` | Agenda e dados clínicos conforme permissão |
| `ASSISTANT` | Apoio operacional com acesso limitado |
| `RECEPTIONIST` | Recepção, agenda e dados administrativos |
| `FINANCIAL` | Cobranças, contas e caixa |
| `SALES` | Leads e relacionamento administrativo |
| `VIEWER` | Consulta limitada |
| `PATIENT` | Portal do próprio paciente |

Não use uma conta compartilhada pela equipe. Cada profissional deve ter sua própria identidade para que o controle de acesso e a auditoria funcionem corretamente.

## 9. Separação de dados e LGPD

O sistema possui camadas de dados administrativas, clínicas, restritas, financeiras e públicas. Essa separação deve ser refletida na operação:

- recepção não deve visualizar notas clínicas;
- conteúdo público nunca deve conter informações de pacientes;
- profissionais devem acessar somente os pacientes e registros permitidos;
- dados financeiros devem ser concedidos somente às funções financeiras autorizadas;
- notas restritas devem ter permissão específica;
- todo acesso a informações sensíveis deve permanecer auditável;
- use HTTPS em produção, backups criptografados e política de retenção;
- não utilize dados reais em desenvolvimento, testes ou screenshots.

O software ajuda a aplicar controles técnicos, mas não substitui a adequação jurídica da clínica à LGPD, a definição de controlador/operador, os termos de consentimento, a política de retenção e a revisão por profissional jurídico ou encarregado de dados.

## 10. Como personalizar a clínica sem programar

O Admin Studio permite configurar a presença institucional da clínica por CMS. O fluxo recomendado é:

1. Editar marca, cores, textos, serviços e informações institucionais.
2. Salvar como rascunho.
3. Revisar o preview.
4. Submeter para aprovação.
5. Publicar somente após conferência.
6. Usar rollback caso uma versão publicada precise ser revertida.

Não coloque no CMS público nomes de pacientes, diagnósticos, relatos de sessão, documentos, prontuários ou qualquer conteúdo clínico.

## 11. Como implementar funcionalidades novas

A sequência segura para uma nova funcionalidade é:

1. Alterar `drizzle/schema.ts` caso sejam necessários novos dados.
2. Gerar e aplicar a migração do banco.
3. Criar helpers tenant-aware em `server/db.ts`.
4. Criar procedimentos tRPC protegidos em `server/routers.ts` ou em um router de domínio.
5. Aplicar RBAC e camada de dados no backend; não confiar apenas em esconder botões no frontend.
6. Criar ou atualizar a tela em `client/src/pages`.
7. Consumir a API usando `trpc.*.useQuery` e `trpc.*.useMutation`.
8. Adicionar estados de carregamento, vazio, erro e sucesso.
9. Criar testes Vitest para permissão, tenant e regras de negócio.
10. Executar `pnpm check`, `pnpm test` e `pnpm build`.

Para operações clínicas versionadas, nunca sobrescreva silenciosamente uma evolução ou anotação existente. Crie uma nova versão e mantenha o histórico.

## 12. Build e execução de produção

Gere o bundle:

```bash
pnpm build
```

Execute localmente o bundle de produção:

```bash
NODE_ENV=production pnpm start
```

Em produção, use um serviço com:

- banco gerenciado e backups automáticos;
- HTTPS obrigatório;
- variáveis de ambiente secretas;
- logs sem conteúdo clínico sensível;
- monitoramento de erro e disponibilidade;
- política de atualização e rollback;
- acesso administrativo protegido por MFA quando suportado;
- cópias de segurança testadas por restauração real.

O projeto está preparado para implantação no ambiente web utilizado durante o desenvolvimento. Se for migrar para Cloud Run, configure o serviço para escutar em `0.0.0.0` e forneça a porta definida pelo ambiente, além de configurar banco, OAuth e segredos no gerenciador de secrets.

## 13. Checklist antes de uma clínica usar o sistema

- [ ] Banco de produção separado do banco de desenvolvimento.
- [ ] Backup automático configurado e restauração testada.
- [ ] HTTPS ativo.
- [ ] Tenant da clínica criado e validado.
- [ ] Usuários individuais criados.
- [ ] Papéis e permissões revisados pelo responsável da clínica.
- [ ] Teste realizado com recepção, psicólogo, financeiro e administrador.
- [ ] Verificado que a recepção não acessa conteúdo clínico.
- [ ] Versionamento de prontuário testado.
- [ ] Auditoria de acesso verificada.
- [ ] CMS público revisado sem dados pessoais ou clínicos.
- [ ] Fluxo de agenda e conflito de horários testado.
- [ ] Fluxo de cancelamento e reagendamento testado.
- [ ] Fluxo financeiro conferido com o responsável contábil.
- [ ] Política de privacidade, consentimentos e retenção definida.
- [ ] Plano de suporte e resposta a incidentes definido.

## 14. Limitações importantes da versão atual

A base atual possui a fundação persistente de agenda, pacientes, recepção, portal, CMS, RBAC, auditoria e financeiro. Antes de vender como produto completo para várias clínicas, ainda é recomendável concluir ou validar em ambiente controlado:

- integração real com e-mail e WhatsApp, em vez de apenas templates ou simulações;
- diff visual completo entre versões do CMS;
- CRUD visual completo de todos os cadastros clínicos;
- testes de integração multi-tenant em escala;
- autenticação independente caso o produto seja instalado fora do ecossistema Manus;
- integração fiscal e de pagamentos adequada ao município e aos provedores escolhidos;
- revisão de segurança, privacidade e conformidade por especialistas.

## 15. Comandos de rotina

```bash
# instalar dependências
pnpm install

# iniciar desenvolvimento
pnpm dev

# checar TypeScript
pnpm check

# executar testes
pnpm test

# gerar build
pnpm build

# formatar arquivos
pnpm format

# gerar/aplicar banco conforme configuração
pnpm db:push
```

## 16. Recomendação de implantação

Comece com uma clínica piloto e dados de teste. Faça um período de homologação com um psicólogo, uma pessoa da recepção, uma pessoa do financeiro e um administrador. Só depois replique a configuração para outras clínicas, mantendo um tenant e uma política de acesso independentes para cada organização.
