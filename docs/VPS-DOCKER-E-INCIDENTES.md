# Preparação do VPS, migrações e incidentes

## Antes de implantar

Sem VPS/domínio provisionado neste bloco. `compose.production.yaml` prepara MySQL persistente e aplicação sem root, código/dependências pertencentes ao root e volumes privados de escrita separados, com usuário MySQL de execução limitado a SELECT/INSERT/UPDATE/DELETE, sem capacidades extras, raiz somente leitura, volume privado e portas expostas apenas em loopback. Nginx no host deve fornecer HTTPS e sobrescrever cabeçalhos encaminhados. O exemplo não provisiona certificado ou DNS.

O volume MySQL, o diretório privado, configurações e temporários precisam de armazenamento cifrado e acesso restrito. O código não habilita criptografia do disco nem verifica a garantia de armazenamento do provedor; conferir também o local real do volume MySQL/DockerRootDir no VPS. HMAC de integridade clínica não cifra o texto das tabelas.

O operador deve dimensionar recursos, atualizar host/Docker, restringir SSH/administração, configurar firewall sem acesso público ao MySQL/app e conferir conflito da sub-rede Docker proposta. Fixar digests das imagens e analisar vulnerabilidades antes da liberação. A tag Node 24 é configurável por `NODE_IMAGE`; não representa resultado de uma auditoria de vulnerabilidades.

1. Copiar `deployment/production.env.example` para `/srv/mindos/config/production.env`, modo 0600, e substituir todos os exemplos. Segredos separados; senha da URL com codificação adequada. A chave de backup fica somente em `backup.env` no host operacional; gerar `RECOVERY_RECEIPT_PUBLIC_KEY` conforme o runbook e passar apenas essa chave pública ao app. A senha de execução usa 32 a 128 caracteres base64url. O usuário `mindos_migrator` é exclusivo para migração/backup e sua senha não entra no contêiner do app. O script de inicialização cria `mindos` com DML somente em uma base nova; volume existente exige migração de usuários/privilégios assistida, sem reset de volume. Não reutilizar chaves ou dados do ambiente de demonstração.
2. Criar `/srv/mindos/private/documents` para UID/GID 1000, acesso restrito, em disco cifrado e volume persistente. Proteger também a configuração e a área de backups.
3. Registrar origem HTTPS e callback `/api/oauth/callback` no Manus real. Definir `OWNER_OPEN_ID` com a identidade verificada do responsável autorizado pela instalação; após login real, esse administrador pode criar a primeira clínica e convidar a equipe. Não escolher automaticamente o primeiro visitante. Identificador/portal são variáveis públicas de build e execução; mudanças exigem reconstruir a imagem. Segredos nunca são argumentos de build ou `VITE_*`.
4. Validar `docker compose --env-file /srv/mindos/config/production.env -f compose.production.yaml config --quiet`. Não imprimir `config` completo: ele contém segredos interpolados.
5. Construir a imagem com a configuração pública real e registrar tag/digest. Guardar a versão anterior. Nenhum seed em produção.
6. Iniciar somente o MySQL, aplicar migrações e então iniciar o app:

```bash
docker compose --env-file /srv/mindos/config/production.env -f compose.production.yaml build app
docker compose --env-file /srv/mindos/config/production.env -f compose.production.yaml up -d --wait mysql
docker compose --env-file /srv/mindos/config/production.env -f compose.production.yaml --profile tools run --rm migrate
docker compose --env-file /srv/mindos/config/production.env -f compose.production.yaml up -d --wait app
```

Em atualização de uma base existente, **parar o app e comprovar backup recuperável antes da migração**. `scripts/migrate.mjs` serializa execuções por lock, aplica somente o histórico Drizzle e não executa seed. Confirmar que não há outros migradores/escritores. Migrações MySQL DDL não são revertidas automaticamente: preservar o backup e registrar o ponto de recuperação.

7. Adaptar e validar `deployment/nginx.conf.example`, incluindo domínio/certificados reais e destino privado de erros. A origem percebida pelo app precisa ser o gateway esperado; ajustar `TRUST_PROXY_CIDRS` para o endereço exato observado se a rede diferir. Não usar confiança global em proxies.
8. Testar HTTPS, redirecionamento HTTP, cookie Secure/HttpOnly, login/logout Manus real, origem indevida e cabeçalhos falsificados por uma máquina externa. Confirmar que MySQL/app/health não são acessíveis publicamente. Readiness deve retornar 200 pelo host; o health não substitui uma sessão real.
9. Homologar papéis/clínicas, carga, acessibilidade, erros e operação móvel, configurar alertas e backup externo e realizar piloto antes de ampliar uso.

O servidor falha ao iniciar se configuração, metadados públicos do build, hashes das migrações ou diretório privado estiverem inválidos. Não há fallback automático para banco, segredo ou porta diferentes em produção. O shutdown espera até 60 segundos para concluir HTTP; Compose reserva 75 segundos. Testar esse comportamento com requisições reais na homologação.

## Reversão

Se houve somente troca de imagem e o schema continua compatível, parar o app e voltar à imagem anterior registrada. Validar readiness e fluxos antes da retomada. Não executar migrações antigas como suposta reversão.

Se a migração/dados forem incompatíveis, preservar o estado do incidente e recuperar backup em **banco e volume novos**, conforme o runbook de recuperação. Comparar os dados e homologar antes de trocar o tráfego. A perda de alterações posteriores depende do RPO observado e precisa ser comunicada; não inventar uma garantia de recuperação sem perda.

## Monitoramento e resposta

Preparados: health interno, logs mínimos de falha HTTP e identificador para correlacionar suporte. Pendentes: coletor privado, alertas externos, destinatário, retenção e ensaio de entrega. Definir verificações de disponibilidade, falha/idade de backup, capacidade de disco/memória, expiração TLS e estado do banco. Não enviar prontuários, documentos, cookies, tokens, URLs com parâmetros ou segredos ao monitoramento.

Em incidente: registrar horário/sintoma/identificador sem dados pessoais; restringir acesso e conter escritores; verificar health/infraestrutura; preservar evidências restritas; revogar sessões/credenciais afetadas com os responsáveis; avaliar recuperação isolada; homologar retomada; documentar causa e correção. Obrigações de comunicação e tratamento de dados devem ser definidas pelos responsáveis, sem inventar prazos legais.

Suporte, responsáveis/contatos, janela de manutenção, política de retenção e critérios do piloto precisam ser preenchidos antes do lançamento. Nenhum alerta foi enviado ou destinatário contratado automaticamente.

## Ensaio local da imagem (sem implantação)

Construir uma imagem com parâmetros públicos fictícios e testar exclusivamente contêineres temporários:

```bash
docker build --build-arg VITE_APP_ID=mindos-deployment-smoke --build-arg VITE_OAUTH_PORTAL_URL=https://login.mindos.test -t mindos:stage8-review .
node scripts/verify-deployment.mjs
```

O ensaio confirma que o usuário do app não consegue sobrescrever o código pertencente ao root, cria banco vazio isolado em memória, aplica as migrações duas vezes sem seed, confirma que o usuário do app pode executar DML e não pode criar tabelas, inicia a imagem sem root com raiz somente leitura e volume privado, verifica readiness, recusa HTTP fora do health, testa cabeçalhos do proxy local, exige autenticação, consulta a API protegida com sessão fictícia assinada e usuário DML e confirma shutdown sem erro. Confirma também que a chave de descriptografia de backup está ausente do ambiente do app. Remove apenas contêineres com nome/rótulo próprios e a pasta temporária. Não configura TLS externo e não chama o Manus real. Não aponta para o banco existente. A imagem de teste usa domínios `.test` e não deve ser implantada como imagem final.
