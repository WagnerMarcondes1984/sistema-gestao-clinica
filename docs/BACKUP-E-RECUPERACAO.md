# Backup e recuperação do MindOS

## Contrato e limites

Este bloco oferece **backup manual offline de uma instância** e **ensaio local isolado**. Não há agendador, cópia externa, retenção automática nem recuperação de produção automática. Destino externo e política de frequência/retenção ainda serão definidos. Não apagar arquivos antigos antes dessa definição e da comprovação de recuperação.

O backup contém todas as tabelas InnoDB da base, inclusive histórico de migrações, e todos os arquivos UUID `.bin` do armazenamento privado. O programa confere que o contêiner do dump corresponde ao servidor da URL, que os documentos referenciados existem e que os manifestos de dados/arquivos não mudaram durante a cópia. Views, triggers, eventos, rotinas ou tabelas sem chave primária exigem um procedimento revisado: o programa recusa esses casos.

Formato `.mindos.enc`: cabeçalho/versionamento autenticado, nonce aleatório, AES-256-GCM e tag. Uma cópia adulterada ou chave incorreta é recusada antes da extração. A lista do tar aceita somente os arquivos esperados; links, travessia e tipos especiais são recusados. Diretórios privados 0700; dentro do checkout operacional, somente `.mindos-private` é aceito para evitar temporários fora da área ignorada pelo Git. Diretórios novos; não sobrescreve um destino de extração existente.

O payload contém `keys.json` com as chaves de integridade clínica e documentos. Ele fica **dentro do arquivo cifrado**. O segredo JWT e as senhas do banco não são incluídos no arquivo de chaves; uma recuperação deve gerar/configurar sessão nova e exigir novo login. A chave externa `BACKUP_ENCRYPTION_KEY` tem 32 bytes aleatórios em base64, não entra no contêiner do aplicativo em produção e deve ser guardada separadamente, com acesso restrito e um procedimento de custódia. Não trocar chaves clínicas/documentos existentes sem migração própria.

O SQL e o tar intermediários existem temporariamente em diretório 0700, com arquivos 0600. Limpeza automática ocorre no término normal/erro tratado. Queda de energia ou encerramento forçado pode deixar `.work-*` ou diretórios de ensaio: manter o disco privado cifrado, inspecionar esses diretórios somente com o responsável e remover os temporários identificados após recuperação. Não se promete apagamento seguro em SSD. Quem controla o usuário/host Docker pode acessar segredos: restringir a administração do servidor é obrigatório.

O recibo usa assinatura Ed25519 com chave derivada de modo separado da chave operacional. O aplicativo recebe somente `RECOVERY_RECEIPT_PUBLIC_KEY` (SPKI DER em base64), para verificar a assinatura, sem conseguir abri-la como chave privada ou descriptografar backups. Gerar a chave pública no host operacional com `node --env-file=/srv/mindos/config/backup.env scripts/recovery-public-key.mjs` e copiar somente a saída pública para `production.env`. Não copiar a chave de abertura para o ambiente do app.

## Criação local

1. Fechar revisão e servidor do projeto; preservar o MySQL.
2. Configurar as três chaves independentes no `.env`, sem publicar valores. Chave de backup: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
3. Executar `node scripts/backup.mjs`. Saída `created_not_restored` é somente confirmação da cópia, sem atestar restauração.
4. Executar `node scripts/verify-recovery.mjs` para criar uma nova cópia e verificar recuperação isolada. Aceita apenas banco local `mindos_dev`/`mindos_test`; nunca importa no banco original.
5. Exigir saída `PASS`, `targetRemoved: true` e recibo autenticado em `.mindos-private/operations/recovery-latest.json`. Ausência/falha não altera o resultado para aprovado.

O ensaio local usa datadir temporário em memória (512 MiB), contêiner limitado a 768 MiB e datas interpretadas explicitamente em UTC. Ele mede a lógica de recuperação, não a durabilidade/desempenho do disco do VPS. Bases maiores exigem dimensionar o ambiente isolado. A imagem MySQL já deve estar disponível; o ensaio usa (`--pull=never`), porta aleatória em loopback, nome aleatório e rótulo próprio. Exige banco vazio, usuário limitado ao destino, compara todas as linhas por hashes/contagens e verifica documentos/histórico. A limpeza remove somente o contêiner com nome/rótulo desse ensaio. Não usar `docker compose down -v` ou comandos de limpeza global.

## Preparação do backup no VPS

Usar um checkout operacional da versão instalada com Node compatível, dependências de produção, Docker CLI e `tar`. O usuário deve acessar somente o necessário. A URL operacional usa o usuário de migração/backup, com visibilidade dos objetos SQL; o app recebe somente a credencial DML. Modelo em `deployment/backup.env.example`. Configuração separada, fora do Git, por exemplo `/srv/mindos/config/backup.env`, modo 0600:

```dotenv
APP_ENV=production
BACKUP_DATABASE_URL=mysql://mindos_migrator:SENHA_CODIFICADA@127.0.0.1:3308/mindos
BACKUP_SOURCE_CONTAINER=NOME_REAL_DO_MYSQL
BACKUP_APP_CONTAINER=NOME_REAL_DO_APP_PARADO
PRIVATE_DOCUMENT_ROOT=/srv/mindos/private/documents
BACKUP_ROOT=/srv/mindos/backups
BACKUP_ENCRYPTION_KEY=CHAVE_BASE64_EXISTENTE
CLINICAL_INTEGRITY_SECRET=SEGREDO_EXISTENTE
DOCUMENT_ENCRYPTION_SECRET=SEGREDO_EXISTENTE
```

Planejar indisponibilidade e confirmar que **todas** as instâncias e escritores foram parados. O programa comprova o estado do contêiner indicado, não descobre servidores externos ou réplicas. O Compose preparado contém uma instância de aplicação. Manter MySQL ativo e executar:

```bash
docker compose --env-file /srv/mindos/config/production.env -f compose.production.yaml stop app
node --env-file=/srv/mindos/config/backup.env scripts/backup.mjs
```

Conferir sucesso antes de reiniciar. O dump nunca passa senha pela linha de comando: usa ambiente do processo/`docker exec --env MYSQL_PWD`. Não usar `set -x`, não imprimir `docker inspect` completo e não armazenar dumps/chaves/ambientes em tickets ou GitHub.

Definir e testar com o provedor: cópia externa cifrada, acesso mínimo, proteção contra sobrescrita, validação de hash, retenção, alerta de falha/idade e recuperação com a chave guardada separadamente. Uma cópia no mesmo disco não cobre perda do host. Esses itens continuam pendentes.

## Recuperação de produção — procedimento assistido, em destino novo

1. Conter o incidente, parar escritores, registrar versão/horário e preservar origem, logs e evidências em local restrito. Não sobrescrever a base atual.
2. Provisionar rede isolada, MySQL compatível **novo**, banco vazio, usuário limitado a esse banco e volume privado novo. Sem acesso público.
3. Copiar o arquivo cifrado e obter a chave pela custódia separada. Configurar `RESTORE_BACKUP_FILE`, `RESTORE_ROOT` privado e `BACKUP_ENCRYPTION_KEY` no arquivo operacional. Executar `node --env-file=/srv/mindos/config/recovery.env scripts/unpack-backup.mjs`.
4. Saída `authenticated_not_imported` confirma arquivo/manifesto, **não importa o banco**. A pasta contém SQL, documentos e chaves em texto claro: restringir acesso e evitar logs de conteúdo.
5. O responsável deve conferir que o banco de destino é o novo banco vazio e importar `database.sql` com usuário limitado a ele, `--binary-mode=1 --local-infile=0`, sem comandos locais do cliente nem privilégios globais e sem senha na linha de comando. Nunca usar o endereço da origem.
6. Restaurar `documents/` no volume privado novo e configurar as chaves clínicas/documentos de `keys.json` no novo ambiente protegido. Gerar segredo de sessão independente; invalidar sessões antigas. Não imprimir as chaves.
7. Comparar hashes/contagens de **todas** as tabelas com o manifesto e conferir todos os arquivos. Usar `databaseManifest()` da biblioteca operacional e os validadores clínicos/documentais da mesma versão em homologação isolada. A versão instalada deve corresponder às migrações do backup antes de qualquer migração nova.
8. Testar acesso por papéis/clínicas, prontuário, documentos, agenda, financeiro e portal. Registros legados continuam identificados como não verificados. Registrar RPO/RTO observados e aprovação dos responsáveis.
9. Somente depois da aprovação humana, planejar troca de tráfego e acompanhar operação; preservar o destino anterior sem escrita para eventual análise. Remover temporários em texto claro após conferência e guarda das evidências mínimas.

O script de ensaio local não é um comando para recuperar produção e recusa esse ambiente. Homologar este procedimento completo com cópia externa antes do lançamento.
