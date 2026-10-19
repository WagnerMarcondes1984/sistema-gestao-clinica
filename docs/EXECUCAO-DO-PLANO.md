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

| Verificação                       | Resultado                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| TypeScript                        | Aprovado                                                                                                           |
| Suíte unitária completa           | 47 aprovados e 1 ignorado por ausência de banco na suíte unitária                                                  |
| Logout após ajuste de cookie HTTP | 2 testes aprovados, incluindo o caso novo                                                                          |
| Integração em MySQL local         | 7 testes aprovados; registros fictícios temporários removidos ao final                                             |
| Schema                            | 20 tabelas e 241 colunas correspondentes ao código                                                                 |
| Seed e repetição                  | Inserção concluída; repetição recusada sem alterar contagens                                                       |
| Build                             | Aprovado; permanece aviso de bundle grande                                                                         |
| HTTP real                         | Acesso anônimo negado, sessão válida aceita, app incorreto negado, portal vinculado e simulação de produção negada |
| Chrome headless                   | Portal anônimo/autenticado, documentos e logout com recarregamento aprovados                                       |

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

## Etapa 6 — CRM administrativo interno (18/10/2026)

Início autorizado pelo usuário; provedores de e-mail e WhatsApp definidos como a definir. Implementados leads por etapa/responsável/origem/próximo contato, importação de solicitações com seleção explícita e conferência de identidade, conversão em paciente sem perder histórico, tarefas com prazo e resolução, interações administrativas com autoria, preferências pela equipe e pelo próprio paciente, preparação idempotente de lembretes neutros e indicadores calculados sobre registros reais. Confirmar solicitação na recepção integra a conversão na transação original; vínculo conflitante reverte também o agendamento.

Comunicação externa permanece pendente. Não existe envio, cron ou situação de entrega inventada. Lembretes são somente preparações, suprimidas conforme preferência e reconciliadas com versões da agenda ao preparar novamente. Novas permissões VIEW_CRM/MANAGE_CRM não ampliam vínculos existentes; conversão exige também MANAGE_PATIENTS. Guia operacional em `ETAPA-6-CRM-E-COMUNICACAO.md`.

Migração 0014 aplicada preservando dados: 39 tabelas e 485 colunas conferidas. TypeScript e build aprovados, mantendo aviso de tamanho do bundle; 151 testes unitários aprovados e um caso antigo dependente de banco ignorado; 103 cenários de integração MySQL aprovados, incluindo 21 de CRM. Inventário atualizado com 156 handlers. Seis segredos locais conferidos sem ocorrência no payload de código nem nos arquivos públicos do build.

O patch `patches/seed-finance-guard.patch` agora preserva também cinco tabelas CRM na proteção contra seed em banco preenchido. Aplicado em cópia temporária do blob remoto original, reproduziu exatamente o seed local, sem executá-lo. O seed integral permanece excluído do envio por restrição anterior da revisão automática. Capturas novas da etapa 6 permanecem locais; a autorização anterior cobre somente as sete imagens já publicadas das etapas 4 e 5. Árvore e manifesto da consolidação geral continuam como registro histórico daquele checkpoint.

Checkpoint da etapa: `codex/etapa-6-crm-administrativo`, baseado em `codex/atualizacao-geral-sistema-gestao`, sem merge. Parar para análise no localhost antes da etapa 7. Aceite integral da etapa 6 depende de escolher e homologar provedores reais, eventos de entrega/falha e disparo seguro; não foi declarado concluído.

A primeira verificação de navegador bloqueou corretamente lembretes do paciente fictício sem contato cadastrado; a expectativa do teste foi corrigida adicionando endereço `example.com` e canal e-mail na fixture, sem alterar a regra do produto. Uma conferência do seed executada enquanto o navegador criava pacientes encontrou contagem temporária maior; repetida após a limpeza, aprovou API/seed e recusa de reexecução com todas as contagens preservadas. Verificações que dependem de contagem global devem rodar sem escrita concorrente.

Verificação final do Chrome aprovada, sem exceções de execução: regressões de equipe, pacientes, agenda, prontuário, documentos, consentimentos, portal e financeiro; CRM com lead/responsável/etapa, interação e histórico, tarefa vencida/editada/concluída, conversão em um paciente, importação com identidade conferida, preferências pela equipe e pelo paciente, preparação repetida sem duplicação, retirada de autorização com supressão e consulta sem permissão de escrita. Capturas desktop/celular inspecionadas e mantidas locais em `previews/crm-etapa6*.png`. Dados temporários do teste removidos ao finalizar.

## Etapa 7 — administração e site público (18/10/2026)

Etapa 6 interna revisada e início da etapa 7 autorizado pelo usuário. Revisado o Admin Studio: preview/publicação demonstrativos, campos sem persistência, ausência de aprovação obrigatória e indicação fixa de DNS/SSL verificados. Substituídos por snapshots completos de marca, blocos ordenáveis/habilitáveis, itens, metadados, contato público e atalhos, com prévia autenticada e publicação aprovada.

Novo site HTML renderizado pelo servidor em `/site/<slug>`, título/descrição/Open Graph/dados estruturados/llms.txt derivados somente do snapshot publicado. Agendamento preserva o slug explícito da clínica e valida o serviço na mesma clínica. Marca publicada aplicada ao cabeçalho compartilhado e portal; seletor local de verticais e nomes demonstrativos de operador/unidade removidos desse cabeçalho. Não provisiona hospedagem, DNS ou certificado: situação exibida como não verificada. Integrações ainda indisponíveis explicadas no próprio Admin Studio.

Escritas usam lock da clínica, revisão, autoria e auditoria na transação. Salvar rascunho não altera publicado; aprovar não publica; restauração aceita apenas versão anteriormente aprovada/publicada e preserva o snapshot. Conteúdo não tem HTML/CSS/scripts arbitrários; escape em HTML/atributos/JSON-LD, cores validadas e origem canônica HTTPS sem credenciais. Privacidade da prévia e isolamento do site não dependem de IDs enviados sem filtro. Permissões separadas VIEW_PUBLIC_SITE/MANAGE_PUBLIC_SITE/PUBLISH_PUBLIC_SITE; nenhum vínculo existente foi ampliado.

Migração 0015 aplicada de forma aditiva; snapshots legados preservados e identificados, sem publicação automática. O endpoint antigo de escrita institucional foi desativado em favor do fluxo versionado. Guia completo em `ETAPA-7-ADMINISTRACAO-E-SITE-PUBLICO.md`.

Verificações iniciais: 156 testes unitários aprovados e um caso antigo dependente de banco ignorado; TypeScript e build aprovados, mantendo aviso de bundle grande. O primeiro teste de agendamento por slug encontrou nameKey ausente na fixture do serviço; corrigido apenas o cadastro de teste. Os 14 cenários do CMS passaram no MySQL, inclusive falha de auditoria revertendo publicação.

A primeira suíte completa teve timeout de 30 segundos nos hooks de preparação/limpeza do CRM e agenda (102 cenários aprovados e 15 não executados). Diagnóstico: MySQL ativo, espaço disponível e sem transações presas observadas; a preparação de agenda grava dezenas de disponibilidades e a limpeza faz exclusões em série. Clínicas temporárias e disponibilidade órfã conferidas sem sobras. Aumentado somente hookTimeout para 120 segundos, mantendo o limite de 30 segundos por teste e todas as asserções. Suíte completa repetida para obter resultado final sem testes interrompidos; nenhuma configuração de durabilidade ou segurança do MySQL foi reduzida.

Preparação da revisão: `node scripts/open-review.mjs --studio`, somente clínica e contas fictícias em localhost, publicação demonstrativa pelo próprio fluxo autenticado, sem troca de Manus. Novas capturas permanecem locais. Checkpoint previsto em `codex/etapa-7-administracao-site`, baseado em `codex/etapa-6-crm-administrativo`, para revisão sem merge. Parar antes da etapa 8.

Resultado final de banco: 117 testes de integração aprovados em oito arquivos, sem casos interrompidos; schema conferido com 39 tabelas e 490 colunas. API e demonstração original preservadas; seed repetido recusado sem alterar contagens. Contrato do CMS validado também com snapshot Unicode maior que 65.535 bytes. Verificação final unitária: 156 aprovados e um caso antigo ignorado. Limite explícito de 300 caracteres para origem canônica, escape e contraste verificados; ajustes de quebra de texto evitam transbordamento de conteúdo editorial.

Chrome final aprovado sem exceções de execução: regressões de equipe, pacientes, agenda, recepção, prontuário, documentos, consentimentos, portal, financeiro e CRM; novo fluxo de marca/blocos/SEO, persistência, prévia privada (403 anônimo, 404 de outra clínica, 200 autorizado), rascunho/aprovação sem alterar público, publicação, aplicação da marca no portal e restauração com HTML idêntico ao anterior. HTTP público, metadados e llms.txt conferidos; agendamento com slug explícito e consulta sem ações de publicação validados. Capturas desktop/celular inspecionadas, sem transbordamento na página pública móvel, mantidas somente locais em `previews/admin-etapa7.png`, `previews/site-etapa7.png` e `previews/site-etapa7-mobile.png`. Sessões do harness ampliadas para 20 minutos somente nas fixtures locais, sem mudar autenticação do produto; dados temporários removidos na saída.

Inventário atualizado com 157 handlers; texto do gerador corrigido para não atribuir o levantamento atual apenas à etapa 3. TypeScript e build finais aprovados após os últimos limites de entrada/quebra de texto. Nenhum provedor foi contratado ou simulado; nenhum domínio foi conectado; nenhuma mensagem externa enviada. Etapa 7 pronta para revisão no localhost. Não iniciar etapa 8 sem novo comando.

## Etapa 8 — preparação operacional, primeiro bloco (18/10/2026)

Início autorizado após revisão da etapa 7. Usuário escolheu servidor/VPS com Docker; destino externo de backups continua a definir. Etapa 8 em andamento, sem aprovação de produção e sem iniciar a etapa 9.

Implementadas validação de configuração/segredos e build Manus na inicialização, proxy confiável explícito, cookies protegidos, validade de sessão configurável (8 horas por padrão), limites HTTP, recusa de operações de origem cruzada, headers de proteção e erros sem stack/SQL no cliente. Logs HTTP mínimos não incluem conteúdo clínico, URL/query, IP ou segredos. Proxy legado de armazenamento sem autorização desativado; fluxo atual de documentos privados preservado. Health de processo e readiness real de banco/migrações/armazenamento privado. IP do agendamento público vem do Express com proxy validado, evitando agrupar todos os visitantes no gateway e recusando cabeçalho falso de origem não confiável.

Backup manual offline AES-256-GCM, manifesto completo e chaves clínicas/documentais cifradas dentro do payload, com chave de backup independente e externa. Recusa aplicativo ativo, origem Docker diferente da URL, documento referenciado ausente, mudança de manifesto durante a cópia, objetos SQL não suportados, links e travessia de arquivo. Sem sobrescrita de pasta de extração existente. Cópias e evidências permanecem em `.mindos-private`, fora de Git/build/contexto Docker; a chave nunca foi exibida.

Primeiras tentativas de recuperação não aprovaram dados: MySQL isolado ficou inicializando arquivos além do prazo sob forte contenção de disco do host. A construção local da imagem foi interrompida para priorizar o ensaio; nenhum serviço de outro projeto foi parado. Para o banco descartável, adotado datadir temporário em memória de 512 MiB e limite de contêiner de 768 MiB, sem alterar durabilidade do banco original. Outra tentativa revelou diferença de interpretação de datas no verificador direto mysql2 (fuso local versus UTC do Drizzle). Corrigida a conexão do verificador para UTC; nenhuma data original foi regravada.

Ensaio final aprovado em 49.038 ms, finalizado às 21:52:03 UTC: **40 tabelas, 541 linhas, 1 arquivo privado, 1 documento aberto/autenticado e 4 versões clínicas com cadeia HMAC, cabeçalho e snapshot final conferidos**. Inclui histórico de migração, além das 39 tabelas da aplicação. Destino removido e recibo autenticado gravado atomicamente. Mede recuperação lógica local, não RTO de disco/VPS ou cópia externa. Registros legados não receberam integridade retroativa.

Tela `/app/readiness` consulta essas verificações e o recibo local com permissão `MANAGE_TEAM`; não revela chaves, caminhos, contagens globais ou dados de outras clínicas. Mantém indicação explícita de produção pendente, sem botão de restauração/exclusão. Teste MySQL confirma gestores no contexto correto e recusa a consulta sem permissão.

Preparados Dockerfile com execução sem root e dependências de produção, Compose com volumes persistentes/portas em loopback/raiz somente leitura/capacidades removidas, usuário MySQL do app com DML somente e credencial de migração separada, proxy HTTPS de exemplo, migrações serializadas sem seed e runbooks de atualização, reversão, backup e incidentes. O script de inicialização de privilégios atende base nova; volume existente exige migração assistida de usuários, sem apagar dados. Implantação real não executada.

Validação: TypeScript aprovado; build aprovado com aviso de bundle principal grande (~1,18 MB); 183 testes unitários aprovados e um caso antigo ignorado; 118 integrações MySQL aprovadas nos oito arquivos. Testes adicionais de backup autenticado repetidos após os ajustes do CLI: cinco aprovados. Logs do OAuth nos testes indicam configuração externa ausente, conforme a dependência Manus mantida; não são evidência de login real homologado.

Pendentes: provedor/destino externo, frequência/retenção, recuperação externa e RPO/RTO, DNS/HTTPS/login real no VPS, análise de imagens/vulnerabilidades na implantação, alertas/destinatário, retenção/exportação/exclusão com os responsáveis, homologação humana por papel e piloto. Integrações de pagamento/fiscal/e-mail/WhatsApp seguem sem provedor e sem entrega externa simulada. Guias em `ETAPA-8-OPERACAO-E-PRODUCAO.md`, `BACKUP-E-RECUPERACAO.md` e `VPS-DOCKER-E-INCIDENTES.md`.

Checkpoint previsto: `codex/etapa-8-preparacao-operacional`, baseado em `codex/etapa-7-administracao-site`, em PR rascunho, sem merge. Seed integral remoto preservado; patch anterior mantém o guard local. Nenhuma captura nova, backup, recibo, ambiente real ou documento privado será publicado. Ao terminar este bloco técnico, abrir localhost para análise e parar antes da etapa 9.

Chrome final aprovado sem exceções de execução: regressões completas de equipe, pacientes, agenda, prontuário, documentos/consentimentos/portal, financeiro, CRM e CMS; preparação operacional em desktop/celular sem transbordamento, navegação por Tab, atualização real, recusa ao paciente e health checks reais com 200. Nenhuma indicação de produção aprovada. Seis testes HTTP de proxy/origem/erros repetidos após o ajuste do IP confiável: aprovados. Verificação adicional em diretório temporário confirmou aceitação de 0700 e recusa de 0755; nenhuma permissão da origem foi alterada. Compose final validado sem iniciar serviços.

Conferência pós-limpeza: 39 tabelas e 490 colunas correspondem ao schema; API, demonstração original e recusa de reexecução do seed aprovadas, com contagens preservadas. Nenhuma migração nova de dados foi necessária nesta etapa. Capturas de revisão da etapa 8 são somente locais, sem autorização presumida para publicação.

Revisão da custódia: removida a chave de descriptografia do ambiente da aplicação de produção. O host operacional assina a evidência com Ed25519 e o app recebe somente `RECOVERY_RECEIPT_PUBLIC_KEY`; nem a chave de abertura nem a chave privada de assinatura são passadas ao contêiner do app. Script `recovery-public-key.mjs` imprime somente a chave pública. Configuração operacional de backup tem exemplo separado. Os 21 testes dos componentes de backup, configuração e evidência foram repetidos e aprovados após o ajuste; TypeScript e bundle do servidor aprovados.

Novo ensaio completo com assinatura final Ed25519 aprovado: **40 tabelas, 543 linhas, 1 arquivo, 1 documento autenticado, 4 versões clínicas**, finalizado às 22:22:34 UTC; fase de recuperação em 92.694 ms sob a contenção do host. Limpeza do contêiner confirmada e recibo assinado escrito apenas depois dela. As duas linhas a mais foram observadas após as ações de revisão fictícia; cada ensaio foi comparado ao seu próprio manifesto, sem alteração do protocolo de conferência. Não houve mudança de chaves de documentos, prontuários ou backups existentes. A interrupção durante a preparação da revisão foi ajustada para encerrar seu servidor filho desde o início, evitando servidor órfão ao cancelar antes de abrir o navegador.

Importação de recuperação reforçada com `--binary-mode=1 --local-infile=0`. A versão instalada do cliente MySQL reconhece a opção; no destino descartável, uma tentativa inofensiva de comando local do cliente foi recusada antes de importar o SQL. Ensaio completo final aprovado às 22:55:47 UTC: 40 tabelas/543 linhas, 1 documento privado e 4 versões clínicas, destino removido e recibo Ed25519 autenticado. Nenhuma importação foi feita no banco original.

A compilação dentro do Docker passou. Sob a contenção de disco do host, a montagem com alteração recursiva de proprietário ficou sem concluir; interrompida somente a construção deste projeto. A configuração final mantém código/dependências pertencentes ao root e escrita apenas em diretórios privados do usuário do app. Contexto de build exclui também documentação e ferramentas operacionais, para não invalidar a compilação por alterações nesses arquivos. Nova montagem e ensaio de imagem em validação; não há comprovação de implantação em VPS. A preparação da janela de revisão sofreu timeout de inicialização/CDP enquanto o Docker ocupava o disco; prazos somente do script local foram ajustados (servidor 120 s, protocolo do Chrome 90 s), sem mudar limites da aplicação ou a autenticação.

Imagem local `mindos:stage8-review` construída e exportada com sucesso, com parâmetros públicos fictícios `.test`. Manifesto local: `sha256:f21ba9892dff36ee6dcc9b227631a326c8f10f3b45890e350bc8f1f5198fd09c`. Compilação de produção na imagem: JS principal ~765 kB, mantendo aviso acima de 500 kB. Dependências de desenvolvimento removidas; scripts de instalação ignorados pelo pnpm não impediram o build. Aviso de proveniência Git decorre do checkout sem metadados Git utilizáveis; fonte preservada no PR rascunho #10, commit `2ea52598b394c5e7c2ec8f901ee761485a0fbdcf`. Ensaio técnico da imagem em banco descartável iniciado; não é implantação no VPS nem autenticação Manus real.

Ensaio final da imagem **aprovado**: execução sem root, código sem permissão de escrita pelo app, duas migrações sem duplicação e sem seed, usuário de execução com operações DML e sem DDL, chave de backup ausente do ambiente do app, readiness real, recusa HTTP sem HTTPS e acesso anônimo, API autenticada com a clínica fictícia correta, encerramento normal e remoção dos destinos descartáveis. A primeira tentativa excedeu 60 segundos de inicialização sob contenção de disco; o verificador ganhou diagnóstico restrito e prazo de 180 segundos, e a repetição passou. Contêineres de sondagem usam `--no-healthcheck` para evitar que uma verificação herdada na porta 3000 consulte outro serviço quando o teste usa porta aleatória na rede do host. Não houve redução das proteções da aplicação.

Checkpoint publicado em [PR rascunho #10](https://github.com/WagnerMarcondes1984/sistema-gestao-clinica/pull/10), baseado na etapa 7, sem merge: commit inicial `2ea52598b394c5e7c2ec8f901ee761485a0fbdcf`, árvore `82d1df7430be4dfde13341fceeb123ba11e2b85c`, 52 arquivos alterados e 304 arquivos preservados na árvore completa, com hashes conferidos. O complemento registra a aprovação do ensaio e os ajustes das ferramentas de verificação. Seed integral, imagens novas, segredos e arquivos privados permanecem excluídos.

Retomada da revisão local: prazo de inicialização do script ampliado de 120 para 300 segundos após os timeouts de disco; protocolo do Chrome mantém 90 segundos. Esses prazos afetam somente a ferramenta de revisão local. A etapa 8 continua em andamento pelas pendências externas e de homologação humana; etapa 9 não iniciada.

Revisão retomada e aberta no Chrome em `http://localhost:3420/app/readiness`, com sessão fictícia temporária. A ferramenta confirmou a evidência Ed25519 na tela; capturas desktop/celular conferidas visualmente, mantidas somente em `/tmp`. Banco, migrações, armazenamento privado e restauração aparecem verificados, junto do aviso explícito de produção pendente. Navegador e servidor local permaneceram abertos para análise do usuário.
