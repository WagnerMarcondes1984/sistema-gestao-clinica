# Etapa 3 — operação clínica entregue para revisão

Implementação e validação local concluídas em 18/10/2026. O usuário solicitou parada ao final de cada etapa e abertura do localhost. A etapa 4 não foi iniciada. Esta entrega complementa `ETAPA-3-PACIENTES.md`.

## Revisão no navegador

Execute o build e `node scripts/open-review.mjs` em ambiente gráfico com Google Chrome. O script recusa produção e bancos remotos, exige banco local `mindos_dev` ou `mindos_test` e segredo de sessão configurado. Requer migrações aplicadas.

Abre uma janela separada do Chrome, normalmente em `http://localhost:3420/agenda`, autenticada em uma **clínica fictícia exclusiva de revisão**. Se a porta estiver ocupada, informa a porta escolhida. Cria somente exemplos locais claramente identificados, sem apagar ou alterar os cadastros do seed original. Na primeira abertura inclui dois pacientes fictícios, recursos de agenda, sessões e uma solicitação de contato. Não reescreve os dados a cada execução; alterações feitas durante a revisão permanecem nessa clínica.

A sessão dura duas horas, o servidor aceita conexões somente em `127.0.0.1` e encerra quando a janela de revisão fecha. Ao sair da conta ou expirar a sessão, feche a janela e execute o script novamente. O perfil temporário do navegador é removido ao fechar; os dados fictícios da clínica ficam no banco local. Nenhum token é impresso ou colocado na URL. Nenhuma rota de login alternativo foi adicionada ao produto, nenhuma credencial foi alterada no `.env` e o OAuth Manus real continua pendente de credenciais/homologação.

Roteiro sugerido:

1. Em **Configuração da agenda**, confira profissionais, unidades, serviços e disponibilidade. Edite um cadastro ou crie novos recursos.
2. Em **Pacientes**, consulte ou crie um cadastro. Abra o nome para conferir o Paciente 360°.
3. Em **Agenda**, crie uma sessão ou uma série. A duração vem do serviço. Escolha “Todas as datas” para ver sessões futuras e histórico de reagendamentos.
4. Reagende somente uma ocorrência ou esta e as próximas agendadas/confirmadas da série. A sessão antiga permanece com a situação Reagendada, ligada à nova.
5. Em **Recepção**, faça check-in de uma sessão de hoje. Em Agenda, inicie e conclua a sessão. Os contadores se atualizam com os registros reais.
6. Em `/book`, envie uma solicitação usando apenas dados fictícios. Em Recepção, registre o contato já realizado e confirme usando paciente e recursos existentes, ou recuse.

## Recursos e disponibilidade

`/app/scheduling` permite criar, editar e ativar/inativar profissionais, unidades, serviços e janelas semanais de disponibilidade. Escrita exige `MANAGE_TEAM`. Cadastro profissional não cria login; o vínculo opcional com uma conta exige associação clínica ativa e papel clínico/administrador. Desativar a conta vinculada impede novas reservas com esse profissional.

Nomes normalizados são únicos por clínica. Janelas do mesmo profissional não se sobrepõem, inclusive em unidades diferentes. O serviço define duração de 10 a 240 minutos e modalidades permitidas. Publicação no formulário público é explícita. Unidades são cadastros nominais; salas/capacidade física e agenda de recursos adicionais não foram acrescentadas ao escopo.

As janelas são por dia da semana, sem atravessar meia-noite; fim `00:00` representa o final do dia. Agendamentos existentes preservam nomes e duração registrados quando foram criados, mesmo após edição ou inativação dos recursos.

## Sessões, séries e concorrência

Novos agendamentos usam IDs de paciente, profissional, unidade e serviço da clínica autenticada. Paciente inativo, recurso inativo, conta profissional revogada, modalidade indevida e horário fora da disponibilidade são recusados. Não se aceitam nomes arbitrários no lugar de referências.

Criação aceita sessão única ou série de até 24 ocorrências, a cada 1 a 8 semanas. O horizonte é de quatro anos. Reservas a partir do dia atual permitem registrar encaixes do próprio dia; datas anteriores são recusadas. Reagendamento sempre exige horário futuro.

Toda gravação de agenda adquire o lock da clínica no MySQL, relê reservas com bloqueio e verifica sobreposição de profissional e paciente. Índices por clínica/data e clínica/série evitam varredura de reservas de outras clínicas para esse bloqueio. Séries e seus reagendamentos são transações: um conflito impede todas as alterações. A serialização por clínica privilegia consistência; avaliar capacidade sob carga na etapa 8.

Reagendamento preserva a sessão anterior como `RESCHEDULED`, cria a substituta e registra auditoria. A alteração de série abrange a ocorrência escolhida e as próximas ainda agendadas/confirmadas do mesmo paciente; sessões encerradas e anteriores permanecem intactas. Solicitações públicas vinculadas acompanham a substituição da sessão. `revision` detecta edições concorrentes.

Transições implementadas:

- Agendada/Confirmada → confirmada, aguardando após check-in, cancelada ou falta, conforme estado atual.
- Chegou/Aguardando → em atendimento ou cancelada; Chegou também pode registrar check-in.
- Em atendimento → concluída.
- Concluída, falta, cancelada e reagendada são terminais neste fluxo.

Check-in ocorre somente no dia da sessão no fuso da clínica. Início/conclusão não podem anteceder o início previsto. Falta só pode ser registrada após o término previsto. A recepção identifica cada sessão pelo ID, sem atualizar todas as sessões do paciente.

## Fuso da clínica

`mindos_tenants.timezone` usa um identificador aceito por Intl, inicialmente `America/Sao_Paulo`. Conversão civil para instante valida horários inexistentes ou ambíguos em mudanças de horário de verão. Recorrência soma semanas ao calendário local, mantendo o horário civil mesmo quando muda o deslocamento UTC.

Agenda, recepção, indicadores operacionais e datas administrativas do 360°/prontuário usam o fuso configurado. Alterar o fuso exige permissão administrativa e ausência de reservas futuras ativas, evitando mudar silenciosamente a interpretação da agenda.

## Solicitações públicas e contatos

`/book` mostra somente serviços ativos e publicados da clínica definida por `PUBLIC_TENANT_SLUG`. Recebe nome, canal, contato, serviço, preferência de data/horário e autorização para contato. Não coleta motivo clínico e não promete reserva automática.

Validação no servidor, campo antispam e limites persistentes por clínica: um envio por contato a cada 10 minutos, dez por origem no mesmo período e duzentos por clínica a cada 24 horas. Origem vem da conexão do servidor; cabeçalhos de proxy enviados pelo cliente não substituem essa origem. Hashes são armazenados no lugar do IP/contato nas chaves de limite. Configuração de proxies confiáveis, retenção e proteção adicional de produção permanecem na etapa 8.

Triagem: Nova → contato registrado → confirmada; Nova ou contato registrado também podem virar recusada/spam. Confirmar exige um paciente já cadastrado, profissional, serviço, unidade e horário disponíveis; grava a sessão confirmada e o vínculo da solicitação em uma transação. Falha não muda a solicitação nem deixa sessão parcial. Não cria pacientes automaticamente, evitando duplicação por formulário.

Registrar contato ou ligação significa registrar uma ação já realizada pela equipe. Não envia WhatsApp/e-mail nem afirma entrega externa. A antiga operação `MESSAGE_SENT` é recusada até a integração da etapa 6.

## Legado, acesso e migrações

Migrações 0009 e 0010 adicionam tabelas e campos de recursos, vínculos, revisão, fuso e índices. Não apagam pacientes ou sessões existentes e não inferem recursos com base em nomes antigos. Sessões legadas continuam legíveis; para reagendá-las, selecione recursos cadastrados explicitamente. Os antigos endpoints de criação por nome e check-in apenas por paciente recusam novas gravações e orientam usar os fluxos atuais.

Permissões e referências são verificadas no servidor; a clínica e a autoria vêm da sessão. Configurações e mudanças de estado têm auditoria. Dados clínicos não entram na fila de recepção nem nas solicitações públicas. Não houve implementação de versões/adendos/documentos da etapa 4, pagamentos da etapa 5 ou envio de mensagens da etapa 6.

## Evidências

TypeScript e build aprovados. 91 testes unitários aprovados e 1 ignorado; 38 cenários de integração aprovados. Schema conferido com 26 tabelas e 303 colunas. Seed original preservado; repetição recusada sem alterar contagens. Permanece aviso de tamanho do bundle no build.

Chrome aprovou criação de recursos/disponibilidade, série, edição individual e da série, cancelamento, check-in, conclusão, formulário público, contato registrado, confirmação e recusa. Também passaram as regressões de pacientes, seleção, equipe, portal e logout. Os testes usam clínicas e contas fictícias e removem os registros temporários ao final; a clínica de revisão visual é separada e preservada intencionalmente.

Capturas fictícias: [configuração](previews/configuracao-agenda.png), [agenda](previews/agenda-etapa3.png), [recepção desktop](previews/recepcao-etapa3.png) e [recepção no celular](previews/recepcao-etapa3-mobile.png).
