# Atualização do sistema — 05/11/2026

Consolidação da etapa 9 e das correções validadas na revisão acompanhada. Base histórica: `codex/etapa-8-preparacao-operacional`, commit `06e227f0535c6b677a278b3c2faa91c366b061dd`. Publicação em branch própria para revisão; sem merge automático em `main`.

## Entrega

- CRM comercial: oportunidades, propostas versionadas, apresentação e decisão administrativas, perda/reabertura, metas, relatórios e retornos internos, com permissões próprias.
- Segurança: política de sessão, autorização das rotas antigas e reforços de isolamento, autoria e referências entre registros.
- Pacientes: prevenção de duplicidade considerando variações de hífen e travessão, com regressão técnica e reteste humano.
- Uso: busca comercial preserva campo/foco durante consultas; links da recepção abrem a Agenda na data efetiva da sessão, validada no fuso da clínica.
- Roteiro de homologação com 35 casos, modelos sem preenchimento, versão HTML e PDF. Resultados detalhados e evidências de sessões permanecem privados.

## Revisão acompanhada

Resultados consolidados localmente em 30/10/2026: 25 casos conferidos nos cenários acompanhados, 8 com ressalvas e 2 parciais. Esses grupos não equivalem a aprovação irrestrita do sistema. Entre os complementos confirmados estão permissões de recepção/financeiro, edição e restauração de contato, agendamento/conflito/reagendamento/check-in, dinheiro com troco, diferença de caixa justificada e repetição exata de recebimento sem duplicação.

Recuperação local de 30/10/2026: PASS, 47 tabelas, 1.291 registros, 2 documentos e 9 versões clínicas; restauração em destino temporário separado e removido ao término. Sem construção ou download de imagem Docker. O recibo autenticado é privado; esse resultado não comprova recuperação externa ou implantação.

## Limites da publicação

- `.env`, credenciais, banco, documentos privados, backups, recibos, sessões, dependências e build não integram o commit.
- As cinco capturas novas das etapas 6/7 permanecem locais; a autorização anterior cobria somente as sete capturas das etapas 4/5 já publicadas, que foram preservadas.
- `server/seed-db.mjs` conserva o blob remoto anterior. Sua atualização de segurança está integralmente em `patches/seed-finance-guard.patch`, agora incluindo as tabelas comerciais; a aplicação do patch foi validada sem executar o seed. Aplicar conforme o guia local antes de usar o seed.
- `README.md` e demais arquivos remotos sem substituto local foram preservados. A árvore desta consolidação está em `ARVORE-ATUALIZACAO-2026-11-05.md`.
- Celular real, ressalvas de cobertura por perfil, hospedagem, Manus real, cópia externa, decisões do piloto e provedores continuam pendentes. Montagem Docker da aplicação segue adiada.

## Validação antes do envio

- TypeScript aprovado.
- 197 testes unitários aprovados; um caso já previsto permanece ignorado.
- 59 testes de integração aprovados: comercial, segurança, pacientes e agenda, com fixtures isoladas e limpeza ao término.
- Builds cliente e servidor aprovados. Permanece aviso conhecido de bundle principal de aproximadamente 1,19 MB.
- Varredura dos arquivos selecionados sem correspondência com segredos configurados; patch do seed aplicado em cópia temporária reproduz exatamente a versão local sem executar cadastros.
- Primeiras execuções interrompidas por bloqueio de porta no sandbox e MySQL desligado; verificações repetidas com acesso local e banco existente, sem alterar regras para fazer os testes passarem.
- Comparação com histórico remoto, arquivos exclusivos do remoto preservados e verificação de espaços em branco compatível com o CSV CRLF.
