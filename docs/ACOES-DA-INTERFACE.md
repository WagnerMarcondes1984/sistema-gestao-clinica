# Inventário das ações da interface

Levantamento estático das páginas e componentes de operação em 17/10/2026, após as correções iniciais. Rotas e módulos estão descritos em `INVENTARIO-FUNCIONAL.md`. Componentes genéricos de UI e exemplos não definem a conclusão dos fluxos do produto.

Cada linha registra um manipulador de clique ou envio de formulário. “Parcial” exige homologação do fluxo; chamar o backend não comprova que uma integração externa está concluída. Handlers por nome precisam ser conferidos com a função correspondente. Este levantamento serve como fila de revisão, sem marcar ações como funcionais apenas pela existência do botão.

| Origem | Evento | Classificação | Ação encontrada |
|---|---|---|---|
| client/src/pages/AdminStudio.tsx:84 | onClick | Parcial — ação local | `() => setActive(item.id)` |
| client/src/pages/AdminStudio.tsx:89 | onClick | Parcial — ação local | `() => { setDraftStatus('PREVIEW'); notify('Preview preparado para validação.'); }` |
| client/src/pages/AdminStudio.tsx:89 | onClick | Parcial — chama backend | `() => { if (isAuthenticated && latestDraft) publishMutation.mutate({ versionId: latestDraft.id }); else { setDraftStatus('PUBLISHED'); notify('Modo de demonstra` |
| client/src/pages/AdminStudio.tsx:93 | onClick | Parcial — ação local | `() => setActive('site')` |
| client/src/pages/AdminStudio.tsx:95 | onClick | Parcial — revisar fluxo chamado | `saveCurrentDraft` |
| client/src/pages/AdminStudio.tsx:97 | onClick | Parcial — ação local | `() => { setSiteBlocks([...siteBlocks, 'Bloco ${siteBlocks.length + 1}']); notify('Novo bloco adicionado ao draft.'); }` |
| client/src/pages/AdminStudio.tsx:97 | onClick | Demonstrativo — apenas mensagem | `() => notify('Editando bloco ${block}.')` |
| client/src/pages/AdminStudio.tsx:104 | onClick | Demonstrativo — apenas mensagem | `() => notify('${label} aberto para edição.')` |
| client/src/pages/AdminStudio.tsx:106 | onClick | Demonstrativo — apenas mensagem | `() => notify('Configuração salva como draft.')` |
| client/src/pages/Agenda.tsx:35 | onClick | Demonstrativo — apenas mensagem | `() => toast.success('Fluxo de novo agendamento aberto.')` |
| client/src/pages/Agenda.tsx:36 | onClick | Parcial — ação local | `() => setView(item)` |
| client/src/pages/Agenda.tsx:37 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Ações disponíveis conforme sua permissão.')` |
| client/src/pages/Agenda.tsx:37 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Assistente de série recorrente aberto.')` |
| client/src/pages/CashManagement.tsx:92 | onClick | Parcial — ação local | `() => setShowCloseModal(true)` |
| client/src/pages/CashManagement.tsx:251 | onSubmit | Parcial — revisar fluxo chamado | `handleCloseSession` |
| client/src/pages/CashManagement.tsx:305 | onClick | Parcial — ação local | `() => setShowCloseModal(false)` |
| client/src/pages/Checkout.tsx:422 | onClick | Parcial — revisar fluxo chamado | `() => handleUpdateItemQuantity(idx, item.quantity - 1)` |
| client/src/pages/Checkout.tsx:432 | onClick | Parcial — revisar fluxo chamado | `() => handleUpdateItemQuantity(idx, item.quantity + 1)` |
| client/src/pages/Checkout.tsx:445 | onClick | Parcial — revisar fluxo chamado | `() => handleRemoveItem(idx)` |
| client/src/pages/Checkout.tsx:467 | onClick | Parcial — revisar fluxo chamado | `() => handleAddItemFromCatalog(catItem)` |
| client/src/pages/Checkout.tsx:502 | onClick | Parcial — ação local | `() => setPaymentMethod(m.id as PaymentMethod)` |
| client/src/pages/Checkout.tsx:544 | onClick | Parcial — ação local | `() => setInstallments(parc)` |
| client/src/pages/Checkout.tsx:669 | onClick | Parcial — revisar fluxo chamado | `handleProceedToPayment` |
| client/src/pages/Checkout.tsx:780 | onClick | Demonstrativo — apenas mensagem | `() => { navigator.clipboard.writeText(createdTx.pixCopiaECola \|\| ''); toast.success('Código Pix copiado para a área de transferência!'); }` |
| client/src/pages/Checkout.tsx:805 | onClick | Parcial — revisar fluxo chamado | `handleSimulatePaymentApproval` |
| client/src/pages/Checkout.tsx:844 | onClick | Parcial — revisar fluxo chamado | `handleSimulatePaymentApproval` |
| client/src/pages/Checkout.tsx:877 | onClick | Parcial — revisar fluxo chamado | `handleSimulatePaymentApproval` |
| client/src/pages/Checkout.tsx:894 | onClick | Parcial — ação local | `() => setStep(1)` |
| client/src/pages/Checkout.tsx:954 | onClick | Parcial — ação local | `() => setShowReceipt(true)` |
| client/src/pages/Checkout.tsx:963 | onClick | Parcial — ação local | `() => setShowInvoice(true)` |
| client/src/pages/Checkout.tsx:975 | onClick | Parcial — revisar fluxo chamado | `handleResetCheckout` |
| client/src/pages/ClinicalRecord.tsx:24 | onClick | Parcial — ação local | `() => setRecordType(value as typeof recordType)` |
| client/src/pages/ClinicalRecord.tsx:24 | onClick | Parcial — revisar fluxo chamado | `submit` |
| client/src/pages/ComponentShowcase.tsx:236 | onClick | Parcial — revisar fluxo chamado | `toggleTheme` |
| client/src/pages/ComponentShowcase.tsx:714 | onClick | Parcial — ação local | `() => setProgress(Math.max(0, progress - 10))` |
| client/src/pages/ComponentShowcase.tsx:720 | onClick | Parcial — ação local | `() => setProgress(Math.min(100, progress + 10))` |
| client/src/pages/ComponentShowcase.tsx:743 | onClick | Parcial — revisar fluxo chamado | `e => { e.preventDefault(); setCurrentPage(Math.max(1, currentPage - 1)); }` |
| client/src/pages/ComponentShowcase.tsx:754 | onClick | Parcial — revisar fluxo chamado | `e => { e.preventDefault(); setCurrentPage(page); }` |
| client/src/pages/ComponentShowcase.tsx:766 | onClick | Parcial — revisar fluxo chamado | `e => { e.preventDefault(); setCurrentPage(Math.min(5, currentPage + 1)); }` |
| client/src/pages/ComponentShowcase.tsx:1050 | onClick | Parcial — ação local | `() => setDialogOpen(false)` |
| client/src/pages/ComponentShowcase.tsx:1054 | onClick | Parcial — revisar fluxo chamado | `handleDialogSubmit` |
| client/src/pages/ComponentShowcase.tsx:1323 | onClick | Parcial — revisar fluxo chamado | `() => { sonnerToast.success("Operation successful", { description: "Your changes have been saved", }); }` |
| client/src/pages/ComponentShowcase.tsx:1333 | onClick | Parcial — revisar fluxo chamado | `() => { sonnerToast.error("Operation failed", { description: "Cannot complete operation, please try again", }); }` |
| client/src/pages/ComponentShowcase.tsx:1344 | onClick | Parcial — revisar fluxo chamado | `() => { sonnerToast.info("Information", { description: "This is an information message", }); }` |
| client/src/pages/ComponentShowcase.tsx:1354 | onClick | Parcial — revisar fluxo chamado | `() => { sonnerToast.warning("Warning", { description: "Please note the impact of this operation", }); }` |
| client/src/pages/ComponentShowcase.tsx:1365 | onClick | Parcial — revisar fluxo chamado | `() => { sonnerToast.loading("Loading", { description: "Please wait", }); }` |
| client/src/pages/ComponentShowcase.tsx:1375 | onClick | Parcial — ação local | `() => { const promise = new Promise(resolve => setTimeout(resolve, 2000) ); sonnerToast.promise(promise, { loading: "Processing...", success: "Processing comple` |
| client/src/pages/Dashboard.tsx:214 | onClick | Parcial — ação local | `() => setPeriod('today')` |
| client/src/pages/Dashboard.tsx:224 | onClick | Parcial — ação local | `() => setPeriod('month')` |
| client/src/pages/Dashboard.tsx:234 | onClick | Parcial — ação local | `() => setPeriod('year')` |
| client/src/pages/Dashboard.tsx:662 | onClick | Parcial — ação local | `() => setSelectedReceiptTx(tx)` |
| client/src/pages/Dashboard.tsx:670 | onClick | Parcial — ação local | `() => setSelectedInvoiceTx(tx)` |
| client/src/pages/Dashboard.tsx:678 | onClick | Parcial — ação local | `() => setRefundTargetTx(tx)` |
| client/src/pages/Dashboard.tsx:691 | onClick | Parcial — revisar fluxo chamado | `() => handleSimulateWebhook(tx.code)` |
| client/src/pages/Dashboard.tsx:727 | onSubmit | Parcial — revisar fluxo chamado | `handleRefundSubmit` |
| client/src/pages/Dashboard.tsx:752 | onClick | Parcial — ação local | `() => setRefundTargetTx(null)` |
| client/src/pages/MindOSDashboard.tsx:121 | onClick | Parcial — ação local | `() => setView('today')` |
| client/src/pages/MindOSDashboard.tsx:122 | onClick | Parcial — ação local | `() => setView('week')` |
| client/src/pages/MindOSDashboard.tsx:132 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Ações operacionais disponíveis conforme sua permissão.')` |
| client/src/pages/MindOSDashboard.tsx:141 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('${action.label}: fluxo de ação aberto.')` |
| client/src/pages/NotFound.tsx:41 | onClick | Parcial — revisar fluxo chamado | `handleGoHome` |
| client/src/pages/OnlineBooking.tsx:14 | onSubmit | Parcial — chama backend | `(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); bookingMutation.mutate({ name: String(form.get('name') \|\| ''), contactChann` |
| client/src/pages/Patient360.tsx:44 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Nova sessão disponível conforme permissão clínica.')` |
| client/src/pages/Patient360.tsx:44 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Mensagem administrativa preparada em linguagem discreta.')` |
| client/src/pages/Patient360.tsx:48 | onClick | Parcial — ação local | `() => setActiveTab(tab.id)` |
| client/src/pages/Patient360.tsx:48 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Acesso registrado na trilha de auditoria.')` |
| client/src/pages/PatientPortal.tsx:51 | onClick | Parcial — revisar fluxo chamado | `() => void logout()` |
| client/src/pages/PatientPortal.tsx:75 | onClick | Parcial — revisar fluxo chamado | `startLogin` |
| client/src/pages/PatientPortal.tsx:93 | onClick | Parcial — revisar fluxo chamado | `() => void portalQuery.refetch()` |
| client/src/pages/PatientPortal.tsx:109 | onClick | Parcial — ação local | `() => setTab(id)` |
| client/src/pages/Payables.tsx:93 | onClick | Parcial — ação local | `() => setStatusFilter('ALL')` |
| client/src/pages/Payables.tsx:103 | onClick | Parcial — ação local | `() => setStatusFilter('PENDING')` |
| client/src/pages/Payables.tsx:113 | onClick | Parcial — ação local | `() => setStatusFilter('PAID')` |
| client/src/pages/Payables.tsx:182 | onClick | Parcial — chama backend | `() => payMutation.mutate({ code: p.code })` |
| client/src/pages/Receivables.tsx:120 | onClick | Parcial — ação local | `() => setFilter('ALL')` |
| client/src/pages/Receivables.tsx:130 | onClick | Parcial — ação local | `() => setFilter('PENDING')` |
| client/src/pages/Receivables.tsx:140 | onClick | Parcial — ação local | `() => setFilter('OVERDUE')` |
| client/src/pages/Receivables.tsx:211 | onClick | Demonstrativo — apenas mensagem | `() => { navigator.clipboard.writeText( 'Olá ${tx.patientName}, segue seu link para liquidação da consulta na ${currentVertical.name}: https://fluxa.med.br/pay/$` |
| client/src/pages/Receivables.tsx:225 | onClick | Parcial — chama backend | `() => confirmMutation.mutate({ code: tx.code })` |
| client/src/pages/Reception.tsx:22 | onClick | Demonstrativo — apenas mensagem | `() => toast.success('Novo cadastro administrativo iniciado.')` |
| client/src/pages/Reception.tsx:22 | onClick | Parcial — revisar fluxo chamado | `() => registerEvent(item.id, 'MESSAGE_SENT')` |
| client/src/pages/Reception.tsx:22 | onClick | Parcial — revisar fluxo chamado | `() => registerEvent(item.id, 'CHECK_IN')` |
| client/src/pages/Reception.tsx:22 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Busca administrativa aberta.')` |
| client/src/pages/Reception.tsx:22 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Contato telefônico aberto.')` |
| client/src/pages/Reception.tsx:22 | onClick | Demonstrativo — apenas mensagem | `() => toast.info('Pendências de confirmação abertas.')` |
| client/src/pages/Transactions.tsx:303 | onClick | Parcial — ação local | `() => setSelectedInvoiceTx(tx)` |
| client/src/pages/Transactions.tsx:319 | onClick | Parcial — ação local | `() => setSelectedReceiptTx(tx)` |
| client/src/pages/Transactions.tsx:327 | onClick | Parcial — ação local | `() => setSelectedInvoiceTx(tx)` |
| client/src/pages/Transactions.tsx:335 | onClick | Parcial — ação local | `() => setRefundTargetTx(tx)` |
| client/src/pages/Transactions.tsx:347 | onClick | Parcial — chama backend | `() => webhookMutation.mutate({ code: tx.code })` |
| client/src/pages/Transactions.tsx:401 | onClick | Parcial — ação local | `() => setRefundTargetTx(null)` |
| client/src/pages/Transactions.tsx:409 | onClick | Parcial — chama backend | `() => { if (!refundReason.trim()) { toast.error('Informe a justificativa do estorno.'); return; } refundMutation.mutate({ code: refundTargetTx.code, reason: ref` |
| client/src/components/FinancialLayout.tsx:107 | onClick | Parcial — ação local | `() => setVerticalMenuOpen(!verticalMenuOpen)` |
| client/src/components/FinancialLayout.tsx:122 | onClick | Parcial — ação local | `() => setVerticalMenuOpen(false)` |
| client/src/components/FinancialLayout.tsx:136 | onClick | Parcial — ação local | `() => { setVerticalCode(preset.code); setVerticalMenuOpen(false); }` |
| client/src/components/FinancialLayout.tsx:191 | onClick | Parcial — revisar fluxo chamado | `toggleTheme` |
| client/src/components/ReceiptModal.tsx:63 | onClick | Parcial — revisar fluxo chamado | `handlePrint` |
| client/src/components/ReceiptModal.tsx:70 | onClick | Parcial — revisar fluxo chamado | `onClose` |
| client/src/components/ReceiptModal.tsx:190 | onClick | Parcial — revisar fluxo chamado | `handleCopyCode` |
| client/src/components/ReceiptModal.tsx:202 | onClick | Parcial — revisar fluxo chamado | `onClose` |
| client/src/components/ReceiptModal.tsx:208 | onClick | Parcial — revisar fluxo chamado | `handlePrint` |
| client/src/components/InvoiceModal.tsx:64 | onClick | Parcial — revisar fluxo chamado | `() => window.print()` |
| client/src/components/InvoiceModal.tsx:70 | onClick | Parcial — revisar fluxo chamado | `onClose` |
| client/src/components/InvoiceModal.tsx:195 | onClick | Parcial — revisar fluxo chamado | `onClose` |
| client/src/components/InvoiceModal.tsx:201 | onClick | Demonstrativo — apenas mensagem | `() => { navigator.clipboard.writeText(invoiceKey); toast.success('Chave de acesso da NFS-e copiada com sucesso!'); }` |
