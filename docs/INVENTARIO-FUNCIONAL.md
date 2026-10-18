# Inventário funcional — base de 17/10/2026

Inventário inicial com atualização das etapas 2 a 7; a homologação visual completa continua pendente. “Parcial” indica que existe implementação persistente, mas a jornada tem lacunas; não equivale a funcionalidade aprovada para produção.

| Rota | Situação | Evidência e trabalho restante |
|---|---|---|
| `/` | Operação implementada e testada | Painel com contadores reais e atalhos autorizados; removidos fallback, pendências e ações demonstrativas da rotina clínica. |
| `/crm` | CRM interno implementado; comunicação externa pendente | Leads, importação com identidade conferida, conversão, tarefas, histórico, preferências, preparação de lembretes e indicadores. Nenhum envio externo. |
| `/agenda` | Implementado e testado | Criação única/recorrente, edição de ocorrência/série, transições, filtros, fuso e conflitos transacionais. |
| `/app/scheduling` | Implementado e testado | Profissionais, unidades, serviços, publicação de serviços, disponibilidade e fuso da clínica. |
| `/patients` | Implementado e testado | Cadastro administrativo, busca, paginação, edição e inativação, com autorização, duplicidades e controle de edição concorrente. |
| `/patients/view` | Implementado e testado neste bloco | Paciente selecionado por URL, dados administrativos e histórico real, links para agenda e prontuário. Módulos completos dependem das etapas seguintes. |
| `/clinical-records` | Implementado e testado | Edição, finalização, adendos, autoria, histórico HMAC e vínculo clínico explícito. Legado identificado sem fabricar histórico. |
| `/reception` | Implementado e testado | Fila do dia, check-in por sessão, contadores reais, registro manual de ligação e triagem de solicitações. Inclui triagem de reagendamento do portal com substituição atômica de sessão. Não envia mensagens externas. |
| `/portal` | Implementado e testado | Sessões, documentos privados liberados, consentimentos versionados, receitas vinculadas e pedidos de reagendamento do próprio paciente. |
| `/patient-care` | Implementado e testado | Documentos privados, vínculo por psicólogo, evidências de consentimento e liberação explícita de receita. |
| `/app/consents` | Implementado e testado | Rascunho, publicação e aposentadoria de versões; preservação das decisões. |
| `/book` | Implementado e testado | Serviços publicados, dados mínimos, validação, limites persistentes e solicitação que segue para triagem. Não reserva automaticamente. |
| `/app/team` | Implementado e testado | Gestão de vínculos, permissões, ativação e convites com isolamento por clínica. Login externo real pendente de configuração. |
| `/invite` | Implementado e testado | Verificação e aceitação pessoal, expiração e proteção contra reutilização. Fluxo OAuth de retorno coberto por testes com mocks. |
| `/app/admin-studio` | Implementado e testado | Marca, blocos ordenáveis, SEO, prévia privada, aprovação, publicação e restauração com revisão e auditoria atômica. DNS/TLS indicados como não verificados. |
| `/site/<slug>` e `/site` | Site público implementado e testado | HTML/metadados no servidor apenas da versão publicada; llms.txt, isolamento por slug e agendamento na clínica explícita. Domínio externo não provisionado. |
| `/finance` | Resumo interno implementado e testado | Leitura transacional de receitas líquidas, parcelas, despesas e caixa; divergências bloqueiam os números. Legado separado; sem gráficos fictícios. |
| `/checkout` | Controle interno implementado e testado | Paciente e sessão reais, cálculo do servidor, parcelas exatas, revisão e criação pendente idempotente. Integrações bancárias/fiscais pendentes. |
| `/transactions` | Controle interno implementado e testado | Busca/paginação, histórico, baixas e reversões manuais auditadas. Não executa estorno bancário. |
| `/receivables` | Controle interno implementado e testado | Saldo original em aberto, parcelas e atraso no fuso da clínica; conciliação externa pendente. |
| `/payables` | Controle interno implementado e testado | Cadastro de despesa, pagamento manual parcial/integral, referência e saída em espécie vinculada ao caixa. |
| `/cash` | Controle interno implementado e testado | Abertura única, movimentos, dinheiro/troco, suprimento/sangria, revisão e contagem de fechamento; legado bloqueado. |
| `/audit` | Controle interno implementado e testado | Autoria do banco, eventos transacionais e referência. Eventos antigos preservados e identificados como potencial simulação. |
| `/404` | Implementado no código | Tela de rota inexistente; revisar comportamento no navegador durante homologação. |

## Ausências transversais

- Não existe login independente por e-mail/senha: autenticação usa OAuth Manus.
- Gestão de equipe, convites e permissões entregue na etapa 2; transferência de propriedade e múltiplas clínicas ativas ficam fora deste bloco.
- CRM administrativo e tarefas de retorno implementados na etapa 6. Funil comercial avançado e integração efetiva de mensagens permanecem pendentes.
- Ter um registro `MESSAGE_SENT` não comprova envio de mensagem por um provedor.
- Geração de status/dados bancários e fiscais fictícios removida na etapa 5; legado preservado sem se apresentar como autorização real. Integrações permanecem pendentes.
- As migrações originais não incluíam o SQL inicial de usuários; restaurado na etapa 1.
- O seed original apagava dados e referenciava usuário de ID 1 sem criá-lo; corrigido na etapa 1.

O levantamento estático de handlers de clique/envio está em `ACOES-DA-INTERFACE.md`.

## Critério para fechar uma ação

Conferir interface → API → banco → resposta, incluindo erros, permissões e ausência de sessão. Botões que apenas chamam `toast`, abas ilustrativas e contadores fixos permanecem pendentes até existir essa evidência. O inventário não substitui os critérios do plano nem declara homologação de telas que ainda não foram exercitadas.
