# Etapa 6 — CRM administrativo e comunicação

Entrega interna para revisão. O usuário definiu os provedores de e-mail e WhatsApp como **a definir**. Não existe envio, agendador automático, webhook de entrega ou credencial de provedor nesta entrega. A etapa permanece parcial quanto à comunicação externa; aguardar revisão e novo comando antes da etapa 7.

## Operação

Em `/crm`, consultar leads por etapa, responsável e nome. Criar contato manual com nome e pelo menos e-mail ou telefone; informar origem, responsável e próximo contato. Etapas: novo, contatado, qualificado, convertido e perdido. Perda e reabertura exigem justificativa; convertido não volta a ser lead.

Na aba Solicitações online, importar uma solicitação exige conferir a identidade. Quando já existe lead compatível, selecionar explicitamente o cadastro correspondente; compartilhar telefone/e-mail não une pessoas automaticamente. Importação não cria paciente, confirma sessão ou autoriza publicidade. Ao converter, conferir a pessoa e criar um paciente ou selecionar cadastro ativo da própria clínica. Histórico permanece acessível no paciente; tarefas abertas do lead são canceladas com motivo, preservando a resolução. Confirmação da solicitação na recepção integra a conversão na mesma transação; vínculo divergente interrompe toda a confirmação.

Tarefas têm responsável, prazo no fuso da clínica, edição com revisão e resolução explícita. Interações registradas manualmente têm canal, resultado, texto administrativo, autor autenticado e data. Registrar uma tentativa de contato não comprova envio externo. Não registrar conteúdo clínico no CRM.

## Preferências e preparação de lembretes

E-mail e WhatsApp começam bloqueados. A equipe registra preferência do paciente com justificativa; o próprio paciente altera suas opções no portal, aba Preferências. A identidade do portal vem da sessão. Alterações preservam autoria/revisão e suprimem imediatamente preparações pendentes. A preferência do lead é separada da autorização do paciente; conversão não concede autorização automaticamente. O registro é administrativo e não substitui definição jurídica da base de tratamento.

O botão Preparar lembretes considera os próximos sete dias: sessão com antecedência de 24 horas, confirmação de sessão agendada com 48 horas e tarefas de retorno de pacientes. Verifica situação do paciente, canal, contato e autorização. O texto é neutro, sem nome, descrição clínica ou título da tarefa. Itens elegíveis ficam **Aguardando provedor**; outros ficam suprimidos com motivo. Nunca aparecem como enviados ou entregues.

Repetir preparação não duplica a mesma sessão/revisão/tipo ou tarefa/prazo. Nova preparação cancela versões antigas, sessões iniciadas/canceladas e tarefas encerradas ou alteradas. Alterar tarefa cancela a preparação pendente vinculada imediatamente. Alterações feitas na agenda são reconciliadas na próxima preparação; os estados armazenados da fila não são confirmação ao vivo da agenda. Uma futura integração deverá revalidar sessão, preferência, autorização e idempotência antes do disparo, validar webhooks e registrar envio/entrega/falha reais. Não existe transporte ativo capaz de enviar itens antigos nesta versão.

## Indicadores

Conversão = leads convertidos / todos os leads da clínica. Origem refere-se ao primeiro cadastro, preservada ao importar novamente. Comparecimento = sessões concluídas / (concluídas + faltas), somente dos pacientes convertidos via CRM. Retorno conta pacientes desse grupo com duas ou mais sessões concluídas. Sem denominador, a interface indica ausência de dados. Os indicadores não atribuem resultados a mensagens que não foram enviadas.

## Acesso e consistência

`VIEW_CRM` consulta; `MANAGE_CRM` altera. Conversão exige também `MANAGE_PATIENTS`. Modelos novos de assistente, recepção e comercial incluem CRM; concessões existentes não mudam automaticamente. Autor, clínica e paciente do portal vêm da sessão. Nenhum endpoint do CRM retorna prontuário. Escritas usam transação, lock da clínica, autorização revalidada, revisão e auditoria; criação tem chave idempotente e comparação do conteúdo. Histórico de interações não tem edição/remoção por API.

Migração 0014 adiciona cinco tabelas administrativas e vínculo opcional na solicitação pública; não apaga nem associa automaticamente registros antigos. Arquivos privados e segredos não fazem parte do checkpoint público. Capturas novas ficam locais. Os documentos `ARVORE-DO-PROJETO.md`, `MANIFESTO-DO-CHECKPOINT.json` e `ATUALIZACAO-GERAL.md` descrevem o checkpoint histórico anterior à etapa 6.

## Revisão local e próximos requisitos

Após migração e build: `node scripts/open-review.mjs --crm`. Abre equipe em `http://localhost:3420/crm` e portal em outra sessão; dados exclusivamente fictícios, sessões de duas horas, sem trocar Manus. Fechar todas as janelas encerra o servidor. Dados de revisão são preservados.

Pendente: escolher provedores, configurar credenciais e remetentes, homologar envio real, processamento idempotente de eventos e rastreio de entrega/falha. OAuth Manus real e homologação de produção continuam pendentes nas etapas próprias. O bloco interno não comprova o aceite completo de comunicação externa.
