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

## Ponto de parada da entrega anterior

**Parada atendida na entrega da etapa 2. Usuário autorizou iniciar a etapa 3 em 18/10/2026.** A gestão de equipe, os convites e as associações foram implementados, mantendo o provedor atual. A recomendação de trocar o login antes de produção continua pendente de implementação e definição do provedor. O login real depende de `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL` e `OWNER_OPEN_ID`, ainda não configurados no ambiente local.

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

## Etapa 3 — pacientes e seleção real (18/10/2026)

Usuário autorizou o início após revisar a entrega anterior. Implementado cadastro completo de pacientes, incluindo busca paginada, edição, situação, inativação/reativação, validação, prevenção de duplicidades simultâneas e revisão de edição concorrente. A seleção agora alimenta Paciente 360°, prontuário e agenda pelo ID real da clínica.

A migração 0008 adicionou controle de revisão sem apagar dados. Escrita exige `MANAGE_PATIENTS`; vínculos existentes não receberam novas permissões automaticamente. Foram corrigidos filtro de clínica nos pacientes associados à agenda e validação de paciente na leitura de prontuário.

A primeira execução dos testes encontrou busca sensível a acentos. Uma consulta local confirmou que LOCATE não respeitava a equivalência desejada; corrigido usando LIKE com collation explícita e escape de metacaracteres. O teste de navegador também foi ajustado para conferir o cabeçalho do paciente, pois os demais pacientes aparecem legitimamente nas opções do seletor.

Operação, regras de duplicidade e limites em `ETAPA-3-PACIENTES.md`. Etapa 3 permanece em andamento: cadastro de profissionais/serviços/unidades/disponibilidade e restante de agenda/recepção não foram declarados concluídos. Nenhuma implementação da etapa 4 foi iniciada; o prontuário apenas recebeu seleção real e correções no rascunho existente.

Validação deste bloco: TypeScript aprovado; 77 testes unitários aprovados e 1 ignorado; 23 testes de integração aprovados; schema com 21 tabelas e 255 colunas; build aprovado, mantendo aviso de bundle grande. Chrome aprovou cadastro, busca, duplicidade, edição/inativação/reativação, recarregamento, seleção de paciente nas três telas e descarte confirmado de texto não salvo; regressões de equipe, portal e logout também passaram. Capturas em `previews/pacientes-desktop.png` e `previews/pacientes-mobile.png`. Dados temporários de teste removidos ao final.

Checkpoint deste bloco: `codex/etapa-3-pacientes`, baseado em `codex/equipe-e-convites`, para revisão separada. Próximo item do plano: cadastro de profissionais, serviços, unidades e disponibilidade.

## Etapa 3 — operação concluída para revisão (18/10/2026)

Entregues os itens restantes: cadastro/edição/inativação de profissionais, unidades, serviços e disponibilidade; sessões únicas e séries; transições válidas; reagendamento de ocorrência ou próximas sessões da série; reservas concorrentes protegidas por transações e lock da clínica; triagem pública com limites persistentes; check-in por sessão e fila somente do dia; contadores reais; fuso da clínica com tratamento de horário de verão. Removidas demonstrações operacionais da agenda, recepção e painel inicial.

Migrações 0009 e 0010 aplicadas preservando o legado. Endpoints antigos de gravação por nome/check-in por paciente foram desativados; leitura e histórico permanecem. Recursos de sessões legadas não foram inferidos automaticamente.

Verificação: TypeScript/build aprovados, 91 testes unitários aprovados e 1 ignorado; 38 cenários de integração aprovados; schema com 26 tabelas e 303 colunas; seed original e recusa de repetição conferidos. Chrome aprovou os fluxos de ponta a ponta e as regressões anteriores. Capturas em `previews/`. Permanece aviso de bundle grande.

A revisão visual usa `node scripts/open-review.mjs`: janela separada, servidor limitado ao loopback, sessão temporária e clínica fictícia exclusiva. Não altera credenciais nem cria login alternativo no produto. A conta de revisão não recebe administração global e não tem associação a clínicas reais.

**Parada solicitada atendida: abrir localhost para revisão e não iniciar a etapa 4.** Guia: `ETAPA-3-OPERACAO.md`. Checkpoint: branch `codex/etapa-3-operacao`, baseada em `codex/etapa-3-pacientes`, sem merge. OAuth Manus real, associação financeira legada e homologação para produção continuam pendentes nas respectivas etapas.

## Etapa 4 — prontuário, documentos e portal (18/10/2026)

Etapa 3 revisada e início autorizado pelo usuário. Implementados rascunhos editáveis pelo autor, finalização imutável, adendos, histórico com integridade HMAC e identificação explícita de legado; acesso por vínculo clínico e concessões adicionais para notas restritas. Documentos reais privados, criptografados, com autorização em cada download, liberação ao portal e revogação. Consentimentos publicados por versão, aceite eletrônico simples, recusa, retirada e evidência preservada. Portal com dados próprios, financeiro interno explicitamente vinculado/liberado e pedidos persistentes de reagendamento com decisão atômica da equipe. Teleatendimento demonstrativo removido; integração de vídeo fora desta entrega.

Migrações 0011 e 0012 preservam o legado; campos extensos usam MEDIUMTEXT, validado com Unicode e snapshots. Segredos independentes configurados somente no ambiente local, sem envio ao repositório. Diretório privado ignorado e negado pelo Vite. Modelos novos de documentos não ampliam permissões de associações existentes.

Validação: TypeScript e build aprovados; 114 testes unitários aprovados e 1 ignorado (caso antigo dependente de banco), 54 testes de integração em MySQL aprovados. Chrome aprovou prontuário, adendos, vínculo/revogação clínica, upload/liberação/download/revogação, versões e decisões de consentimento, financeiro liberado e reagendamento, além das regressões de equipe, agenda, recepção e logout. Capturas fictícias em `previews/`. Permanece aviso de tamanho do bundle.

Foram corrigidos espera por atualização após mutações da interface, sincronização dos seletores do teste e a exigência de revisão no teste legado de finalização. Testes de banco e Chrome executados sequencialmente após identificar lentidão de commits quando concorriam pelo disco; a suíte final passou integralmente. Registros temporários de teste são removidos pelo harness.

Guia em `ETAPA-4-PRONTUARIO-E-PORTAL.md`. Revisão: `node scripts/open-review.mjs --care`, equipe e paciente em contextos separados, contas fictícias sem administração global, sessão de duas horas. Nenhum provedor de autenticação foi trocado. OAuth Manus real permanece pendente de configuração.

Checkpoint previsto: `codex/etapa-4-prontuario-e-portal`, baseado em `codex/etapa-3-operacao`, para revisão sem merge. **Parar antes da etapa 5, aguardando análise e novo comando.** Financeiro bancário/fiscal, assinatura certificada e homologação de produção não foram declarados entregues.

Conferência final: 31 tabelas e 373 colunas correspondem ao código; seed original preservado e repetição recusada. Revisão aberta com sucesso em `http://localhost:3420/clinical-records?patientId=84` e `http://localhost:3420/portal`, com contextos separados. As cinco capturas da etapa 4 ficam somente no ambiente local após bloqueio da revisão automática para envio ao repositório público; código e documentação seguem no checkpoint, sem arquivos privados.

## Etapa 5 — controle financeiro interno (18/10/2026)

Usuário revisou a etapa 4 e autorizou iniciar a etapa 5 com atenção à segurança. Provedores de pagamento/fiscal: a definir. Pacotes e repasses: sem automação por decisão expressa, mantendo lançamentos manuais auditados. Etapa 5 permanece em andamento; não iniciar etapa 6.

Entregue cálculo no servidor em centavos, validação de limites, parcelas exatas e datas mensais, paciente/sessão da clínica, nova cobrança sempre pendente, recebimentos parciais, reversões parciais/integrais, despesas e pagamentos manuais, caixa com abertura única, dinheiro/troco, suprimentos/sangrias, conferência e fechamento. Toda escrita usa transação, lock da clínica, revisão, revalidação de autorização e chave idempotente. Erro de auditoria reverte as demais gravações; erros internos não expõem SQL nem parâmetros ao cliente.

Removidas as confirmações e informações bancárias/fiscais fictícias e indicadores sem evidência. Simulação recusada em todos os ambientes. Legado preservado, identificado e bloqueado para movimentar até migração revisada, fora dos novos relatórios. Resumo usa leitura transacional e confere livro, itens, parcelas e saldos. Portal mostra recebido líquido e identifica legado; não integra meios de pagamento. Busca literal/paginação e filtro de saldos em aberto incluídos.

Migração 0013 aplicada. Schema conferido com 34 tabelas e 412 colunas; seed original e recusa de repetição preservados. Chrome validou os fluxos financeiros completos (cobrança/parcelas/baixa/reversão/histórico/dinheiro/troco/despesa/caixa/diferença/relatório/consulta restrita), desktop/celular e regressões anteriores, sem exceções de execução. Capturas somente locais em `previews/financeiro-etapa5*.png`.

Os testes encontraram conflito de nome no cálculo do relatório, corrigido antes da homologação. A injeção de falha de auditoria foi feita por proxy apenas no teste, dentro de transação real, sem exigir SUPER nem afrouxar a configuração MySQL. Reversão sobre recebimento parcial não exige receber ficticiamente o restante; o saldo original não recebido continua disponível, sem recobrar automaticamente o valor devolvido. Guia e limites em `ETAPA-5-FINANCEIRO-INTERNO.md`.

Revisão preparada por `node scripts/open-review.mjs --finance`, com contas e dados fictícios em contextos separados, sessão de duas horas, sem alterar Manus. Checkpoint previsto: `codex/etapa-5-financeiro-interno`, baseado em `codex/etapa-4-prontuario-e-portal`, sem merge. Integração, webhook assinado, conciliação e estorno externos, fiscal real e homologação com provedores permanecem pendentes.

Validação final: TypeScript aprovado; 145 testes unitários aprovados e 1 caso antigo dependente de banco ignorado nessa suíte; 82 testes de integração MySQL aprovados, incluindo 28 financeiros. Build aprovado, mantendo aviso de tamanho do bundle. O JavaScript principal caiu de aproximadamente 1,77 MB para 1,12 MB após remover telas e simulações antigas; a otimização restante continua na preparação de produção. Inventário atualizado com 137 handlers estáticos. Nenhum segredo ou documento privado será incluído no checkpoint público.

Revisão local aberta em `http://localhost:3420/finance`; busca, paginação e retorno ao resumo autenticado conferidos também na versão final. Sessões separadas da equipe e do portal usam somente a clínica fictícia de revisão. Parada para análise; nenhuma tarefa da etapa 6 iniciada.

Limite do checkpoint público: a revisão automática rejeitou o reenvio de `server/seed-db.mjs` pelos dados demonstrativos plausíveis que já existiam no arquivo público. A comparação com o blob anterior confirmou alteração somente na lista de três tabelas da proteção contra seed em banco preenchido. Essa alteração permanece local; o checkpoint mantém o seed remoto anterior inalterado e publica os demais arquivos, sem capturas nem documentos privados.

## Consolidação para o GitHub (18/10/2026)

Usuário solicitou todas as atualizações e a árvore do projeto, com mensagem de commit exata `atulização geral do sistema de gestão`. Conferência inicial: o código de execução já corresponde ao checkpoint remoto da etapa 5; diferenças restantes eram as sete capturas e o reforço de três tabelas no guard do seed.

As sete capturas foram inspecionadas visualmente e correspondem a fixtures fictícias. Após bloqueio inicial da revisão automática, o usuário autorizou especificamente sua publicação pública. Blobs aceitos e hashes conferidos. O seed integral bloqueado permanece inalterado no remoto; sua diferença fica preservada em `patches/seed-finance-guard.patch`, sem cadastros, validada por aplicação em uma cópia temporária sem executar o seed ou alterar banco.

Consolidação em `codex/atualizacao-geral-sistema-gestao`, baseada na etapa 5, com árvore em `docs/ARVORE-DO-PROJETO.md`, manifesto de hashes e relatório em `docs/ATUALIZACAO-GERAL.md`. README remoto preservado; segredos, dados privados, dependências, build e sessões de navegador excluídos. Etapa 6 não iniciada; integrações pendentes da etapa 5 não foram declaradas concluídas. PR de consolidação destinado a main, sem merge automático.
