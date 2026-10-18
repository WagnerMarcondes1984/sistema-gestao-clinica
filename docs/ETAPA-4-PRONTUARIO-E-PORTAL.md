# Etapa 4 — prontuário, documentos e portal

Implementada em 18/10/2026 para revisão local. A etapa 5 não foi iniciada.

## Prontuário e acesso

Em `/clinical-records`, selecione um paciente, escreva um rascunho e revise antes de finalizar. Somente o autor autenticado edita ou finaliza seu rascunho; revisões concorrentes são recusadas. Registros finalizados não podem ser sobrescritos: alterações seguem em adendos separados, vinculados ao registro original. O histórico preserva autoria, conteúdo e revisões.

Administradores supervisionam a própria clínica. Psicólogos precisam de associação ativa, permissão clínica e vínculo explícito com o paciente, gerenciado em `/patient-care`. Recepção e financeiro não ganham acesso clínico por permissões administrativas. Notas restritas exigem concessões adicionais. A revogação é conferida nas requisições seguintes.

As versões novas usam uma cadeia HMAC com segredo independente. Isso permite verificar alterações indevidas de conteúdo e encadeamento; não constitui certificação externa ou proteção contra um administrador com acesso simultâneo ao banco e ao segredo. Registros antigos aparecem como legado não verificado. Ao editar um rascunho legado, registra-se a situação observada como base, sem inventar histórico anterior. Não se altera registro finalizado legado.

## Documentos privados

Em `/patient-care`, envie PDF, PNG ou JPEG de até 8 MB. Os bytes devem corresponder à assinatura do formato informado; não há antivírus integrado. Os arquivos são criptografados com AES-256-GCM, com identificadores opacos, hash de integridade e diretório privado fora da raiz pública. Novos documentos começam privados. Documentos clínicos exigem também acesso clínico ao paciente.

Libere explicitamente para o portal ou revogue. Cada download autentica novamente a conta, clínica, paciente, permissões e situação atual do documento. A resposta usa attachment e cache privado sem armazenamento. Revogação bloqueia novos downloads, sem apagar o arquivo de auditoria nem recuperar cópias já baixadas. Metadados legados sem arquivo continuam sem download. Não são geradas URLs públicas de armazenamento.

## Consentimentos e portal

Em `/app/consents`, crie um rascunho, revise o texto completo e publique. Uma nova versão publicada aposenta a anterior do mesmo código; decisões anteriores são preservadas. O portal permite aceitar, não aceitar e retirar um aceite. A evidência guarda conta/paciente autenticados, texto integral, versão, data do servidor e encadeamento de integridade. Trata-se de aceite eletrônico simples autenticado; assinatura certificada não foi implementada.

O portal deriva o paciente da conta, sem aceitar outro paciente enviado pelo cliente. Mostra nome, sessões, documentos liberados, termos e histórico próprios. O financeiro mostra somente receitas explicitamente vinculadas ao paciente e liberadas por alguém autorizado, pelo código interno em `/patient-care`. Não existe associação por coincidência de nomes. Esta leitura não integra pagamentos, bancos ou emissão fiscal; esses itens continuam na etapa 5.

Solicitações de reagendamento ficam pendentes para a recepção. A equipe aprova escolhendo recursos/horário válidos ou recusa com motivo. A aprovação e a substituição da sessão acontecem na mesma transação; conflitos preservam o pedido pendente e a sessão original. O paciente pode cancelar um pedido pendente.

Teleatendimento integrado fica fora desta entrega: a ação demonstrativa de entrar em sala foi removida. A modalidade online não cria uma sala de vídeo.

## Configuração e conservação

Aplicar migrações 0011 e 0012. As novas tabelas, revisões e vínculos preservam o legado. Campos clínicos e snapshots usam MEDIUMTEXT para suportar texto Unicode extenso sem truncamento.

Configurar `CLINICAL_INTEGRITY_SECRET` e `DOCUMENT_ENCRYPTION_SECRET`, ambos independentes, aleatórios e com pelo menos 32 caracteres. Nunca publicar seus valores. `PRIVATE_DOCUMENT_ROOT` usa `.mindos-private/documents` localmente, ignorado pelo Git e negado pelo Vite. O backend também recusa armazenamento dentro de diretórios públicos.

Preservar banco, diretório privado e segredos em conjunto. Perda da chave impede recuperar os arquivos; troca direta dos segredos impede verificar histórico anterior. Rotação, retenção, restauração de backup, armazenamento compartilhado entre réplicas e homologação de produção continuam na preparação do lançamento, etapa 8.

## Revisão local

Após build e banco local disponíveis, execute `node scripts/open-review.mjs --care`. A ferramenta abre duas janelas com contextos isolados: equipe no prontuário e paciente no portal, com dados fictícios de uma clínica exclusiva. A revisão normalmente usa `http://localhost:3420` e sessões de duas horas; a saída do comando informa a porta efetiva. As janelas já abertas carregam as sessões necessárias.

Há exemplos de prontuário, adendo, documento real, termo e cobrança interna fictícios. O script preserva alterações anteriores, não sobrescreve vínculos conflitantes nem reativa contas desativadas. Ao fechar todas as janelas, o servidor de revisão encerra; os dados demonstrativos permanecem no banco. O login normal do produto continua Manus, cuja configuração real está pendente.

Confira edição e finalização, histórico, acesso por profissional, upload/liberação/revogação, versões de termo, decisões do paciente, financeiro liberado e solicitação de reagendamento. Depois da análise, aguardar novo comando para iniciar a etapa 5.
