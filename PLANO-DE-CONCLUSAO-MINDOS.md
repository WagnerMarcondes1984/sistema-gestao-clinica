# Plano de tarefas para conclusão do MindOS

Data: 17/10/2026.

Objetivo: concluir uma plataforma de gestão clínica para psicologia e saúde mental, com CRM administrativo, portal e financeiro. CRM comercial avançado será uma entrega posterior à estabilização da operação clínica.

Acompanhe resultados e ponto de retomada em [docs/EXECUCAO-DO-PLANO.md](docs/EXECUCAO-DO-PLANO.md).

Este plano complementa o `todo.md`. As marcações antigas não comprovam funcionamento: cada entrega abaixo precisa atender aos seus critérios de aceite. Nenhuma tarefa deste plano foi considerada concluída apenas por existir uma tela ou tabela.

## 1. Preparar ambiente e confirmar a situação atual — prioridade crítica

- [x] Instalar as dependências respeitando o arquivo de lock.
- [x] Criar `.env.example` com nomes e explicações das variáveis, sem segredos reais.
- [x] Configurar banco exclusivo de desenvolvimento e aplicar migrações.
- [x] Conferir se o seed cobre as tabelas necessárias e executar apenas no banco de teste.
- [x] Executar checagem TypeScript, testes e build; registrar falhas e corrigir bloqueios. Também validados schema, seed, integração, HTTP e navegador; evidências em `docs/EXECUCAO-DO-PLANO.md`.
- [x] Mapear rotas e ações como funcionais, parciais, demonstrativas ou pendentes de revisão. Inventário de rotas e 138 handlers em `docs/INVENTARIO-FUNCIONAL.md` e `docs/ACOES-DA-INTERFACE.md`; homologação visual integral continua na etapa 8.
- [x] Documentar execução local e decisões pendentes: autenticação, hospedagem, pagamentos, fiscal e comunicação.

Aceite: outra pessoa consegue iniciar o projeto com a documentação; build e verificações passam; limitações estão registradas sem apresentar demonstrações como operações reais.

## 2. Corrigir autenticação e isolamento de dados — prioridade crítica

Depende da etapa 1. Esta etapa bloqueia qualquer piloto com dados reais.

- [x] Decisão de autenticação: manter Manus por enquanto, conforme escolha do usuário. Validação do login real depende das credenciais do ambiente; revisão de sessão/saída implementada.
- [x] Implementar entrada explícita da clínica, convites de uso único, ativação/desativação, reativação, papéis e permissões por associação. Interface em `/app/team` e `/invite`; validar login externo real quando configurado.
- [x] Definir matriz explícita de permissões para administrador, psicólogo, recepção, financeiro, comercial e paciente. Modelos em `shared/permissions.ts`; gestão visual implementada nesta entrega.
- [x] Exigir autenticação e autorização nas rotas financeiras e de auditoria.
- [ ] Concluir associação revisada dos registros financeiros legados, quando houver base existente. Colunas de clínica e migrações já foram aplicadas e testadas; registros sem associação permanecem isolados. Não inferir clínica pela vertical.
- [x] Aplicar o filtro da clínica autenticada em todas as leituras e alterações financeiras.
- [x] Vincular o usuário do portal ao seu paciente e remover o `patientId` fixo; impedir consulta a outro paciente pelo servidor.
- [x] Separar leitura e finalização de notas restritas das permissões gerais de prontuário.
- [ ] Validar referências a pacientes, profissionais, documentos e sessões dentro da clínica correta em todas as alterações.
- [x] Resolver a clínica pública por domínio ou identificador validado, substituindo a seleção da primeira clínica ativa.
- [ ] Registrar autor autenticado nas operações e impedir que um nome enviado pelo cliente substitua sua identidade na auditoria.

Aceite: testes com duas clínicas comprovam isolamento; usuário anônimo não consulta nem altera financeiro; recepção não acessa prontuário; paciente acessa somente os próprios dados; permissão clínica comum não libera notas restritas.

## 3. Concluir pacientes, equipe, agenda e recepção — prioridade alta

**Implementada e validada localmente em 18/10/2026; parada para revisão visual do usuário. Operação e evidências em `docs/ETAPA-3-OPERACAO.md`. Não iniciar a etapa 4 sem novo comando.**

Depende da etapa 2.

- [x] Completar criação, listagem, busca, edição e inativação de pacientes, com validação e prevenção de duplicidades. Interface e servidor entregues; limites e critérios de comparação em `docs/ETAPA-3-PACIENTES.md`.
- [x] Concluir cadastro de profissionais, serviços, unidades e disponibilidade.
- [x] Conectar a seleção real de paciente às telas Paciente 360°, prontuário e agenda. Seleção por URL e busca, sem ID fixo; alterações de agenda seguem nos próximos itens.
- [x] Implementar confirmação, cancelamento, reagendamento, falta e conclusão das sessões, com transições válidas.
- [x] Completar criação e edição visual de recorrências, incluindo alteração de uma ocorrência ou da série.
- [x] Garantir que reservas simultâneas não criem dupla marcação; a verificação deve resistir à concorrência no banco.
- [x] Transformar solicitações públicas em fluxo de triagem, contato, confirmação ou recusa, com proteção contra abuso.
- [x] Fazer o check-in atualizar a sessão correta e refletir a fila real do dia.
- [x] Substituir contadores, dados fixos e botões de mensagem por operações persistentes.
- [x] Conferir datas e horários no fuso da clínica.

Aceite: cadastrar paciente, agendar, receber solicitação online, confirmar, fazer check-in, concluir e reagendar funcionam de ponta a ponta; duas tentativas simultâneas não reservam o mesmo profissional no mesmo horário.

## 4. Concluir prontuário, documentos e portal — prioridade alta

**Não iniciada: aguardar análise do usuário da etapa 3 e novo comando.**

Depende das etapas 2 e 3.

- [ ] Completar edição de rascunhos, finalização e adendos, preservando histórico e autoria.
- [ ] Proteger versões finalizadas contra sobrescrita e validar integridade dos registros.
- [ ] Definir quais profissionais podem acessar cada paciente e aplicar essa regra no servidor.
- [ ] Implementar upload, armazenamento privado, download autorizado e revogação de documentos.
- [ ] Implementar consentimentos versionados, aceite ou assinatura conforme o requisito definido, com evidência de autoria e data.
- [ ] Conectar o portal ao nome, sessões, documentos e financeiro reais do paciente.
- [ ] Persistir solicitações de reagendamento e encaminhá-las à equipe.
- [ ] Implementar teleatendimento com controle de acesso por sessão se estiver no escopo do lançamento; caso contrário, remover a ação demonstrativa.

Aceite: profissional autorizado registra e finaliza atendimento; alteração posterior gera histórico; paciente vê apenas documentos liberados; revogação impede novo acesso; ações do portal produzem resultado persistente.

## 5. Concluir financeiro e integrações reais — prioridade alta

Depende das etapas 2 e 3. A escolha dos provedores antecede sua implementação.

- [ ] Recalcular totais, descontos, parcelas e troco no servidor; rejeitar valores inconsistentes ou negativos.
- [ ] Garantir consistência entre cobrança, itens, parcelas, contas e caixa com transações de banco.
- [ ] Vincular cobrança a paciente, clínica e atendimento; conectar sessões, pacotes e repasses às regras financeiras.
- [ ] Integrar os meios de pagamento contratados; desativar simulação no ambiente de produção.
- [ ] Validar autenticidade de webhooks e impedir processamento duplicado, inclusive em reenvios e eventos fora de ordem.
- [ ] Implementar estorno real e conciliação com o provedor, com trilha de auditoria.
- [ ] Integrar emissão fiscal com o serviço escolhido, incluindo rejeição, cancelamento e consulta de situação.
- [ ] Separar recibo interno de documento fiscal autorizado e remover indicações falsas de emissão.
- [ ] Completar contas a pagar/receber, baixas, abertura e fechamento de caixa com saldos verificáveis.
- [ ] Validar relatórios financeiros contra lançamentos e retornos dos provedores.

Aceite: pagamento em ambiente de testes do provedor atualiza uma única cobrança; webhook duplicado não duplica receita; estorno corresponde ao retorno externo; nota só aparece como emitida após autorização; caixa e relatórios fecham com os lançamentos.

## 6. Concluir CRM administrativo e comunicação — prioridade alta

Depende da etapa 3 e das permissões da etapa 2.

- [ ] Criar fila de leads com etapas definidas, responsável, origem e próximo contato.
- [ ] Unificar entrada manual e solicitações online, evitando duplicação de pacientes.
- [ ] Implementar tarefas de retorno, vencimentos e histórico administrativo de interações.
- [ ] Integrar envio real de e-mail e/ou WhatsApp com o provedor escolhido.
- [ ] Registrar envio, entrega e falha; respeitar preferências de contato e evitar conteúdo clínico nos lembretes.
- [ ] Criar lembretes de sessão, confirmação e retorno com prevenção de duplicidades.
- [ ] Calcular indicadores reais de conversão de lead em paciente, comparecimento e retorno.

Aceite: um lead entra, recebe responsável e tarefa, tem contato registrado e vira paciente sem perda de histórico; mensagens mostram a situação real de entrega.

## 7. Concluir administração e conteúdo público — prioridade média

Depende da etapa 2 e da definição das funcionalidades do lançamento.

- [ ] Persistir identidade visual e configurações que hoje são apenas locais ou demonstrativas.
- [ ] Completar edição de blocos e ligar o conteúdo publicado ao site público da clínica.
- [ ] Conectar aprovação e rollback na interface, respeitando permissões e estados do CMS.
- [ ] Mostrar situação real de domínio e publicação; remover indicadores fixos como DNS e SSL verificados.
- [ ] Publicar metadados e conteúdo institucional configurados, sem incluir informações privadas.
- [ ] Ocultar módulos não entregues ou explicar claramente sua indisponibilidade.

Aceite: salvar rascunho não altera o site publicado; publicação aprovada altera somente a clínica correta; rollback restaura uma versão anterior; a interface não afirma configurações que não foram verificadas.

## 8. Validar operação e preparar produção — prioridade crítica para lançamento

Depende das etapas incluídas no escopo do lançamento.

- [ ] Criar testes de integração dos fluxos principais com banco de teste e testes de autorização entre clínicas, pacientes e papéis.
- [ ] Testar concorrência de agenda, consistência financeira e reenvio de webhooks.
- [ ] Verificar fluxos completos no navegador em desktop e celular, incluindo teclado, erros e estados vazios.
- [ ] Definir retenção, exportação e exclusão de dados, privacidade e consentimentos com os responsáveis pelo produto.
- [ ] Configurar segredos, HTTPS, armazenamento privado e limites contra abuso.
- [ ] Configurar backup e executar uma restauração de teste.
- [ ] Configurar monitoramento e alertas sem registrar conteúdo clínico ou segredos em logs.
- [ ] Preparar implantação, migrações, reversão, suporte e resposta a incidentes.
- [ ] Fazer homologação com administrador, recepção, psicólogo, financeiro e paciente.
- [ ] Realizar piloto controlado e corrigir problemas antes de ampliar o uso.

Aceite: fluxos homologados, verificações automatizadas aprovadas, restauração comprovada e nenhuma falha crítica conhecida de acesso, isolamento ou consistência de dados. Publicação em produção é uma ação separada da preparação técnica.

## 9. Evolução para CRM comercial avançado — após a operação clínica estável

- [ ] Criar oportunidades e funil visual com valores, etapas e motivos de perda.
- [ ] Adicionar propostas, metas e acompanhamento de conversão por origem e responsável.
- [ ] Implementar segmentações e automações comerciais de acordo com preferências de comunicação.
- [ ] Criar relatórios comerciais sem expor dados clínicos.

Aceite: acompanhar a jornada comercial da captação à contratação, com tarefas e indicadores baseados em dados reais.

## Ordem de execução e controle

1. Preparar ambiente e corrigir segurança: etapas 1 e 2.
2. Concluir operação clínica: etapas 3 e 4.
3. Concluir financeiro, relacionamento e administração: etapas 5, 6 e 7.
4. Homologar e preparar lançamento: etapa 8.
5. Expandir o CRM comercial: etapa 9.

Para cada tarefa, registrar responsável, dependências, evidência de validação e situação: pendente, em andamento, bloqueada ou concluída. Uma tarefa só é concluída quando funciona na interface e no servidor, persiste corretamente e respeita as permissões aplicáveis.

Não há prazo fechado neste plano. O cronograma deve ser estimado após a etapa 1 e a escolha dos provedores, considerando equipe disponível e escopo do primeiro lançamento.
