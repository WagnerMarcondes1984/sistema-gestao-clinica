# Equipe, convites e associações — entrega da etapa 2

Revisão solicitada pelo usuário antes de iniciar a etapa 3.

## Rotas

- `/app/team`: equipe, acessos, criação e cancelamento de convites.
- `/invite`: verificação e aceitação pelo destinatário.

Entre como administrador da clínica para visualizar a gestão. Contas comuns veem apenas sua situação de associação, sem os nomes e contatos da equipe.

## Funcionamento

1. Em Equipe, informe o e-mail, o papel e as permissões. O servidor limita as permissões ao papel escolhido. Notas restritas são concessões adicionais de psicólogo.
2. Para o papel Paciente, selecione um cadastro existente da mesma clínica. Este bloco não cria ou edita cadastros clínicos da etapa 3.
3. Crie o convite e copie o link exibido uma única vez. Compartilhe diretamente com o destinatário. Não há envio automático de e-mail nesta entrega.
4. O destinatário abre o link, entra com a conta do e-mail indicado, confere a clínica e aceita. OAuth Manus continua sendo o provedor atual. O fluxo preserva o convite ao passar pelo login e retorna somente à rota interna `/invite`.
5. O vínculo é criado em transação. Aceitações simultâneas do mesmo convite resultam em somente uma aceitação. Se a conta já tem clínica ativa, o servidor exige revisão da associação.
6. O administrador pode editar papel, permissões e acesso ativo. Desativação bloqueia as próximas requisições; reativação preserva a identidade e revisa as permissões.

## Proteções implementadas

- Convites duram 72 horas e são de uso único. Podem ser cancelados antes do uso.
- O banco guarda somente SHA-256 do segredo aleatório de 32 bytes. Listagens não retornam segredo nem hash.
- O segredo fica no fragmento do link, removido da barra após leitura. Verificação e aceitação usam POST para não incluí-lo na URL de consultas. Analytics opcional não carrega na rota de convite.
- Aceitação exige o e-mail da identidade autenticada e uma clínica ativa. Se o administrador criador perdeu o acesso, o convite deixa de conceder acesso.
- Não é possível usar um convite de paciente de outra clínica nem associar o mesmo cadastro a duas contas.
- Proprietário e superadministrador ficam protegidos contra alteração neste fluxo; ninguém altera o próprio acesso. Administradores comuns não concedem nem alteram o papel de administrador.
- Leitura e escrita administrativas filtram a clínica do usuário e registram eventos de criação, aceitação, cancelamento e alteração de vínculo.
- Índice único por clínica/usuário impede duplicação de vínculos. As alterações de acesso e aceitação usam locks e transações.

## Entrada de uma clínica

Uma conta autenticada que seja administradora da instalação e não tenha associação anterior pode criar uma clínica explicitamente em `/app/team`. Ela recebe o papel de proprietário. Usuários comuns e administradores revogados não criam clínicas automaticamente.

O papel global de administrador da instalação é configurado no fluxo existente pelo `OWNER_OPEN_ID`; não deve ser concedido por cadastro público. Configurar credenciais reais não faz parte desta entrega.

## Limites para revisão

- A troca de provedor de autenticação foi recomendada para produção, mas não foi implementada neste bloco de equipe. A homologação do OAuth externo real continua dependente das credenciais do ambiente.
- Não há disparo automático de mensagens, transferência de propriedade nem seleção de múltiplas clínicas ativas.
- Registros financeiros antigos sem clínica continuam isolados até associação revisada.
- Antes de aplicar o índice único em uma instalação existente, confira duplicidades de `(tenantId, userId)` e faça backup. A migração não remove nem combina vínculos automaticamente.
- O envio do link é uma ação do administrador. Os testes usam dados fictícios locais e não enviam mensagens a terceiros.

Os resultados de testes e o ponto de parada estão em `EXECUCAO-DO-PLANO.md`. Este foi o ponto de parada da etapa 2. A etapa 3 foi autorizada e sua situação atual está no plano e em `ETAPA-3-OPERACAO.md`.

## Prévia da interface

Capturas locais verificadas no Chrome, com contas e dados fictícios: [desktop](previews/equipe-desktop.png) e [celular](previews/equipe-mobile.png).
