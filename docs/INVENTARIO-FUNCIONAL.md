# Inventário funcional — base de 17/10/2026

Inventário inicial com atualização das correções da etapa 2; a homologação visual completa continua pendente. “Parcial” indica que existe implementação persistente, mas a jornada tem lacunas; não equivale a funcionalidade aprovada para produção.

| Rota | Situação | Evidência e trabalho restante |
|---|---|---|
| `/` | Parcial | Dashboard MindOS consulta backend autenticado; apresentação sem sessão usa demonstração. Homologar indicadores e permissões. |
| `/agenda` | Parcial | Lista sessões; botões de novo agendamento, ações e recorrência mostram notificações. CRUD visual e concorrência pendentes. |
| `/patients` | Parcial | Paciente 360° consulta paciente fixo; cabeçalho e timeline têm dados estáticos; várias abas são placeholders. |
| `/clinical-records` | Parcial | Consulta e criação de registros persistentes para paciente fixo; falta seleção, edição, adendos e finalização visual. Permissões de notas restritas corrigidas e testadas no backend. |
| `/reception` | Parcial | Fila e eventos conectados ao backend; indicadores fixos, cadastro e atalhos demonstrativos. Check-in precisa refletir sessão. |
| `/portal` | Parcial | Consulta sessões e documentos do paciente derivado da conta; telas demonstrativas removidas. Download, consentimentos, financeiro e reagendamento continuam pendentes. |
| `/book` | Parcial | Envia solicitação pública; não é reserva confirmada. Resolução da clínica pública e triagem pendentes. |
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
- Não existe fluxo completo de gestão de equipe, convites e permissões pela interface.
- Não existe funil comercial completo, tarefas de follow-up ou integração efetiva de mensagens.
- Ter um registro `MESSAGE_SENT` não comprova envio de mensagem por um provedor.
- Ter status fiscal `ISSUED` na simulação não comprova autorização fiscal.
- As migrações originais não incluíam o SQL inicial de usuários; restaurado na etapa 1.
- O seed original apagava dados e referenciava usuário de ID 1 sem criá-lo; corrigido na etapa 1.

O levantamento de 105 handlers de clique/envio está em `ACOES-DA-INTERFACE.md`.

## Critério para fechar uma ação

Conferir interface → API → banco → resposta, incluindo erros, permissões e ausência de sessão. Botões que apenas chamam `toast`, abas ilustrativas e contadores fixos permanecem pendentes até existir essa evidência. O inventário não substitui os critérios do plano nem declara homologação de telas que ainda não foram exercitadas.
