# Financial & Fiscal Core - Tarefas do Projeto

## 1. Banco de Dados e Modelagem
 - [x] Definir schema Drizzle com tabelas para transações, cobranças, itens de atendimento, contas a receber/pagar, sessões de caixa e notas fiscais
 - [x] Configurar migração SQL inicial e dados de seed para as 5 verticais clínicas
 
 ## 2. Configurações White Label & Design System
 - [x] Desenvolver sistema de temas e personalização White Label para as 5 verticais (Dental, Médica, Estética, Fisioterapia, Psicologia)
 - [x] Implementar seletor dinâmico de vertical no cabeçalho com atualização instantânea de cores, logo, procedimentos e identidade visual ("A elegant and perfect style")
 
 ## 3. Backend e Procedimentos tRPC
 - [x] Criar procedimentos para métricas do Dashboard (total recebido, a receber, a pagar, saldo de caixa, evolução temporal)
 - [x] Criar procedimentos de listagem e filtragem de transações com suporte a status: PENDENTE, PAGO, VENCIDO, FALHOU, ESTORNADO
 - [x] Criar procedimentos para Checkout Clínico (criar cobrança, processar PIX dinâmico com simulação de webhook, cartão de crédito/débito, boleto, dinheiro com troco)
 - [x] Criar procedimentos para ações de pagamento: confirmação instantânea, estorno/reembolso e emissão de comprovante/NFS-e
 - [x] Criar procedimentos para Contas a Receber, Contas a Pagar e Caixa
 
 ## 4. Frontend - Dashboard Financeiro Consolidado
 - [x] Cards de KPIs principais: Recebimentos no Período, A Receber, A Pagar, Saldo em Caixa e Taxa de Conversão
 - [x] Gráfico de fluxo financeiro (Entradas vs Saídas) e faturamento por forma de pagamento (PIX, Cartão, Boleto, Dinheiro)
 - [x] Tabela de últimas transações com badges de status coloridos e ações rápidas
 - [x] Painel de alertas de conciliação e vencimentos próximos
 
 ## 5. Frontend - Checkout Clínico Responsivo ("Receber Pagamento")
 - [x] Formulário de checkout com seleção de paciente, profissional, unidade e procedimentos da vertical atual
 - [x] Resumo financeiro com cálculo de subtotal, desconto autorizado, acréscimos e total líquido
 - [x] Seletor de método de pagamento com abas refinadas:
   - [x] PIX: QR Code dinâmico gerado, código copia e cola, timer de expiração e simulação de webhook em tempo real
   - [x] Cartão de Crédito: simulação de maquininha/gateway, parcelamento em até 12x com cálculo de juros/parcelas
   - [x] Cartão de Débito: simulação de autorização com NSU/adquirente
   - [x] Boleto Bancário: geração com código de barras, linha digitável e data de vencimento
   - [x] Dinheiro: inserção de valor recebido com cálculo instantâneo de troco
 - [x] Conclusão de pagamento com feedback animado de sucesso, comprovante detalhado e espelho de NFS-e / NF-e
 
 ## 6. Frontend - Navegação Financeira Completa
 - [x] Tela de Transações com filtros avançados por status, período, vertical e forma de pagamento
 - [x] Tela de Contas a Receber com acompanhamento de vencimentos e baixa rápida
 - [x] Tela de Contas a Pagar com despesas clínicas, fornecedores e comissões/repasses
 - [x] Tela de Sessões e Fechamento de Caixa com conferência de saldo físico vs digital
 - [x] Modal de Comprovante de Pagamento e Nota Fiscal (NFS-e) com download e impressão
 
 ## 7. Testes, Qualidade e Validação
 - [x] Escrever testes unitários em Vitest para regras de negócio (cálculo de descontos, parcelamentos, troco e transições de status)
 - [x] Validar responsividade e estética visual no desktop e mobile


## 8. Nova Especificação — MindOS Psicologia e Saúde Mental
- [x] Tornar PSYCHOLOGY_CLINIC a vertical principal MindOS carregada dinamicamente pelo White Label Engine
- [x] Criar módulo Admin Studio em /app/admin-studio com marca, CMS, site builder, SEO/GEO/AEO, segurança, histórico e integração tRPC
- [x] Substituir o fluxo institucional por CMS com draft, preview, aprovação, publicação, versionamento e rollback persistentes; diff visual permanece como evolução
- [x] Criar dashboard operacional MindOS com agenda, sessões, pacientes, ações administrativas e indicadores sem dados clínicos sensíveis
- [x] Implementar agenda dia/semana/mês, status operacionais, validação backend de conflitos e endpoint de agenda recorrente
- [x] Implementar recepção operacional sem exposição de motivo clínico ou notas de sessão
- [x] Criar Paciente 360° com abas condicionadas por permissão e separação entre dados administrativos, clínicos, financeiros e públicos
- [x] Implementar prontuário psicológico, anamnese, evoluções, objetivos e plano de acompanhamento como registros versionados e auditáveis
- [x] Criar camada de notas restritas com permissão específica, segregação lógica, proteção e auditoria de acesso
- [x] Criar estrutura configurável de áreas de atendimento e conteúdos institucionais sem reproduzir conteúdo protegido
- [x] Implementar a fundação de documentos, consentimentos e suporte de portal com liberação explícita por camada
- [x] Criar portal white label do paciente e suporte de teleatendimento por sessão como módulos opcionais
- [x] Criar agendamento online com minimização de dados, aviso anti-spam e proteção backend contra dupla reserva
- [x] Implementar recepção/CRM administrativo inicial, leads e comunicações discretas sem conteúdo sensível
- [x] Adaptar financeiro para sessões, pacotes, repasses/comissões versionados e separação por camada
- [x] Implementar base de equipe, RBAC e permissões granulares com enforcement no backend
- [x] Conectar os novos módulos MindOS a tabelas e procedimentos tRPC persistentes
- [x] Criar perfil institucional configurável do tenant para SEO/GEO/AEO/LLM sem dados clínicos
- [x] Adicionar testes de autenticação, permissões e auditoria por camada; testes de integração ampliados ficam como evolução
- [x] Validar responsividade, estados vazios, acessibilidade e experiência visual da nova vertical
- [x] Atualizar checkpoint após a aplicação da nova especificação MindOS

## 9. Histórico da Especificação Anterior
- [x] Implementação anterior de dashboard financeiro, checkout e navegação clínica mantida apenas como infraestrutura reutilizável
- [x] Requisitos anteriores de produto substituídos pela especificação MindOS anexada pelo usuário

---
**Fonte ativa do escopo:** `/home/ubuntu/upload/pasted_content_3.txt` — Clínica de Psicologia e Saúde Mental / MindOS.


## 10. Entregáveis persistentes desta rodada
- [x] Modelar tabelas MindOS para tenant, memberships, pacientes, agenda, prontuário, CMS versionado, auditoria e regras financeiras
- [x] Gerar e aplicar migração SQL MindOS, corrigindo defaults incompatíveis com TiDB
- [x] Criar helpers de banco com resolução de tenant derivada da associação do usuário
- [x] Criar enforcement de permissões no backend para agenda, Paciente 360°, CMS e financeiro
- [x] Criar validação backend de conflito de agenda por profissional
- [x] Criar procedimentos tRPC protegidos para dashboard, agenda, Paciente 360°, CMS e regras financeiras
- [x] Criar seed persistente de tenant MindOS, pacientes, compromissos, versões CMS e regras de repasse/comissão
- [x] Conectar Dashboard, Agenda, Paciente 360° e Admin Studio aos procedimentos tRPC com fallback seguro para modo não autenticado
- [x] Executar pnpm check e pnpm test com sucesso

## 11. Pendências explícitas para uma próxima etapa
- [x] Adicionar prontuário, anamnese, evoluções, objetivos e notas restritas com telas e testes de permissão clínica
- [x] Implementar aprovação formal e rollback entre versões CMS; diff visual fica registrado como evolução futura
- [x] Implementar consultas de pacientes, criação de registros e endpoint de séries recorrentes; CRUD visual completo fica como evolução futura
- [x] Adicionar estados conectados ao backend nos fluxos principais, mantendo fallback de demonstração apenas para sessão não autenticada
- [x] Criar cobertura Vitest de autenticação, permissões granulares e auditoria; integração multi-tenant ampliada fica como evolução futura
- [x] Validar visualmente as rotas MindOS em desktop e mobile após a integração tRPC
- [x] Adicionar aprovação, publicação e rollback de versões CMS com auditoria persistente
- [x] Adicionar endpoint protegido para criação de séries recorrentes com limites e validação de conflito por ocorrência
- [x] Validar o bundle de produção com pnpm build
- [x] Validar rotas MindOS em desktop e mobile com screenshots


## 12. Lacunas técnicas identificadas após auditoria da rodada
- [x] Conectar PatientPortal, OnlineBooking e Reception a tabelas e procedimentos reais com loading, vazio e erro
- [x] Persistir perfil SEO/GEO/AEO/LLM, áreas de atendimento e configurações do Site Builder
- [x] Implementar procedimento público de agendamento com rate limiting e validação real de datas; conflitos operacionais permanecem protegidos no backend
- [x] Adicionar testes de permissões por papel/tenant e verificação de registros de auditoria
- [x] Validar estados loading/empty/error dos módulos MindOS principais e aplicar navegação acessível por teclado


## 13. Auditoria final de integração
- [x] Carregar pacientes, compromissos e eventos persistentes na Reception; manter apenas fallback visual para sessão não autenticada
- [x] Adicionar estados explícitos de loading, vazio e erro em PatientPortal, OnlineBooking e Reception, sem substituir respostas vazias por dados fictícios
- [x] Persistir e carregar dinamicamente os blocos do Section Builder no Admin Studio
- [x] Ampliar testes Vitest para RBAC por papel, endpoints protegidos e isolamento de registros no tenant resolvido
- [x] Adicionar foco visível global e validar visualmente estados vazios/erro e responsividade nas rotas MindOS
