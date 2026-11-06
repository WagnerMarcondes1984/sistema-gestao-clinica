# Roteiro de revisão e validação do MindOS

Preparado em 21/10/2026. Responsável pela preparação: Codex. Coordenação proposta: Wagner; participantes e nomes ainda precisam ser definidos pela clínica.

**Situação: roteiro preparado; aprovação humana pendente.** Os 340 testes automáticos aprovados na entrega da etapa 9 são evidência técnica anterior e não preenchem os resultados deste roteiro. Um caso antigo foi ignorado. Nenhum caso abaixo foi marcado como aprovado por uma pessoa.

## Como começar

1. Use somente a clínica fictícia de revisão e cadastros/documentos identificados como fictícios. Não inclua dados reais de pacientes, pagamentos, banco ou prontuário.
2. Comece pelos casos C01 a C09, do CRM comercial, em `http://localhost:3420/crm/commercial`.
3. Registre cada execução na planilha [planilha local de resultados](../../.mindos-private/homologacao/RESULTADOS-HOMOLOGACAO.csv), usando Aprovado, Reprovado ou Não executado. Quando não puder testar, mantenha Não executado e explique a dependência.
4. Para cada caso, informe quem executou, data, o que aconteceu e uma evidência local sem informações reais. Capturas devem mostrar apenas a demonstração fictícia. Não publique arquivos de resultados ou capturas sem revisão própria.
5. Depois siga recepção, atendimento, financeiro, paciente e administração. Nos casos de acesso, use contas/sessões separadas com as permissões corretas; a sessão do administrador não comprova o acesso restrito de outro papel.
6. Envie a Wagner os códigos reprovados, os passos executados e o resultado observado. Corrigir, repetir o caso e verificar os fluxos afetados antes de aceitar a correção. Nenhum contato com a equipe é enviado automaticamente por esta preparação.

## Abertura da demonstração

A ferramenta local existente `node scripts/open-review.mjs --commercial --care` pode abrir o CRM para a equipe e o portal do paciente em janelas separadas, com sessões fictícias temporárias. Exige banco local e ambiente gráfico já configurados. Fechar as janelas encerra o servidor dessa revisão; os dados fictícios ficam preservados. Se já existir uma revisão aberta, não inicie outra sem conferir a janela/porta.

Credenciais Manus reais não são modificadas, não existe login alternativo no produto e nenhum dado real deve ser usado neste ensaio. A sessão local não substitui o login definitivo nem comprova os demais papéis. Se faltarem as sessões de recepção/profissional/financeiro/consulta, os casos de restrição desses papéis continuam Não executado até preparação e conferência próprias.

Links abertos em outro perfil de navegador podem pedir login. Use a janela de revisão já autenticada. Não copie cookies ou credenciais para a planilha. O endereço local não é uma instalação pública e não deve ser exposto à rede para testar um celular.

O modelo vazio para novas rodadas está em [MODELO-RESULTADOS-HOMOLOGACAO.csv](MODELO-RESULTADOS-HOMOLOGACAO.csv). A planilha de preenchimento fica na pasta local privada do projeto, separada dos modelos. Não sobrescreva os registros de uma rodada ao iniciar outra.

## Quem participa

| Perfil               | O que valida                                                | Nome / confirmação |
| -------------------- | ----------------------------------------------------------- | ------------------ |
| Wagner / coordenação | Organiza casos, evidências, problemas e aceite              | A confirmar        |
| Comercial            | Oportunidades, propostas, metas e retornos                  | A definir          |
| Recepção             | Pacientes, horários, chegadas e solicitações                | A definir          |
| Profissional         | Registros, documentos e acesso aos pacientes acompanhados   | A definir          |
| Financeiro           | Cobranças internas, parcelas, reversões, caixa e relatórios | A definir          |
| Paciente de teste    | Própria área, documentos, termos e pedidos                  | A definir          |
| Administrador        | Equipe, acessos, site e preparação operacional              | A definir          |

Uma pessoa pode avaliar mais de um fluxo, mas cada teste de autorização precisa da sessão correspondente. Nomes e aprovações não são presumidos.

## Casos de revisão

### 1. CRM comercial

**C01 — Comercial autorizado · `/crm/commercial`**

- Fazer: Escolher um contato fictício no CRM e criar uma oportunidade com valor de R$ 300,01, responsável e previsão de fechamento.
- Esperado: Oportunidade aparece na qualificação com os dados informados. Atualizar a página e conferir a persistência.
- Resultado humano: Não executado. Registrar na planilha.

**C02 — Comercial autorizado · `/crm/commercial`**

- Fazer: Abrir a oportunidade, criar proposta com quantidade 3, preço unitário R$ 100,01 e desconto total R$ 0,02.
- Esperado: Total de R$ 300,01. Valor da oportunidade atualizado. A proposta é um rascunho, sem pagamento ou assinatura.
- Resultado humano: Não executado. Registrar na planilha.

**C03 — Comercial autorizado · `/crm/commercial`**

- Fazer: Registrar apresentação com evidência fictícia. Criar nova versão antes do aceite.
- Esperado: Versão anterior cancelada e preservada; nova versão aberta. Conteúdo anterior continua consultável.
- Resultado humano: Não executado. Registrar na planilha.

**C04 — Comercial autorizado · `/crm/commercial`**

- Fazer: Na versão atual, registrar apresentação e aceite fictícios. Avançar pelas etapas até negociação e confirmar contratação administrativa.
- Esperado: Ganho exige proposta aceita no mesmo valor. Registro aparece como ganho; não cria recebimento ou paciente automaticamente.
- Resultado humano: Não executado. Registrar na planilha.

**C05 — Comercial autorizado · `/crm/commercial`**

- Fazer: Em outra oportunidade fictícia, registrar perda com motivo e depois reabrir com justificativa.
- Esperado: Motivo obrigatório, propostas ativas canceladas e histórico preservado. Reabertura volta à qualificação sem restaurar aceite antigo.
- Resultado humano: Não executado. Registrar na planilha.

**C06 — Gestor comercial · `/crm/commercial`**

- Fazer: Abrir Metas e relatórios, selecionar o mês atual e definir uma meta fictícia. Conferir origem, responsável e valores com os ganhos cadastrados.
- Esperado: Metas da clínica e individuais separadas. Conversão considera ganhas e perdidas encerradas no mês. Não comparar o valor comercial com recebimentos.
- Resultado humano: Não executado. Registrar na planilha.

**C07 — Comercial autorizado · `/crm/commercial`**

- Fazer: Usar uma oportunidade aberta de um lead sem paciente vinculado. Conferir autorização geral no CRM, registrar autorização comercial fictícia de e-mail, criar regra para a etapa e aplicar duas vezes.
- Esperado: Uma tarefa por entrada de etapa e versão da regra. Reaplicar não duplica. Nenhuma mensagem é enviada. Ver a tarefa em Contatos e tarefas.
- Resultado humano: Não executado. Registrar na planilha.

**C08 — Comercial autorizado · `/crm/commercial`**

- Fazer: Retirar a autorização comercial do contato de C07 e salvar. Consultar a tarefa criada.
- Esperado: Retorno automático ainda aberto é cancelado. O contato deixa de aparecer no segmento de e-mail autorizado.
- Resultado humano: Não executado. Registrar na planilha.

**C09 — Comercial autorizado · `/crm/commercial`**

- Fazer: Abrir uma proposta fictícia e usar Abrir para impressão. Conferir destinatário, condições, versão, validade e total.
- Esperado: Documento corresponde à proposta e informa que não comprova pagamento ou assinatura. A impressão fica sob controle da pessoa que usa o navegador.
- Resultado humano: Não executado. Registrar na planilha.

### 2. Recepção e agenda

**R01 — Recepção · `/patients`**

- Fazer: Localizar um paciente fictício antes de cadastrar outro. Conferir dados básicos e editar um contato.
- Esperado: Busca encontra o cadastro correto; possível duplicidade é sinalizada; alteração permanece após atualizar.
- Resultado humano: Não executado. Registrar na planilha.

**R02 — Recepção · `/agenda`**

- Fazer: Escolher serviço, profissional, unidade e horário disponível. Agendar uma sessão e uma sequência fictícia.
- Esperado: Datas, duração e profissional corretos; sequência identificada. Usar o fuso da clínica.
- Resultado humano: Não executado. Registrar na planilha.

**R03 — Recepção · `/agenda`**

- Fazer: Tentar reservar outro atendimento sobreposto do mesmo profissional ou paciente. Reagendar uma ocorrência.
- Esperado: Conflito recusado sem criar reserva dupla. Reagendamento preserva a sessão anterior e o histórico.
- Resultado humano: Não executado. Registrar na planilha.

**R04 — Recepção · `/reception`**

- Fazer: Confirmar a sessão de teste e registrar chegada na sessão correta. Conferir fila e situação do dia.
- Esperado: Paciente aparece na fila correta; chegada não é lançada em outra sessão.
- Resultado humano: Não executado. Registrar na planilha.

**R05 — Recepção · `/book`**

- Fazer: Enviar uma solicitação pública fictícia para a clínica explícita e tratá-la na recepção.
- Esperado: Pedido chega à clínica correta e precisa de análise. Não existe confirmação automática do horário.
- Resultado humano: Não executado. Registrar na planilha.

### 3. Atendimento e documentos

**P01 — Profissional autorizado · `/clinical-records`**

- Fazer: Selecionar o paciente fictício acompanhado. Criar rascunho, revisar e finalizar um registro identificado como fictício.
- Esperado: Registro pertence ao paciente correto e mantém autoria. Finalização preserva o texto.
- Resultado humano: Não executado. Registrar na planilha.

**P02 — Profissional autorizado · `/clinical-records`**

- Fazer: Após finalizar P01, acrescentar uma correção ou complemento fictício.
- Esperado: Texto anterior não é sobrescrito. Complemento, autor e data aparecem no histórico.
- Resultado humano: Não executado. Registrar na planilha.

**P03 — Profissional autorizado · `/patient-care`**

- Fazer: Enviar documento fictício sem dados reais. Liberar para o paciente e depois retirar a liberação.
- Esperado: Documento é privado; paciente acessa somente quando liberado. Revogação bloqueia novos acessos, sem recolher cópias já baixadas.
- Resultado humano: Não executado. Registrar na planilha.

**P04 — Profissional autorizado · `/clinical-records`**

- Fazer: Em sessão individual autorizada para o teste, conferir acesso ao paciente acompanhado e recusa ao paciente sem vínculo.
- Esperado: Vínculo clínico e permissão são respeitados. Executar com a conta do profissional, não com o administrador.
- Resultado humano: Não executado. Registrar na planilha.

### 4. Financeiro interno

**F01 — Financeiro · `/checkout`**

- Fazer: Criar cobrança fictícia de R$ 100,00 dividida em três parcelas, após conferir paciente e dados.
- Esperado: Parcelas de R$ 33,34, R$ 33,33 e R$ 33,33; soma R$ 100,00. Não existe pagamento ou nota fiscal automática.
- Resultado humano: Não executado. Registrar na planilha.

**F02 — Financeiro · `/transactions`**

- Fazer: Registrar recebimento manual fictício e conferir saldo e histórico. Testar repetição acidental sem confirmar uma nova operação diferente.
- Esperado: Saldo e autoria correspondem ao registro. Não assumir que um registro manual confirma dinheiro no banco.
- Resultado humano: Não executado. Registrar na planilha.

**F03 — Financeiro · `/transactions`**

- Fazer: Realizar uma reversão manual fictícia com justificativa e verificar o histórico.
- Esperado: Histórico do recebimento preservado; saldo recalculado. Reversão interna não é estorno bancário.
- Resultado humano: Não executado. Registrar na planilha.

**F04 — Financeiro · `/cash`**

- Fazer: Abrir caixa fictício, registrar movimento em dinheiro, conferir os lançamentos e fechar. Se houver diferença, justificar.
- Esperado: Saldos e diferença correspondem aos lançamentos. Fechamento registra responsável e justificativa.
- Resultado humano: Não executado. Registrar na planilha.

**F05 — Financeiro · `/finance`**

- Fazer: Comparar resumo financeiro, parcelas e caixa com os lançamentos de F01 a F04.
- Esperado: Números têm origem nos lançamentos. Valores do CRM comercial não aparecem como receita recebida automaticamente.
- Resultado humano: Não executado. Registrar na planilha.

### 5. Portal do paciente

**U01 — Paciente de teste · `/portal`**

- Fazer: Usar a janela de paciente com sessão separada. Conferir identificação e sessões.
- Esperado: Exibe somente a área desse paciente. Conta administrativa não comprova este teste.
- Resultado humano: Não executado. Registrar na planilha.

**U02 — Paciente de teste · `/portal`**

- Fazer: Conferir documento de P03 quando liberado e tentar novo acesso após revogação.
- Esperado: Apenas documentos liberados são acessíveis. Após revogar, o novo acesso é recusado.
- Resultado humano: Não executado. Registrar na planilha.

**U03 — Paciente de teste · `/portal`**

- Fazer: Ler um termo fictício, registrar decisão e depois retirar o aceite quando permitido.
- Esperado: Decisão, versão e histórico ficam registrados. Aceite simples não é assinatura com certificado.
- Resultado humano: Não executado. Registrar na planilha.

**U04 — Paciente de teste · `/portal`**

- Fazer: Solicitar mudança de horário e revisar preferências de contato. Encaminhar o pedido à recepção.
- Esperado: Pedido permanece pendente até análise. Preferências são salvas; autorizar lembrete não autoriza contato comercial por si só.
- Resultado humano: Não executado. Registrar na planilha.

### 6. Administração e acessos

**A01 — Administrador · `/app/team`**

- Fazer: Conferir papéis e permissões. Em conta fictícia separada, conceder somente consulta comercial; testar acesso de CRM antigo sem concessão comercial.
- Esperado: Consulta comercial não altera registros. CRM administrativo sozinho não libera valores, propostas ou metas.
- Resultado humano: Não executado. Registrar na planilha.

**A02 — Administrador · `/app/team`**

- Fazer: Desativar um integrante fictício de teste e conferir nova tentativa de acesso na sessão desse integrante.
- Esperado: Acesso revogado é recusado. Não desativar a conta administrativa usada para conduzir a revisão.
- Resultado humano: Não executado. Registrar na planilha.

**A03 — Administrador do site · `/app/admin-studio`**

- Fazer: Editar rascunho fictício, conferir prévia, aprovar, publicar e restaurar uma versão publicada anterior.
- Esperado: Rascunho não muda o site público. Publicação e restauração correspondem às versões aprovadas da clínica.
- Resultado humano: Não executado. Registrar na planilha.

**A04 — Administrador · `/app/readiness`**

- Fazer: Conferir verificações locais e avisos de preparação.
- Esperado: Tela informa pendências de produção. Ensaio de backup antigo não comprova restauração da versão atual ou recuperação externa.
- Resultado humano: Não executado. Registrar na planilha.

### 7. Uso e acessibilidade

**X01 — Representantes da equipe · `/crm/commercial`**

- Fazer: Percorrer formulários com Tab, Shift+Tab, Enter e Escape. Repetir em agenda e portal.
- Esperado: Foco visível, sequência compreensível, campos identificados e diálogo utilizável. Registrar aparelho e navegador.
- Resultado humano: Não executado. Registrar na planilha.

**X02 — Representantes da equipe · `/crm/commercial`**

- Fazer: Usar celular real autorizado na rede/configuração de homologação apropriada, zoom do navegador e tela pequena.
- Esperado: Informações e botões continuam utilizáveis. Simulação de tela pequena no computador não substitui aparelho real. Não expor o servidor local à rede para fazer este teste.
- Resultado humano: Não executado. Registrar na planilha.

**X03 — Representantes da equipe · `/crm/commercial`**

- Fazer: Buscar termo inexistente e enviar formulário incompleto ou valor inválido em ambiente fictício.
- Esperado: Estados vazios compreensíveis e erro explica o ajuste necessário; nada é salvo indevidamente.
- Resultado humano: Não executado. Registrar na planilha.

**X04 — Representantes da equipe · `/agenda`**

- Fazer: Observar clareza, tempo de resposta e interrupções durante a rotina fictícia. Anotar cenário e volume.
- Esperado: Registrar dificuldades observadas. Esta avaliação não substitui ensaio de carga ou aprovação de infraestrutura.
- Resultado humano: Não executado. Registrar na planilha.

## Quando interromper um caso

- Crítica: acesso a dados de outra clínica/pessoa, exposição de informação reservada, perda de registro, duplicação de valor ou ação sem permissão. Interromper o fluxo afetado e registrar os passos; não continuar com dados reais.
- Alta: impede atendimento, recebimento interno, consulta de documento ou realização de tarefa principal. Corrigir e repetir antes do piloto.
- Ajuste de uso: dificuldade de texto, navegação ou apresentação sem perda/exposição de dados. Registrar impacto e combinar prioridade.

A gravidade depende do que foi observado; não preencher automaticamente a avaliação. Evidências ficam localmente e não devem conter segredos ou dados reais.

## Critério para encerrar a revisão humana

- Todos os casos aplicáveis executados com os papéis e cenários corretos; cada caso não executado mantém sua justificativa e responsável.
- Nenhuma falha crítica ou alta aberta nos fluxos incluídos no piloto.
- Correções verificadas novamente e aprovações registradas por quem participou.
- Pendências externas claramente excluídas da demonstração e tratadas antes de usar qualquer recurso que dependa delas.
- Aceite humano não equivale a implantação ou autorização automática de produção. Registrar separadamente a decisão de iniciar o piloto.

## Próximas decisões, antes do piloto

Preencher a [cópia local das decisões](../../.mindos-private/homologacao/DECISOES-PARA-O-PILOTO.md). O [modelo de decisões](DECISOES-PARA-O-PILOTO.md) permanece vazio para novas rodadas. O documento organiza decisões sobre dados, responsáveis, cópias de segurança, suporte, serviços externos e critérios do piloto. Nenhum prazo de conservação, descarte ou contratação foi aprovado nesta preparação.

Docker permanece adiado; provedores de pagamento, fiscal e mensagens, instalação definitiva, backup externo e login Manus real continuam pendentes conforme o plano. Pacotes/repasses seguem manuais. A preparação deste roteiro não conclui a etapa 8.
