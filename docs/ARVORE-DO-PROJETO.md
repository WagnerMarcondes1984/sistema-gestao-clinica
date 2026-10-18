# Árvore do projeto

Mapa dos 255 arquivos publicados nesta consolidação até o financeiro interno da etapa 5. Dependências, build, segredos e documentos privados ficam fora do GitHub. O seed remoto é preservado; seu reforço local consta no patch documentado em [ATUALIZACAO-GERAL.md](ATUALIZACAO-GERAL.md).

```text
sistema-gestao-clinica/
├── client/
│   ├── public/
│   │   ├── __manus__/
│   │   │   └── debug-collector.js
│   │   └── .gitkeep
│   ├── src/
│   │   ├── _core/
│   │   │   └── hooks/
│   │   │       └── useAuth.ts
│   │   ├── components/
│   │   │   ├── patients/
│   │   │   │   └── PatientSelector.tsx
│   │   │   ├── team/
│   │   │   │   └── AccessFields.tsx
│   │   │   ├── ui/
│   │   │   │   ├── accordion.tsx
│   │   │   │   ├── alert-dialog.tsx
│   │   │   │   ├── alert.tsx
│   │   │   │   ├── aspect-ratio.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── breadcrumb.tsx
│   │   │   │   ├── button-group.tsx
│   │   │   │   ├── button.tsx
│   │   │   │   ├── calendar.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── carousel.tsx
│   │   │   │   ├── chart.tsx
│   │   │   │   ├── checkbox.tsx
│   │   │   │   ├── collapsible.tsx
│   │   │   │   ├── command.tsx
│   │   │   │   ├── context-menu.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── drawer.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── empty.tsx
│   │   │   │   ├── field.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── hover-card.tsx
│   │   │   │   ├── input-group.tsx
│   │   │   │   ├── input-otp.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── item.tsx
│   │   │   │   ├── kbd.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   ├── menubar.tsx
│   │   │   │   ├── navigation-menu.tsx
│   │   │   │   ├── pagination.tsx
│   │   │   │   ├── popover.tsx
│   │   │   │   ├── progress.tsx
│   │   │   │   ├── radio-group.tsx
│   │   │   │   ├── resizable.tsx
│   │   │   │   ├── scroll-area.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── slider.tsx
│   │   │   │   ├── sonner.tsx
│   │   │   │   ├── spinner.tsx
│   │   │   │   ├── switch.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   ├── toggle-group.tsx
│   │   │   │   ├── toggle.tsx
│   │   │   │   └── tooltip.tsx
│   │   │   ├── AIChatBox.tsx
│   │   │   ├── AppointmentForm.tsx
│   │   │   ├── DashboardLayout.tsx
│   │   │   ├── DashboardLayoutSkeleton.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── FinancialLayout.tsx
│   │   │   ├── InvoiceModal.tsx
│   │   │   ├── ManusDialog.tsx
│   │   │   ├── Map.tsx
│   │   │   ├── PortalRescheduleInbox.tsx
│   │   │   └── ReceiptModal.tsx
│   │   ├── contexts/
│   │   │   ├── ThemeContext.tsx
│   │   │   └── VerticalContext.tsx
│   │   ├── hooks/
│   │   │   ├── useComposition.ts
│   │   │   ├── useMobile.tsx
│   │   │   └── usePersistFn.ts
│   │   ├── lib/
│   │   │   ├── trpc.ts
│   │   │   └── utils.ts
│   │   ├── pages/
│   │   │   ├── AcceptInvite.tsx
│   │   │   ├── AdminStudio.tsx
│   │   │   ├── Agenda.tsx
│   │   │   ├── AuditFiscal.tsx
│   │   │   ├── CashManagement.tsx
│   │   │   ├── Checkout.tsx
│   │   │   ├── ClinicalRecord.tsx
│   │   │   ├── ComponentShowcase.tsx
│   │   │   ├── ConsentTemplates.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── FinancialWorkspace.tsx
│   │   │   ├── Home.tsx
│   │   │   ├── MindOSDashboard.tsx
│   │   │   ├── NotFound.tsx
│   │   │   ├── OnlineBooking.tsx
│   │   │   ├── Patient360.tsx
│   │   │   ├── PatientCare.tsx
│   │   │   ├── PatientPortal.tsx
│   │   │   ├── Patients.tsx
│   │   │   ├── Payables.tsx
│   │   │   ├── Receivables.tsx
│   │   │   ├── Reception.tsx
│   │   │   ├── SchedulingSettings.tsx
│   │   │   ├── Team.tsx
│   │   │   └── Transactions.tsx
│   │   ├── types/
│   │   │   └── finance.ts
│   │   ├── App.tsx
│   │   ├── const.ts
│   │   ├── index.css
│   │   └── main.tsx
│   └── index.html
├── docs/
│   ├── previews/
│   │   ├── agenda-etapa3.png
│   │   ├── configuracao-agenda.png
│   │   ├── documentos-etapa4.png
│   │   ├── equipe-desktop.png
│   │   ├── equipe-mobile.png
│   │   ├── financeiro-etapa5-mobile.png
│   │   ├── financeiro-etapa5.png
│   │   ├── pacientes-desktop.png
│   │   ├── pacientes-mobile.png
│   │   ├── portal-consentimentos-etapa4.png
│   │   ├── portal-etapa4-mobile.png
│   │   ├── prontuario-etapa4.png
│   │   ├── README.md
│   │   ├── reagendamento-portal-etapa4.png
│   │   ├── recepcao-etapa3-mobile.png
│   │   └── recepcao-etapa3.png
│   ├── ACOES-DA-INTERFACE.md
│   ├── ARVORE-DO-PROJETO.md
│   ├── ATUALIZACAO-GERAL.md
│   ├── DESENVOLVIMENTO-LOCAL.md
│   ├── EQUIPE-E-CONVITES.md
│   ├── ETAPA-3-OPERACAO.md
│   ├── ETAPA-3-PACIENTES.md
│   ├── ETAPA-4-PRONTUARIO-E-PORTAL.md
│   ├── ETAPA-5-FINANCEIRO-INTERNO.md
│   ├── EXECUCAO-DO-PLANO.md
│   ├── INVENTARIO-FUNCIONAL.md
│   ├── MANIFESTO-DO-CHECKPOINT.json
│   └── PERMISSOES.md
├── drizzle/
│   ├── meta/
│   │   ├── 0001_snapshot.json
│   │   ├── 0002_snapshot.json
│   │   ├── 0003_snapshot.json
│   │   ├── 0004_snapshot.json
│   │   ├── 0005_snapshot.json
│   │   ├── 0006_snapshot.json
│   │   ├── 0007_snapshot.json
│   │   ├── 0008_snapshot.json
│   │   ├── 0009_snapshot.json
│   │   ├── 0010_snapshot.json
│   │   ├── 0011_snapshot.json
│   │   ├── 0012_snapshot.json
│   │   ├── 0013_snapshot.json
│   │   └── _journal.json
│   ├── migrations/
│   │   └── .gitkeep
│   ├── 0000_quiet_peter_parker.sql
│   ├── 0001_quick_luckman.sql
│   ├── 0002_tranquil_molten_man.sql
│   ├── 0003_unusual_layla_miller.sql
│   ├── 0004_sour_harry_osborn.sql
│   ├── 0005_colossal_susan_delgado.sql
│   ├── 0006_sleepy_saracen.sql
│   ├── 0007_nervous_yellowjacket.sql
│   ├── 0008_lumpy_night_thrasher.sql
│   ├── 0009_volatile_dormammu.sql
│   ├── 0010_aromatic_warhawk.sql
│   ├── 0011_goofy_maria_hill.sql
│   ├── 0012_sloppy_solo.sql
│   ├── 0013_marvelous_ronan.sql
│   ├── relations.ts
│   └── schema.ts
├── patches/
│   ├── seed-finance-guard.patch
│   └── wouter@3.7.1.patch
├── scripts/
│   ├── inventory-actions.mjs
│   ├── open-review.mjs
│   ├── verify-browser.mjs
│   ├── verify-db.ts
│   └── verify-demo.ts
├── server/
│   ├── _core/
│   │   ├── types/
│   │   │   ├── cookie.d.ts
│   │   │   └── manusTypes.ts
│   │   ├── context.ts
│   │   ├── cookies.ts
│   │   ├── dataApi.ts
│   │   ├── env.ts
│   │   ├── heartbeat.ts
│   │   ├── imageGeneration.ts
│   │   ├── index.ts
│   │   ├── llm.ts
│   │   ├── map.ts
│   │   ├── notification.ts
│   │   ├── oauth.ts
│   │   ├── sdk.ts
│   │   ├── storageProxy.ts
│   │   ├── systemRouter.ts
│   │   ├── trpc.ts
│   │   ├── vite.ts
│   │   └── voiceTranscription.ts
│   ├── auth.logout.test.ts
│   ├── auth.session.test.ts
│   ├── care-access.ts
│   ├── care-router.ts
│   ├── care.integration.test.ts
│   ├── care.test.ts
│   ├── clinical.ts
│   ├── db.ts
│   ├── finance.integration.test.ts
│   ├── finance.ts
│   ├── financial-access.test.ts
│   ├── financial.test.ts
│   ├── migrations.test.ts
│   ├── mindos.test.ts
│   ├── oauth.invite.test.ts
│   ├── patients-router.ts
│   ├── patients.integration.test.ts
│   ├── patients.test.ts
│   ├── patients.ts
│   ├── permissions.test.ts
│   ├── portal-care.ts
│   ├── private-documents.ts
│   ├── routers.ts
│   ├── scheduling-router.ts
│   ├── scheduling.integration.test.ts
│   ├── scheduling.test.ts
│   ├── scheduling.ts
│   ├── security.integration.test.ts
│   ├── seed-db.mjs
│   ├── seed-safety.mjs
│   ├── seed-safety.test.ts
│   ├── storage.ts
│   ├── team-router.ts
│   ├── team.integration.test.ts
│   ├── team.test.ts
│   └── team.ts
├── shared/
│   ├── _core/
│   │   └── errors.ts
│   ├── const.ts
│   ├── finance.ts
│   ├── patients.ts
│   ├── permissions.ts
│   ├── scheduling.ts
│   └── types.ts
├── .env.example
├── .gitignore
├── .gitkeep
├── .prettierignore
├── .prettierrc
├── components.json
├── compose.dev.yaml
├── drizzle.config.ts
├── GUIA-VS-CODE-CLINICA.md
├── package.json
├── PLANO-DE-CONCLUSAO-MINDOS.md
├── pnpm-lock.yaml
├── README.md
├── template.json
├── todo.md
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── vitest.integration.config.ts
```
