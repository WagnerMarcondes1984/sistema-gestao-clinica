# Etapa 8 — validação operacional e preparação para produção

Status: **em andamento; primeiro bloco técnico para revisão local**. A etapa 9 não foi iniciada. Hospedagem escolhida: servidor/VPS com Docker. Destino externo de backup: a definir. Não houve implantação em um servidor externo.

## Entregas deste bloco

- Inicialização distingue `APP_ENV=local` e `production`. Produção exige configuração explícita, segredos independentes, origem HTTPS, proxy restrito, banco próprio com usuário sem root e armazenamento privado. O identificador e o portal Manus de execução devem corresponder ao build.
- Sessão de login com validade configurável de 1 a 24 horas, padrão 8 horas. O navegador usa cookie HttpOnly/Secure em produção. `X-Forwarded-Proto` somente é aceito do proxy configurado no Express. A revisão local do bundle exige loopback e banco `mindos_dev`/`mindos_test`.
- Operações de escrita recusam origem cruzada e formulários simples. JSON geral limitado a 2 MiB; upload privado mantém seu limite próprio de 8 MiB. Limite temporário por IP, memória limitada, cabeçalhos de proteção, identificador novo por requisição e erros sem stack/SQL no cliente. O limite em memória atende a uma instância; replicação exige limite compartilhado e revisão de rede.
- Proxy legado `/manus-storage/*` desativado. Documentos atuais continuam no armazenamento privado, com autorização por clínica/paciente e criptografia. Links legados não devem ser usados como canal de documentos clínicos.
- `/health/live` verifica o processo; `/health/ready` verifica banco, hashes das migrações e acesso ao diretório privado. Não retorna credenciais ou detalhes do banco. Configuração do proxy bloqueia esses caminhos externamente. Readiness não comprova login real, entrega externa, desempenho ou homologação.
- Logs operacionais de falha HTTP contêm somente evento, categoria geral, identificador, status e duração. Sem corpo, query string, IP, nome de paciente ou erro SQL. Acesso e auditoria de negócio permanecem sujeitos às permissões existentes. Sem serviço externo de alertas contratado/configurado.
- Backup offline autenticado AES-256-GCM, contendo SQL, documentos privados, manifesto e chaves de integridade/documentos dentro do arquivo cifrado. A chave de backup é independente e fica fora dele e do contêiner do app. O app confere a evidência com chave pública Ed25519; a chave de descriptografia fica na rotina operacional. Sem exclusão ou rotação automática.
- Ensaio restaura exclusivamente em um novo MySQL descartável com usuário limitado ao banco novo. Confere hashes/contagens de todas as tabelas, arquivos, abertura dos documentos cifrados e histórico clínico autenticado; remove o destino e grava recibo local assinado. Registros legados sem selo continuam legados, sem certificação retroativa.
- Tela `/app/readiness`: gestores com `MANAGE_TEAM` consultam verificações reais e a evidência local de recuperação. Paciente e consulta sem essa permissão recebem recusa no servidor. Sem botões de restauração, exclusão ou exposição de chaves. Sem agregados de outros pacientes/clínicas. Evidência com mais de sete dias pede repetição; isso não define a política de backup da clínica.
- Dockerfile, Compose de produção, modelo de proxy, migração sem seed e runbooks separados. São preparação técnica, sem publicação automática.

## Revisão local

Executar os testes com a revisão fechada. O ensaio offline recusa o servidor ativo. Não executar o seed em um banco preenchido.

```bash
pnpm check
pnpm test
pnpm test:integration
pnpm build
pnpm test:recovery
pnpm test:browser
# Após construir a imagem de teste descrita no guia do VPS:
pnpm test:deployment
node scripts/open-review.mjs --ops
```

As suítes com contagens globais, as integrações, o ensaio offline e o navegador devem rodar em sequência. O navegador cria e remove somente fixtures fictícias; a revisão preserva sua clínica fictícia para análise. O login do produto continua Manus. Sessões temporárias assinadas dos scripts não criam outra rota de autenticação.

## Pendências para liberação

| Item | Situação |
|---|---|
| VPS, domínio, HTTPS e proxy no endereço real | Preparação local; implantação e teste externo pendentes |
| Login Manus no domínio final | Credenciais/redirects e homologação real pendentes |
| Destino externo, frequência, retenção e guarda separada da chave | A definir; nenhuma transferência externa foi feita |
| Restauração a partir de cópia externa e medição de RPO/RTO | Pendente; ensaio local não substitui esse aceite |
| Alertas de indisponibilidade, espaço, falha/idade de backup | Health/logs preparados; destinatário, integração e ensaio de alerta pendentes |
| Imagens, versões e vulnerabilidades na data da implantação | Revisar, fixar digest e analisar antes de liberar |
| Retenção, exportação, exclusão, privacidade e consentimentos | Decisão dos responsáveis; nenhum prazo legal inventado ou descarte automático |
| Pagamentos, fiscal, e-mail e WhatsApp | Provedores a definir; webhooks e entrega externos não homologados |
| Revisão de acessibilidade completa, carga, dispositivos e condições reais | Verificações técnicas locais parciais; complementar na homologação |
| Administrador, recepção, profissional, financeiro e paciente | Homologação humana e piloto controlado pendentes |

O bundle principal ainda gera aviso de tamanho no build. A divisão em módulos e a avaliação de desempenho no ambiente de homologação permanecem pendentes. Não se afirma ausência absoluta de falhas nem aprovação de produção com base apenas nas suítes locais.

Procedimentos: [VPS e implantação](VPS-DOCKER-E-INCIDENTES.md) e [backup e recuperação](BACKUP-E-RECUPERACAO.md). Evidências finais deste bloco são registradas em `EXECUCAO-DO-PLANO.md`.
