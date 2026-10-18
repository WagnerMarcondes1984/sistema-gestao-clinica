# Execução do plano MindOS

Referência: plano de 17/10/2026. Este registro deve ser atualizado a cada entrega para permitir retomada após interrupções.

## Decisões confirmadas

- Manter OAuth Manus por enquanto; não implementar outro provedor de login nesta etapa.
- Usar banco exclusivo de desenvolvimento, com dados fictícios.
- Não considerar telas demonstrativas, mensagens de sucesso ou itens antigos do `todo.md` como comprovação de conclusão.

## Retomada após reinicialização

As alterações anteriores permaneceram nos arquivos locais. O volume MySQL original apresentou falha na inicialização: a criação dos arquivos do banco havia sido interrompida. O volume original foi preservado e um volume novo foi configurado no `.env` local. Não foram apagados dados de outro projeto.

Os testes passam a usar um único processo de execução. Executar as verificações pesadas em sequência neste computador.

## Etapa 1 — preparação concluída

Implementado:

- Dependências instaladas de acordo com o lockfile, sem alterar suas versões.
- `.env.example`, `.env` local ignorado pelo Git e Compose com MySQL exclusivo em `127.0.0.1:3307`.
- Migração inicial de usuários restaurada a partir do snapshot disponível.
- Separação entre gerar migrações (`db:generate`) e aplicar migrações (`db:migrate`).
- Seed sem exclusões de dados; exige habilitação explícita e banco local vazio; usa transação e bloqueio contra dois seeds simultâneos.
- Referências do seed usam IDs gerados, incluindo usuário administrativo e usuário de paciente fictícios.
- Comandos `db:verify` e `db:smoke` para conferir schema e integração da demonstração.
- Inventário inicial das rotas em `INVENTARIO-FUNCIONAL.md` e instruções em `DESENVOLVIMENTO-LOCAL.md`.
- Analytics opcional e coletor adicional de diagnóstico desativado por padrão.

Verificado na retomada:

- TypeScript: aprovado após a revisão do portal e do logout.
- Testes sem banco: 47 aprovados, 1 ignorado por ausência de banco.
- Migrações aplicadas em banco novo; schema conferido: 20 tabelas e 241 colunas.
- Seed demonstrativo concluído; repetição recusada sem mudar as contagens de nenhuma tabela.
- Testes com banco: 7 aprovados, cobrindo duas clínicas, autorização financeira, autoria, portal e notas restritas.

Banco inicializado e saudável. Build aprovado, com aviso de tamanho do bundle (otimização continua pendente). Nenhum segredo local encontrado no bundle público. HTTP real aprovado para autenticação, acesso financeiro, portal, recusa de app incorreto e simulação bloqueada em produção.

O primeiro teste no Chrome encontrou travamento visual após logout. Corrigido preservando o observador de `auth.me` ao remover consultas sensíveis. Cookies locais HTTP usam SameSite=Lax; HTTPS mantém SameSite=None com Secure. Os dois testes de logout passaram. A revalidação no Chrome aprovou entrada anônima, paciente correto, documentos liberados, saída e recarregamento sem reabrir a sessão; nenhuma exceção de execução foi capturada. A etapa 1 está concluída como preparação técnica; isso não homologa o sistema completo para produção.

## Etapa 2 — segurança

Alterações implementadas e aprovadas nos testes de integração:

- Rotas financeiras e de auditoria exigem sessão e permissão de leitura ou alteração.
- Helpers financeiros recebem a clínica e a identidade derivadas do usuário autenticado.
- Migração adiciona identificação da clínica ao financeiro e autoria à auditoria. Registros legados sem associação permanecem inacessíveis; não se infere clínica por vertical.
- Portal consulta o paciente vinculado ao usuário autenticado, sem aceitar um ID arbitrário do cliente.
- Leitura e finalização de notas restritas verificam permissões específicas; leitura restrita gera auditoria própria.
- Eventos de recepção e referência de sessão no prontuário validam a clínica e o paciente.
- Clínica pública selecionada pelo `PUBLIC_TENANT_SLUG` configurado, com slug único.
- Usuário sem associação ativa não ganha uma clínica automaticamente. Múltiplas associações ativas exigem resolução explícita em vez de escolher a primeira.
- Sessões exigem segredo de pelo menos 32 bytes e o ID do app configurado.
- Logout limpa cache de consultas e a cópia da sessão em sessionStorage.
- Portal remove dados e mensagens demonstrativas que aparentavam consentimentos assinados ou pagamentos reais.

Ainda pendente nesta etapa:

- Preparar procedimento revisado de associação de registros financeiros legados, quando houver uma base real a migrar.
- Validar login Manus real quando as credenciais do ambiente estiverem configuradas. O seed não cria acesso OAuth.

## Próxima ação concreta

**Parar após esta entrega da etapa 2 para análise do usuário. Não iniciar a etapa 3.** A gestão de equipe, os convites e as associações foram implementados, mantendo o provedor atual. A recomendação de trocar o login antes de produção continua pendente de implementação e definição do provedor. O login real depende de `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` e `OWNER_OPEN_ID`, ainda não configurados no ambiente local.

## Verificações do checkpoint anterior

| Verificação | Resultado |
|---|---|
| TypeScript | Aprovado |
| Suíte unitária completa | 47 aprovados e 1 ignorado por ausência de banco na suíte unitária |
| Logout após ajuste de cookie HTTP | 2 testes aprovados, incluindo o caso novo |
| Integração em MySQL local | 7 testes aprovados; registros fictícios temporários removidos ao final |
| Schema | 20 tabelas e 241 colunas correspondentes ao código |
| Seed e repetição | Inserção concluída; repetição recusada sem alterar contagens |
| Build | Aprovado; permanece aviso de bundle grande |
| HTTP real | Acesso anônimo negado, sessão válida aceita, app incorreto negado, portal vinculado e simulação de produção negada |
| Chrome headless | Portal anônimo/autenticado, documentos e logout com recarregamento aprovados |

A suíte unitária ignorou o teste antigo dependente de banco; os testes próprios de integração foram executados separadamente com conexão real. As sessões usadas no teste HTTP/Chrome são locais e fictícias e não comprovam o fluxo externo de login Manus.

## Entrega de equipe e convites — etapa 2, parada para análise

Implementado nesta rodada:

- `/app/team`: lista de vínculos, papéis, permissões, desativação/reativação, criação e cancelamento de convites.
- `/invite`: aceitação pessoal pelo e-mail da identidade autenticada, com retorno interno após OAuth.
- Convite de paciente exige cadastro existente da própria clínica; não foi iniciado CRUD de pacientes da etapa 3.
- Convite de 72 horas com segredo aleatório, hash no banco, POST para verificação/aceitação e proteção contra replay, aceitação simultânea e destinatário incorreto.
- Concessões limitadas por papel; proprietário, superadministrador e próprio acesso protegidos; administrador comum não gerencia outros administradores.
- Desativação ou mudança de permissões bloqueia requisições seguintes; criador revogado não concede acesso por convite antigo.
- Entrada explícita de clínica somente por administrador de instalação sem associação anterior.
- Operações persistentes e auditadas em transações, com índice único de vínculo por clínica/usuário.
- O cabeçalho da nova tela identifica a conta autenticada e não exibe o banner fiscal demonstrativo.

Verificações desta rodada: TypeScript aprovado; 61 testes unitários aprovados e 1 ignorado; 15 testes de integração aprovados; schema com 21 tabelas e 254 colunas conferido; build aprovado com aviso de tamanho do bundle. Chrome validou criação/aceitação do convite, desativação, reativação, financeiro somente leitura, cancelamento e o portal/logout anteriores. Revisão final no Chrome aprovada, incluindo identidade no cabeçalho. Capturas com dados fictícios: [desktop](previews/equipe-desktop.png) e [celular](previews/equipe-mobile.png).

Operação e limites em `EQUIPE-E-CONVITES.md`. O envio do link é manual; não houve mensagem a terceiros. Não foi trocado o provedor de login. A autenticação Manus real e a associação de financeiro legado continuam pendentes. A etapa 3 não foi iniciada.

Checkpoint desta entrega: branch `codex/equipe-e-convites`, baseada em `codex/preparacao-e-seguranca`, para revisão separada sem avançar a etapa 3.
