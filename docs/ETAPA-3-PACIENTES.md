# Etapa 3 — cadastro de pacientes e seleção real

Início autorizado em 18/10/2026. Esta entrega implementa o primeiro item da etapa 3 e a seleção de pacientes nas telas. Não conclui toda a operação de agenda e recepção.

## Operação

- `/patients`: listagem paginada, busca por nome, nome de preferência, e-mail ou telefone e filtro de situação.
- “Novo paciente” cria um cadastro administrativo. “Editar” permite atualizar dados e mudar a situação para ativo, em triagem, inativo ou encerrado.
- Inativação e encerramento preservam o cadastro, o vínculo com o portal, o prontuário e as sessões existentes. Novos agendamentos exigem reativação.
- O nome na lista abre `/patients/view?patientId=...`, com dados reais, sessões autorizadas e atividade administrativa registrada.
- Prontuário e agenda recebem a seleção pelo endereço e permitem buscar/trocar de paciente. Não há seleção automática do paciente de ID 1.
- O prontuário pede confirmação para descartar texto não salvo ao trocar pela seleção. Salvar mantém o texto até o servidor confirmar. Edição de versões e adendos continua na etapa 4.
- Agenda mostra apenas sessões existentes. Dados ilustrativos, indicadores fixos e botões que apenas simulavam ações foram removidos dessa tela; criação e edição visual foram concluídas no bloco descrito em `ETAPA-3-OPERACAO.md`.

## Permissões e isolamento

`VIEW_PATIENT_BASIC` permite consultar cadastro e lista. `MANAGE_PATIENTS` permite criar, editar e alterar situação. O novo modelo inicial inclui escrita para psicólogo, assistente e recepção; financeiro, comercial e consulta básica continuam sem escrita de cadastro. Administradores da clínica têm acesso total.

**Associações existentes não recebem a nova permissão automaticamente.** O administrador deve revisar e conceder “Cadastrar, editar e inativar pacientes” em Equipe quando necessário. Não foram ampliadas permissões antigas por migração.

Todas as operações derivam a clínica da sessão, sem aceitar `tenantId`, `portalUserId` ou autoria do cliente. Referências de outra clínica retornam “não encontrado”. Recepção não lê prontuário. Agenda no 360° só é retornada a quem possui permissão de agenda. A resposta de cadastro não expõe a identidade interna da conta do portal.

## Validação e duplicidades

- Nome obrigatório; e-mail e telefone validados; nascimento válido entre 1900 e hoje. Nascimento é tratado como data civil na interface.
- Busca ignora diferenças de maiúsculas e acentos. `%`, `_` e `!` são texto literal. Telefones podem ser pesquisados com ou sem formatação.
- Possível duplicidade: nome normalizado igual e mesma data de nascimento; quando falta nascimento, mesmo nome com e-mail ou telefone igual; cadastros sem data e sem contato com mesmo nome também são barrados.
- Mesmo contato com nomes diferentes é permitido para familiares. Mesmo nome com datas de nascimento diferentes é permitido. Não há fusão automática de históricos nem garantia de detectar grafias diferentes da mesma pessoa.
- Criações e alterações são serializadas por clínica em transação para a comparação incluir cadastros simultâneos e registros legados. A verificação de identidade percorre os pacientes da clínica; revisar indexação em bases de grande porte.
- `revision` impede sobrescrita silenciosa de duas edições concorrentes. Em conflito, recarregue e revise os dados antes de reenviar.
- A auditoria registra o usuário autenticado e a operação, sem copiar os dados pessoais para a justificativa.

## Migração e limites

`0008_lumpy_night_thrasher.sql` adiciona somente `revision`, com valor inicial 1. Não apaga pacientes, não troca vínculos e não altera permissões existentes.

Manus permanece como provedor e exige credenciais reais para login no navegador normal. Os testes de interface usam sessões assinadas de contas fictícias locais; não homologam OAuth externo.

Os demais itens da etapa 3 foram concluídos no bloco descrito em `ETAPA-3-OPERACAO.md`. As datas administrativas agora usam o fuso da clínica.

Evidências e situação no plano: `EXECUCAO-DO-PLANO.md` e `PLANO-DE-CONCLUSAO-MINDOS.md`.

## Evidências

TypeScript e build aprovados; 77 testes unitários aprovados e 1 ignorado; 23 testes de integração aprovados com MySQL real. Schema: 21 tabelas e 255 colunas. Chrome aprovou criação, busca, duplicidade, edição/inativação/reativação, persistência após recarregar e seleção no 360°, prontuário e agenda, incluindo descarte confirmado do texto não salvo. Também passaram as regressões de equipe, portal e logout. Permanece aviso de bundle grande no build.

Capturas fictícias: [desktop](previews/pacientes-desktop.png) e [celular](previews/pacientes-mobile.png). As tabelas permitem rolagem horizontal em telas estreitas.
