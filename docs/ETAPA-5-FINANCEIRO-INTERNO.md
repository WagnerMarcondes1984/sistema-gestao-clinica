# Etapa 5 — controle financeiro interno

Entrega local em 18/10/2026. **Etapa 5 em andamento; integrações externas pendentes. Etapa 6 não iniciada.**

O usuário definiu provedores de pagamento e emissão fiscal como “a definir”. Também escolheu manter pacotes e repasses sem automação por enquanto. As regras demonstrativas existentes não geram cobranças, comissões ou despesas automaticamente. Não foram instalados provedores, criadas contas externas ou movimentados valores bancários.

## Operação entregue

| Tela | Operação |
|---|---|
| `/checkout` | Cobrança interna pendente para paciente ativo da própria clínica; sessão opcional, itens, desconto, acréscimo, revisão e parcelas mensais. |
| `/transactions` | Busca literal, páginas de até 100 cobranças, recebimentos manuais, reversões, parcelas e histórico. |
| `/receivables` | Cobranças com saldo original ainda não recebido, incluindo vencimentos e recebimentos parciais. |
| `/payables` | Cadastro de fornecedor/despesa e baixa manual parcial ou integral, com referência. |
| `/cash` | Abertura, recebimento em dinheiro, pagamentos em espécie, suprimento, sangria, conferência e fechamento. |
| `/finance` | Resumo de todo o período e livro de movimentos da clínica, com legado não conferido separado. |
| `/audit` | Data, autoria autenticada, referência, motivo e resultado das operações internas. |

O nome do paciente é obtido do cadastro; o profissional e a unidade, quando informados, vêm da sessão validada. O nome do operador vem do banco e da conta autenticada. Não se aceitam clínica ou autoria escolhidas pelo cliente. A mesma sessão não recebe uma segunda cobrança por este fluxo; consulte a cobrança existente antes de lançar outra.

## Valores e parcelas

Valores são centavos inteiros, entre zero e R$ 10.000.000,00 por campo; valores de cobrança, recebimento, despesa e movimento precisam ser positivos. Quantidades são inteiras, até 10.000, com até 100 itens. Produtos, somas, desconto, acréscimo e total são recalculados no servidor. Desconto não supera o subtotal; totais ou subtotais enviados que divergirem são recusados. Valores negativos, fracionários em centavos, não finitos e fora dos limites são recusados.

De 1 a 24 parcelas, sem parcelas zeradas. O resto em centavos é distribuído nas primeiras parcelas; a soma é exatamente o total. Os vencimentos são mensais, preservando o dia de origem e ajustando meses curtos ao último dia. O modelo atual usa TIMESTAMP: primeiro vencimento entre 2000 e 2036 e último antes de 2038. Ampliar o horizonte exige migração de datas, não alteração silenciosa deste limite. Vencimentos são datas civis; a determinação de atraso considera o fuso da clínica.

A cobrança sempre nasce pendente, inclusive dinheiro. Para baixar, informe valor, referência do comprovante/controle e confira o resumo. A baixa distribui o recebido nas parcelas em ordem. Valores além do saldo são recusados. Dinheiro exige caixa aberto e valor entregue suficiente; o servidor calcula o troco. A gaveta recebe o valor líquido do recebimento, não o valor entregue com troco.

## Reversão manual

Reversão registra uma devolução já conferida fora do sistema; não solicita estorno ao banco. Exige valor, revisão, referência e motivo com pelo menos oito caracteres. Nunca supera o recebido líquido. Preserva o recebido bruto e registra separadamente o revertido, inclusive por parcela. Em dinheiro, gera saída do caixa aberto, que precisa ter saldo suficiente.

Pode ocorrer em recebimento parcial: não é necessário inventar a baixa do saldo restante. A parcela devolvida não volta a ser cobrada automaticamente. Exemplo: cobrança de R$ 100, recebido R$ 40 e revertido R$ 10 → líquido recebido R$ 30, saldo original ainda a receber R$ 60. Após receber os R$ 60, o total bruto é R$ 100, revertido R$ 10 e líquido R$ 90. Nova obrigação sobre valor devolvido exige decisão e novo lançamento explícitos, não reabertura automática.

Reversão integral de uma cobrança recebida integralmente termina em REFUNDED. Reversões parciais preservam a situação e o saldo restante; a lista pode mostrar atraso sobre parcelas originais ainda não recebidas. Emissão ou cancelamento fiscal não são inferidos de uma baixa ou reversão.

## Concorrência, autorização e falhas

Escrita serializada por lock da clínica, dentro de transação MySQL. A associação ativa e a permissão de gestão são verificadas novamente dentro da transação. Cada alteração exige a revisão atual; edição concorrente obriga recarregar e conferir. Clínica, paciente e sessão são conferidos no servidor. Consulta exige VIEW_FINANCIAL; alteração exige MANAGE_FINANCIAL. Portal continua derivando o paciente da conta e exibindo somente lançamentos explicitamente liberados, agora mostrando recebido líquido e identificando legado.

Toda mutação nova exige requestId UUID. O servidor guarda chave única por clínica, hash do conteúdo e autor, resultado e ação na mesma transação. Repetir a mesma operação retorna seu resultado sem duplicar movimentos; reutilizar chave com outro conteúdo é conflito. As permissões continuam sendo verificadas antes de atender um replay. Após erro de rede, repetir com a mesma chave e o mesmo conteúdo; não gerar outra chave antes de conferir o resultado. A interface mantém a chave durante a tentativa.

Cobrança, itens, parcelas, baixa, movimento, caixa e auditoria são persistidos atomicamente. Falha de auditoria reverte tudo. Erros internos financeiros são apresentados sem SQL, parâmetros ou conteúdo sensível. O log registra apenas a falha e identificadores internos de clínica/conta.

## Caixa e relatórios

Uma sessão de caixa por clínica/vertical; aberturas simultâneas são serializadas e há chave única para novos caixas abertos. Saldo esperado = abertura + entradas − saídas. Entradas e saídas provêm de movimentos persistentes. Suprimentos e sangrias alteram a gaveta, sem criar receita ou despesa. Não se permite saldo negativo nem ultrapassar limites. Caixa fechado não recebe novas alterações.

Fechamento exige revisão atual e contagem física. Diferença exige justificativa de pelo menos oito caracteres; a diferença fica preservada e não altera recebimentos/despesas para forçar fechamento. Outra abertura exige novo valor inicial explicitamente conferido.

O relatório usa uma leitura transacional consistente, soma recebido bruto menos reversões, despesas efetivamente baixadas, saldos originais ainda abertos e parcelas vencidas. Confere parcelas, itens, totais e livro financeiro antes de apresentar números; divergências bloqueiam o relatório e as operações correspondentes. Isso detecta inconsistências cobertas pelas regras, sem oferecer certificação externa ou garantia contra administrador com acesso direto ao banco. Auditoria e livro não têm API de alteração/exclusão.

## Legado preservado

Migração 0013 é aditiva: 3 tabelas novas (operações, parcelas, movimentos), revisões e identificação de livro em cobranças, despesas e caixa. As linhas antigas continuam com ledgerVersion=0. Não se inferem pagamentos, itens, parcelas, clínica ou titularidade para fabricar histórico.

Legado aparece identificado, fica bloqueado para movimentação e fora dos novos totais consolidados. Dados bancários e fiscais fictícios antigos não são expostos como autorização real. A associação e migração de uma base financeira real exigem conferência própria e aprovação do procedimento antes de um piloto; não existe conversão automática nesta entrega. Textos de auditoria antigos permanecem preservados, acompanhados da explicação de que podem descrever simulações.

## O que permanece pendente

- Escolher e contratar provedores e disponibilizar ambiente de testes, credenciais e requisitos de cobrança/fiscal.
- Implementar cobranças reais, validação de webhook assinado, deduplicação de eventos, ordem de eventos, consulta ao provedor e conciliação.
- Estorno bancário real com retorno externo; rejeição, cancelamento e consulta fiscal; anexos e comprovantes externos verificáveis.
- Homologar caixa, relatórios e financeiro contra os retornos dos provedores.
- Pacotes/repasses automáticos ficam fora do escopo atual por decisão do usuário; podem ser registrados manualmente com autoria e conferência. Regras futuras precisam definir valores, base e momento de cálculo.
- Homologação de produção, segregação de funções, retenção, backup/restauração, monitoramento e revisão independente continuam na etapa 8. Testes aprovados não significam ausência absoluta de falhas.

Simulação de webhook é recusada em todos os ambientes. Foram removidos QR PIX, boleto, POS, números de autorização e notas fiscais inventados, além de gráficos, indicadores e promessas de integridade sem evidência. O provedor Manus permanece; login OAuth real depende da configuração já pendente.

## Revisão local

Execute `node scripts/open-review.mjs --finance` após build e banco local disponíveis. Abre `/finance` para a equipe e `/portal` em contexto separado para o paciente, normalmente em `http://localhost:3420`. Usa a mesma clínica fictícia exclusiva de revisão e sessões de duas horas. Nenhum login alternativo é adicionado ao produto. O script preserva alterações existentes e prepara exemplos somente quando faltam; fechar todas as janelas encerra o servidor.

Percurso sugerido: resumo → nova cobrança → revisar itens/parcelas → registrar recebimento manual → histórico → reversão → despesa → caixa/suprimento/sangria → contagem e fechamento → resumo/auditoria. Os exemplos não movimentam dinheiro real. As capturas da etapa 5 ficam apenas no ambiente local.

**Parar para análise do usuário. Não iniciar etapa 6. Etapa 5 permanece aberta nas integrações ainda não definidas.**

## Evidências

TypeScript aprovado; 145 testes unitários aprovados e 1 caso antigo de banco ignorado na suíte unitária; 82 testes MySQL aprovados (28 financeiros). Cobertos valores adulterados, limites, arredondamento, referências entre clínicas, autorização/revogação, reenvios simultâneos, baixa concorrente, reversão parcial, livro/caixa, adulteração de saldo, rollback em falha de auditoria e paginação. Chrome validou os fluxos completos e regressões. Schema com 34 tabelas/412 colunas e seed preservado. Build aprovado, com aviso de tamanho do bundle.
