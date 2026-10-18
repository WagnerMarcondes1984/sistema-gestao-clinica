# Inventário funcional — base de 17/10/2026

Inventário inicial com atualização das etapas 2 e 3; a homologação visual completa continua pendente. “Parcial” indica que existe implementação persistente, mas a jornada tem lacunas; não equivale a funcionalidade aprovada para produção.

| Rota | Situação | Evidência e trabalho restante |
|---|---|---|
| `/` | Operação implementada e testada | Painel com contadores reais e atalhos autorizados; removidos fallback, pendências e ações demonstrativas da rotina clínica. |
| `/agenda` | Implementado e testado | Criação única/recorrente, edição de ocorrência/série, transições, filtros, fuso e conflitos transacionais. |
| `/app/scheduling` | Implementado e testado | Profissionais, unidades, serviços, publicação de serviços, disponibilidade e fuso da clínica. |
| `/patients` | Implementado e testado | Cadastro administrativo, busca, paginação, edição e inativação, com autorização, duplicidades e controle de edição concorrente. |
| `/patients/view` | Implementado e testado neste bloco | Paciente selecionado por URL, dados administrativos e histórico real, links para agenda e prontuário. Módulos completos dependem das etapas seguintes. |
| `/clinical-records` | Parcial | Consulta e criação de rascunhos para paciente selecionado; confirma descarte ao trocar de paciente. Edição, adendos e finalização visual pendentes. Permissões de notas restritas corrigidas e testadas no backend. |
| `/reception` | Implementado e testado | Fila do dia, check-in por sessão, contadores reais, registro manual de ligação e triagem de solicitações. Não envia mensagens externas. |
| `/portal` | Parcial | Consulta sessões e documentos do paciente derivado da conta; telas demonstrativas removidas. Download, consentimentos, financeiro e reagendamento continuam pendentes. |
| `/book` | Implementado e testado | Serviços publicados, dados mínimos, validação, limites persistentes e solicitação que segue para triagem. Não reserva automaticamente. |
| `/app/team` | Implementado e testado | Gestão de vínculos, permissões, ativação e convites com isolamento por clínica. Login externo real pendente de configuração. |
| `/invite` | Implementado e testado | Verificação e aceitação pessoal, expiração e proteção contra reutilização. Fluxo OAuth de retorno coberto por testes com mocks. |
| `/app/admin-studio` | Parcial | Salva versões CMS e perfil; edição de blocos e várias configurações só mostram mensagens. Domínio/SSL exibidos sem verificação real. |
| `/finance` | Parcial | Métricas persistentes com autorização e isolamento por clínica testados. Homologação financeira completa pendente. |
| `/checkout` | Demonstrativo com persistência | Cria cobranças; PIX, cartão, boleto e emissão fiscal simulados. Falta validação de valores no servidor e integrações reais. |
| `/transactions` | Parcial | Lista e altera transações; confirmar/estornar altera estado interno sem operação bancária real. |
| `/receivables` | Parcial | Consulta cobranças e baixa interna; falta conciliação com provedor real. |
| `/payables` | Parcial | Lista e baixa despesas; completar cadastro, autorização e isolamento. |
| `/cash` | Parcial | Consulta e fechamento persistentes; completar abertura, movimentos, isolamento e conferência de saldos. |
| `/audit` | Parcial | Consulta auditoria financeira protegida por permissão e clínica, com autoria autenticada nas cobranças. |
| `/404` | Implementado no código | Tela de rota inexistente; revisar comportamento no navegador durante homologação. |

## Ausências transversais

- Não existe login independente por e-mail/senha: autenticação usa OAuth Manus.
- Gestão de equipe, convites e permissões entregue na etapa 2; transferência de propriedade e múltiplas clínicas ativas ficam fora deste bloco.
- Não existe funil comercial completo, tarefas de follow-up ou integração efetiva de mensagens.
- Ter um registro `MESSAGE_SENT` não comprova envio de mensagem por um provedor.
- Ter status fiscal `ISSUED` na simulação não comprova autorização fiscal.
- As migrações originais não incluíam o SQL inicial de usuários; restaurado na etapa 1.
- O seed original apagava dados e referenciava usuário de ID 1 sem criá-lo; corrigido na etapa 1.

O levantamento estático de handlers de clique/envio está em `ACOES-DA-INTERFACE.md`.

## Critério para fechar uma ação

Conferir interface → API → banco → resposta, incluindo erros, permissões e ausência de sessão. Botões que apenas chamam `toast`, abas ilustrativas e contadores fixos permanecem pendentes até existir essa evidência. O inventário não substitui os critérios do plano nem declara homologação de telas que ainda não foram exercitadas.
