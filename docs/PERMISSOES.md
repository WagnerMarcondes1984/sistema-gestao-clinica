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

Gestão visual de equipe, convites, concessões e revogações ainda deve ser concluída na etapa 2. Não edite permissões a partir de uma tela demonstrativa nem aceite o nome de um operador enviado pelo cliente como identidade auditável.
