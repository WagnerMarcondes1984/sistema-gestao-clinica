# Etapa 7 — administração e site público

Entrega para revisão antes da etapa 8. O Admin Studio em `/app/admin-studio` substitui as ações demonstrativas por edição persistida, prévia privada, aprovação, publicação e restauração de versões. Publicar aqui altera o conteúdo servido pela aplicação; não contrata hospedagem nem conecta um domínio externo.

## Edição e publicação

A marca contém nome público, marca textual e cores. Os blocos controlados têm tipo, título, texto, itens, visibilidade e ordem. Tipos disponíveis: apresentação, sobre, serviços, profissionais públicos, perguntas frequentes, localização, agendamento e rodapé. Informações de profissionais e serviços são textos institucionais revisados manualmente; o CMS não importa cadastros internos ou dados clínicos.

Os metadados incluem título, descrição e origem canônica HTTPS opcional. Cidade, endereço, telefone e e-mail são contatos públicos declarados. Atalhos de agendamento e portal podem ser ocultados; isso não revoga contas nem muda as permissões ou a disponibilidade dos serviços de agendamento.

Salvar cria uma nova versão imutável em rascunho. Não muda a versão pública, nem mesmo a marca. Na aba Versões e publicação, abrir a prévia privada para conferir o snapshot salvo. A prévia não inclui alterações ainda não salvas no editor.

Aprovar altera somente o estado do rascunho; publicar exige aprovação anterior e confirmação explícita. A aprovação e publicação podem ser realizadas pelo mesmo administrador autorizado; não há exigência de segundo aprovador independente nesta entrega. A versão anteriormente publicada é arquivada. Restaurar aceita somente versão arquivada que já foi aprovada e publicada, e restaura exatamente marca, blocos, configurações e metadados. Editar qualquer versão cria outro snapshot; não modifica o anterior.

Todas as alterações usam transação, lock da clínica, revisão e autoria autenticada. A auditoria participa da mesma transação: se falhar, a publicação é revertida. Reenvio idêntico de criação do rascunho não duplica versão. Alterações concorrentes com a mesma revisão geram conflito; carregar uma versão atualizada no editor e conferir as mudanças antes de reaplicar. Textos não são sobrescritos automaticamente por atualizações da consulta.

## Site e identidade

O endereço público é `/site/<slug-da-clinica>`. `/site` resolve somente `PUBLIC_TENANT_SLUG`, quando configurado. Clínica inativa, slug inexistente ou ausência de publicação válida não exibem conteúdo. Não há fallback para a primeira clínica nem para versões antigas sem contrato válido.

A página pública é renderizada no servidor, com título, descrição, Open Graph, dados estruturados institucionais e perguntas frequentes habilitadas. `/site/<slug>/llms.txt` contém somente os textos públicos habilitados. Sem origem canônica informada, o servidor não inventa uma URL. O cabeçalho Host do visitante não define metadados canônicos.

O agendamento usa `/book?clinic=<slug>` e valida novamente que o serviço pertence à clínica indicada. Regras de disponibilidade, triagem e limites de abuso permanecem. Sem slug explícito, o fluxo anterior continua usando `PUBLIC_TENANT_SLUG`.

A marca publicada aparece no cabeçalho do sistema e no portal da própria clínica. Rascunhos não mudam esses locais. Sem publicação, o cabeçalho usa o nome real da clínica ou MindOS enquanto o acesso é verificado. O seletor local de verticais demonstrativas e os nomes fictícios de operador/unidade deixaram de aparecer no cabeçalho compartilhado.

## Permissões e proteção

`VIEW_PUBLIC_SITE` consulta versões e prévias. `MANAGE_PUBLIC_SITE` cria rascunhos. `PUBLISH_PUBLIC_SITE` aprova, publica e restaura. Administradores com ALL continuam sujeitos à clínica e associação ativa. Nenhuma associação existente recebeu permissões automaticamente. Comercial pode receber explicitamente consulta/edição em Equipe; publicação permanece com administração autorizada. Consulta não mostra ações de publicação nem habilita edição.

A prévia exige sessão válida e permissão na clínica da versão, responde sem cache e com noindex. Os textos públicos são escapados no HTML, atributos e JSON-LD; cores aceitam somente hexadecimal, links operacionais são controlados e a origem canônica aceita somente HTTPS sem credenciais, caminho ou query. Não existem campos de HTML, CSS ou JavaScript arbitrários. A página usa CSP restritiva e não carrega scripts nem dependências de terceiros. O texto das cores principais recebe contraste automaticamente. O site público não consulta pacientes, prontuários, financeiro, documentos privados ou auditorias.

Migração 0015 adiciona revisão e ponteiro de publicação à clínica, chave/hash de criação e data de aprovação às versões, e amplia contentJson para MEDIUMTEXT. Registros anteriores são preservados e identificados como legados: precisam de novo rascunho revisado para publicação. O perfil institucional antigo permanece para consulta autorizada, sem alimentar o site. O endpoint antigo de escrita exige usar o novo fluxo versionado.

## Domínio e módulos pendentes

DNS/TLS aparecem como não verificados. Informar origem canônica não comprova propriedade, resolução DNS, certificado ou implantação. Esses serviços dependem de hospedagem e configuração próprias.

A aba Integrações pendentes explica: pagamentos bancários e fiscal, e-mail/WhatsApp, vídeo, conexão de domínio e upload público de mídia ainda não estão disponíveis. A marca desta entrega é textual. Nenhuma configuração fictícia de segurança, emissão ou entrega é apresentada como confirmada. Mantêm-se as escolhas anteriores: Manus, provedores a definir e pacotes/repasses manuais.

## Revisão local

Após migração e build, executar `node scripts/open-review.mjs --studio`. Abre Admin Studio, site e portal na clínica fictícia de revisão, normalmente em localhost:3420. A preparação usa o próprio fluxo real de rascunho/aprovação/publicação para criar somente conteúdo fictício local, se necessário. Não altera credenciais Manus nem publica em hospedagem externa. Sessões temporárias de duas horas; fechar todas as janelas encerra o servidor e preserva os dados fictícios.

Capturas novas ficam locais. A árvore e manifesto da consolidação geral continuam sendo registros históricos anteriores às etapas 6 e 7. OAuth real, integrações externas, hospedagem, backup/restauração e homologação de produção permanecem pendentes nas respectivas etapas. A etapa 8 não foi iniciada.

## Evidências da entrega

TypeScript/build aprovados; 156 testes unitários aprovados e um caso antigo ignorado; 117 testes de integração MySQL aprovados, incluindo 14 do CMS. Schema e seed conferidos. Chrome aprovou o fluxo completo e as regressões anteriores, sem exceções de execução. Permanece aviso de tamanho do bundle interno.

| Limite verificado | Evidência |
|---|---|
| Interface → API → banco | Marca/blocos/SEO salvos pela interface, snapshot consultado na API; revisão e concorrência validadas no MySQL |
| Prévia privada | HTTP 403 sem sessão; 404 para outra clínica; 200 para conta autorizada, com noindex |
| Rascunho/aprovação → público | Site continua indisponível antes da publicação; novo rascunho não muda o HTML publicado |
| Publicação → site/portal | HTML, metadados e llms.txt atualizados; marca publicada refletida no portal da clínica |
| Restauração → resposta | HTML restaurado comparado integralmente com a versão pública anterior |
| Consulta e celular | Ações de publicação ausentes para leitor; página pública móvel sem transbordamento |
| Falha de auditoria → consistência | Publicação, estado e revisão revertidos na mesma transação |
