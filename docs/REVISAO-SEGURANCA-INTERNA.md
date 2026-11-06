# Revisão das pendências internas de segurança e validação

Escopo autorizado: fechar as pendências internas antes de expandir o CRM comercial. Etapa 9 não iniciada. Esta revisão não aprova uso em produção nem substitui a homologação da equipe.

## Fluxo e fronteiras examinados

Pessoa autenticada acessa pacientes, agenda, recepção, cuidado, financeiro, CRM ou administração; a API identifica a clínica pela associação ativa, valida permissão e referências, executa a operação com autoria autenticada e devolve somente os dados autorizados. Escritas auditadas devem confirmar a alteração e a auditoria na mesma transação.

| Fronteira            | Conferência                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão → identidade  | Assinatura HS256, aplicativo correto, emissão e expiração obrigatórias, duração limitada e identidade efetiva consultada no banco                                                     |
| Identidade → clínica | Associação ativa e clínica ativa; contexto ambíguo recusado; nenhuma clínica escolhida por vertical ou ID enviado pelo cliente                                                        |
| API → referências    | Paciente, sessão, profissional, unidade, serviço, documento, registro, responsável e versões consultados no contexto da clínica; sessão vinculada ao mesmo paciente quando aplicável  |
| Escrita → auditoria  | Autoria derivada da identidade autenticada; alterações e auditoria transacionais; revogação revalidada nos fluxos de escrita                                                          |
| Dados → resposta     | Prontuário e notas restritas com permissões próprias; portal limitado ao paciente vinculado; chaves e identidade da conta do portal excluídas das respostas administrativas revisadas |
| Resposta → interface | Navegação autenticada, mensagens de erro e permissões da recepção conferidas no navegador após recompilar                                                                             |

## Correções implementadas

1. O SDK ainda usava um ano como validade padrão, apesar do callback configurar oito horas. O assinador agora usa a política configurada de 1 a 24 horas, padrão oito, e recusa prazos inválidos. O callback usa a mesma função para token e cookie.
2. A verificação de sessão agora exige `iat` e `exp` inteiros, recusa emissão futura além da tolerância de 30 segundos, expiração anterior à emissão e duração original superior à configuração. Sessões antigas sem essas garantias exigem novo login Manus. Os scripts locais receberam emissão explícita; não foi criada outra rota de login.
3. O registro legado de ligação/perfil na recepção passou de `VIEW_ADMINISTRATIVE` para `MANAGE_APPOINTMENTS`. A interface impede a ação de quem somente consulta. A escrita revalida o vínculo sob lock e confere paciente e sessão na mesma clínica.
4. Evento de recepção e auditoria agora são atômicos. Falha na auditoria desfaz o evento. O payload recusa campos extras; os campos persistidos são enumerados e os IDs de clínica/autor vêm do servidor. Check-in continua na transição da sessão; envio sem provedor continua recusado.
5. As respostas antigas de dashboard e listagem de sessões deixaram de incluir `portalUserId`, acompanhando a minimização já existente nos módulos atuais.

## Evidências

TypeScript, build local, 187 testes unitários/HTTP (um caso antigo ignorado), 125 integrações MySQL nos oito módulos e regressão completa do Chrome aprovados. A montagem da imagem Docker atualizada foi interrompida a pedido do usuário por lentidão; construção e ensaio dessa nova imagem ficam pendentes. A aprovação da imagem anterior não comprova as correções desta revisão dentro do contêiner.

- Testes novos de sessão cobrem expiração, emissão, duração original, configuração inválida, prazo padrão e aplicativo incorreto.
- Integração de recepção cobre permissão de consulta sem escrita, revogação entre autorização inicial e transação, autoria, campos extras, sessões de outra clínica ou outro paciente e rollback da auditoria.
- Casos adicionais cruzam referências entre prontuário, atendimento, cobrança, vínculo clínico, tarefas, interações e liberação financeira.
- Regressão existente cobre concorrência de reservas, séries atômicas, parcelas e saldos, idempotência financeira, documentos privados, consentimentos, portal, convites, CRM e publicação do site.
- Chrome confirmou as jornadas entregues, recusa HTTP de sessão sem emissão/expiração ou excessiva, ligação persistida com autoria/auditoria e botão desabilitado/recusa na API para consulta administrativa. Verificação operacional em desktop/celular, Tab, atualização, recusa ao paciente e health checks com 200. Sem exceções de execução. A primeira tentativa falhou pelo tamanho do identificador de uma fixture; somente o prefixo foi encurtado e a repetição completa passou.
- A revisão local limita a sessão fictícia a duas horas ou ao prazo menor configurado. Prazos ampliados de inicialização do verificador atendem à contenção de disco observada, sem alterar limites ou permissões do produto.

Conferência dos dados locais: `node scripts/verify-internal-data.mjs`. A ferramenta aceita somente banco de desenvolvimento/teste em loopback, abre snapshot somente de leitura e retorna contagens. Não é um endpoint acessível aos usuários do sistema. Nesta retomada, os nove grupos de referências incompatíveis e os três grupos financeiros sem clínica tiveram contagem zero. Associação de uma base externa nunca é inferida por essas contagens.

As 12 contagens permaneceram em zero após a limpeza dos testes de navegador. Endpoints antigos e recusa de reexecução do seed conferidos, com contagens preservadas. Revisão aberta em `http://localhost:3420/app/readiness`, com capturas desktop/celular inspecionadas e evidência Ed25519 autenticada. Fonte e documentos atualizados localmente; a imagem Docker desta revisão continua pendente.

## O que permanece condicionado

| Item                                                          | Dependência real                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Imagem Docker com esta revisão                                | Construção e ensaio local adiados a pedido do usuário; sem aprovação desta nova imagem                     |
| Registros financeiros de uma base legada externa              | Origem e clínica devem ser confirmadas pelos responsáveis; nenhuma associação automática por nome/vertical |
| Webhooks, pagamentos, estornos, fiscal e entrega de mensagens | Provedores e ambientes de testes ainda a definir; sem comprovação fictícia de integração                   |
| VPS, domínio, HTTPS e login Manus no endereço definitivo      | Infraestrutura e configuração externa; testes locais não homologam o endereço real                         |
| Backup externo e alertas                                      | Destino, frequência/retenção, responsáveis e canal; recuperação externa ainda precisa ser ensaiada         |
| Retenção, exportação, exclusão e privacidade                  | Regras a decidir com os responsáveis; sem descarte automático ou prazo presumido                           |
| Homologação e piloto                                          | Aceite humano por administrador, recepção, profissional, financeiro e paciente                             |

As verificações cobrem o escopo interno descrito. Não constituem certificação de segurança, auditoria independente, teste de invasão completo ou garantia de ausência de falhas. Capturas e dados de teste novos permanecem locais.
