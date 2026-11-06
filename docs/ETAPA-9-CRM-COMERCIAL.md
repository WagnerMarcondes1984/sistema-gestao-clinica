# Etapa 9 — CRM comercial

Início autorizado pelo usuário em **21/10/2026**. Responsável: Codex, com homologação visual de Wagner ao concluir. Entrega interna validada; análise visual do usuário pendente. O desenvolvimento local continua com dados fictícios; produção e implantação permanecem sujeitos às pendências da etapa 8. Montagem Docker continua adiada por escolha do usuário.

## Fluxo entregue

Em `/crm/commercial`, a equipe parte de um contato do CRM administrativo e cria uma oportunidade com título, valor previsto em reais, responsável ativo e previsão de fechamento. A origem vem do contato existente, sem seleção de clínica pelo navegador. O funil possui Qualificação, Proposta, Negociação, Ganha e Perdida.

A mudança de etapa usa um formulário acessível por teclado. Perder e reabrir exige motivo. Ganhar exige confirmação da contratação administrativa e uma proposta aceita no mesmo valor. Ganhos são preservados contra reabertura e edição. Não há geração automática de paciente, cobrança, recebimento ou nota fiscal.

A busca e os filtros permitem segmentar por nome/título, etapa, origem, responsável e autorização comercial de e-mail/WhatsApp. A listagem tem páginas de até 60 oportunidades; contagens e valores das colunas consideram todos os itens do filtro, não apenas a página. Esses segmentos não usam diagnóstico, prontuário, notas clínicas ou documentos.

## Propostas

Cada versão guarda título, quantidade, preço unitário, desconto, validade e condições administrativas. O servidor calcula o total em centavos e atualiza o valor da oportunidade. Novas versões substituem rascunhos e propostas apresentadas anteriores, preservando seus conteúdos. Propostas aceitas precisam ter o aceite cancelado antes de renegociar.

Apresentação, aceite, recusa e cancelamento exigem evidência escrita e confirmação da equipe. Datas e autor ficam registrados; não são assinatura eletrônica do destinatário nem prova automática de envio. Propostas vencidas não podem ser apresentadas ou aceitas. Perder a oportunidade cancela as propostas ativas; reabrir não restaura o aceite anterior.

“Abrir para impressão” gera um documento local com a proposta, destinatário e condições. A impressão usa o navegador. O documento esclarece que não comprova pagamento, nota fiscal ou assinatura. Conteúdo informado é escapado e o documento bloqueia scripts e recursos externos.

## Metas e relatórios

Metas mensais podem ser da clínica ou individuais; são acompanhadas separadamente e não somadas como uma única meta. Atingimento usa o valor das oportunidades ganhas e a data de encerramento no fuso da clínica. O valor comercial não representa receita recebida.

Conversão dos encerrados = ganhas / (ganhas + perdidas) no mês. Sem encerramentos, a interface informa ausência de dados em vez de inventar percentual. O relatório separa origem, responsável, motivos de perda e valor em aberto com previsão no mês. Filtros de origem não devem ser comparados diretamente a metas que abrangem todas as origens; a interface oculta esse atingimento enquanto o filtro está ativo.

## Autorizações e automações internas

Preferências comerciais são específicas, separadas dos lembretes de sessão e bloqueadas inicialmente. O responsável registra a escolha informada e sua origem. Para gerar retorno, também são necessários contato geral permitido no CRM, canal informado e responsável ativo com gestão comercial e do CRM. Se o contato já virou paciente, o cadastro precisa estar ativo e o canal também precisa estar permitido nas preferências do paciente. Permissão de lembrete, isoladamente, nunca autoriza contato comercial.

Regras criam tarefas internas por etapa e canal, com prazo de 0 a 90 períodos de 24 horas desde a entrada na etapa. Executam ao criar/mover uma oportunidade ou clicar em “Aplicar regras de retorno”. Não existe serviço agendado ou envio automático de mensagens. Cada combinação oportunidade/entrada de etapa/regra/versão gera no máximo uma tarefa, inclusive em chamadas concorrentes. Reaplicar não recria uma tarefa já concluída ou cancelada para a mesma combinação.

A retirada da autorização comercial e a aplicação de bloqueios no CRM ou nas preferências do portal cancelam as tarefas automáticas ainda abertas que perderam autorização. Alterar a etapa encerra retornos anteriores. Revisar/desativar uma regra cancela tarefas pendentes da versão anterior; aplicar novamente usa a nova versão. A alteração do responsável transfere os retornos automáticos ainda abertos. As tarefas ficam visíveis no CRM administrativo e exigem contato manual da equipe, que deve conferir novamente as preferências antes de contatar.

Há limite de vinte regras por clínica. A autorização não é inferida pelo interesse, conversão em paciente ou contratação. Provedores de e-mail/WhatsApp seguem a definir; nenhum disparo ou status de entrega fictício foi adicionado.

## Segurança e persistência

- Exige `VIEW_COMMERCIAL` para consulta e `MANAGE_COMMERCIAL` para alterações. Vínculos antigos que têm apenas CRM administrativo continuam sem acesso comercial até concessão explícita em Equipe. O modelo de novos vínculos do papel Comercial oferece as duas permissões, que podem ser ajustadas. Responsáveis por retornos precisam também de gestão do CRM.
- Paciente e usuário anônimo não acessam o módulo; consulta de CRM não permite escrita.
- Associação ativa e clínica são revalidadas dentro da transação, inclusive antes de repetir uma criação idempotente.
- Lead, oportunidade, proposta, responsável e regra são validados dentro da clínica correta.
- Revisão protege mudanças concorrentes; chaves únicas impedem duplicação de criação, versão e tarefa automática.
- Conteúdo e decisões de propostas, histórico, tarefas e auditoria são persistidos na mesma transação da operação.
- APIs retornam campos comerciais/administrativos selecionados; hashes internos e dados clínicos não são publicados.
- A migração `0016_crm_comercial.sql` adiciona sete tabelas sem alterar/remover dados existentes. Schema: 46 tabelas da aplicação, 569 colunas; tabela de migrações é adicional.
- Guard do seed inclui as novas tabelas e continua recusando banco com dados. Backup já enumera todas as tabelas dinamicamente; implantação/restauração da nova versão permanece sujeita à homologação operacional.

## Verificação

TypeScript, formatação e build local aprovados. Versão final: 194 testes unitários/HTTP aprovados e um caso antigo ignorado; 146 testes MySQL aprovados nos nove módulos, incluindo 21 comerciais. Regressão integral da compilação final no Chrome aprovada, incluindo permissões comerciais separadas e telas desktop/celular, sem exceções de execução. Conferência somente de leitura após limpar os testes: 16 grupos de referências e três grupos financeiros sem inconsistências; nenhum dos cinco segredos privados conferidos apareceu nos 21 arquivos de código/build/documentação examinados. Resultados finais em `EXECUCAO-DO-PLANO.md`. O build mantém o aviso conhecido de bundle principal (~1,19 MB); o módulo comercial usa carregamento separado (~81,5 kB).

Os testes comerciais criam suas próprias clínicas/usuários fictícios e removem somente essas fixtures. Há cobertura de reenvio/concorrência, revisão perdida, isolamento, consulta sem escrita, proposta vencida/aceita, cálculo monetário, perda/reabertura, metas, autorização comercial independente, revogação pelo CRM e portal e rollback quando falha a auditoria.

## Revisão no localhost

Depois de aplicar migrações e compilar localmente: `node scripts/open-review.mjs --commercial`. Exige MySQL local, segredos locais já configurados e sessão gráfica. Usa a clínica fictícia de revisão, respeita acesso revogado e abre o Chrome normalmente em `http://localhost:3420/crm/commercial`, com sessão temporária; não cria login alternativo ou altera credenciais Manus. Exemplos demonstrativos são preservados nessa clínica ao fechar a janela.

Pagamento, fiscal, mensagens externas, VPS, nova imagem Docker, backup externo, políticas de conservação, homologação humana e piloto continuam pendentes nas etapas correspondentes. Este guia não é aprovação de produção nem substitui a apresentação ao cliente, que foi preparada antes desta evolução.

## Evidência de ponta a ponta

| Fronteira             | Evidência                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Interface → API       | Chrome cria oportunidade, proposta, decisões, meta, autorização e regra usando os formulários.                                         |
| API → banco           | 21 testes comerciais MySQL validam persistência, isolamento, idempotência, revisão e rollback de auditoria.                            |
| Banco → resposta      | Total exato em centavos, versões preservadas e relatório mensal conferidos na resposta da API.                                         |
| Resposta → interface  | Chrome confirma ganho, meta, tarefa única, revogação/cancelamento e estados vazios.                                                    |
| Autorização e celular | CRM antigo sem concessão comercial recusado; consulta comercial sem escrita; paciente recusado; largura de 390 px sem transbordamento. |

Capturas fictícias finais em `/tmp/mindos-comercial-etapa9.png`, `/tmp/mindos-comercial-relatorios-etapa9.png` e `/tmp/mindos-comercial-etapa9-mobile.png`. Mantidas somente localmente. A apresentação ao cliente produzida em 19/10 é anterior à etapa 9 e não foi substituída automaticamente.

## Revisão humana preparada

O [roteiro de homologação](homologacao/ROTEIRO-DE-HOMOLOGACAO.md) começa pelos nove casos comerciais C01–C09 e segue os papéis da clínica. Resultados humanos continuam Não executado até registro de quem testou, data e evidência. Modelos vazios podem ser versionados; cópias locais para preenchimento ficam em `.mindos-private/homologacao/`.
