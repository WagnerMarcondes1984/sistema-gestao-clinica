# Matriz de permissões

OAuth Manus autentica a identidade. A associação ativa em `mindos_memberships` define a clínica e as permissões. O papel global `users.role=admin` não cria uma associação nem concede automaticamente acesso a uma clínica.

| Papel | Modelo inicial de acesso |
|---|---|
| OWNER / CLINIC_ADMIN / SUPER_ADMIN | Acesso total à clínica, como já previsto pelo backend; não ultrapassa o filtro da clínica |
| PSYCHOLOGIST | Dados administrativos, agenda e leitura/escrita clínica; notas restritas exigem concessão adicional |
| ASSISTANT / RECEPTIONIST | Cadastro administrativo e agenda; sem prontuário e sem financeiro |
| FINANCIAL | Dados básicos e leitura/alteração financeira; sem prontuário |
| SALES | Dados administrativos; sem prontuário e sem financeiro |
| VIEWER | Dados básicos; sem prontuário e sem financeiro |
| PATIENT | Somente portal do paciente vinculado; o servidor deriva o paciente do usuário |

Os modelos estão em `shared/permissions.ts`. Permissões efetivas permanecem armazenadas explicitamente por associação. Os modelos não ampliam automaticamente permissões de registros existentes. Uma associação financeira pode ter somente `VIEW_FINANCIAL`; nesse caso não altera cobranças, contas ou caixa.

`VIEW_RESTRICTED_NOTE` libera leitura; `EDIT_RESTRICTED_NOTE` libera criação/finalização de nota restrita e não concede leitura implicitamente. Administradores com acesso total continuam sujeitos ao isolamento por clínica e à auditoria.

Associações inativas são recusadas. Enquanto não existir seleção explícita de clínica, um usuário com mais de uma associação ativa recebe erro em vez de operar na primeira clínica encontrada.

Gestão visual em `/app/team`, com convites, concessões, desativação e reativação. O servidor aplica um limite de permissões por papel: recepção e financeiro não podem receber permissões clínicas por este fluxo. Proprietário e superadministrador são protegidos; ninguém altera o próprio acesso. Administradores comuns não gerenciam outros administradores.

Convites de paciente exigem seleção de cadastro da própria clínica e conta do e-mail destinatário. Consulte `EQUIPE-E-CONVITES.md` para operação, proteção dos links e limitações da entrega.

Na etapa 3, `MANAGE_PATIENTS` separa escrita do cadastro administrativo da consulta básica. Novos modelos de psicólogo, assistente e recepção incluem esta permissão. Associações existentes exigem concessão revisada em Equipe; nenhum acesso foi ampliado automaticamente. Detalhes em `ETAPA-3-PACIENTES.md`.

## Complemento da etapa 4

Psicólogos precisam também de vínculo ativo explícito com cada paciente. Administradores supervisionam a própria clínica, mas não editam rascunhos de outro autor. Registros finalizados são imutáveis para todos; mudanças são adendos.

`VIEW_DOCUMENTS` e `MANAGE_DOCUMENTS` distinguem consulta e gestão. Modelos novos de psicólogo, assistente e recepção incluem documentos administrativos; documentos clínicos continuam sujeitos ao acesso clínico. Associações existentes não recebem permissões automaticamente. Gestão de vínculos clínicos exige `MANAGE_TEAM`; liberação financeira exige `MANAGE_FINANCIAL`. Paciente consulta somente documentos liberados, decisões e receitas explicitamente vinculadas à própria conta.

## Complemento da etapa 5

Escritas financeiras verificam novamente associação ativa e MANAGE_FINANCIAL dentro da transação e lock da clínica. A revisão e a chave de operação não substituem autorização: reenvio também é recusado após revogação. Autoria vem da conta no banco. VIEW_FINANCIAL consulta cobranças, parcelas, relatórios e livro; a interface de consulta não mostra formulários de alteração. Registros legados sem conferência não são movimentados mesmo por administrador. Não existe endpoint público ativo de webhook bancário nesta entrega; a simulação anterior é recusada em todos os ambientes.
