# Inventário das ações da interface

Levantamento estático atualizado após o primeiro bloco da etapa 3. Gere novamente com `node scripts/inventory-actions.mjs`. Rotas em `INVENTARIO-FUNCIONAL.md`; evidências efetivas em `EXECUCAO-DO-PLANO.md`.

Cada linha registra um clique ou envio de formulário fora dos componentes genéricos de UI. A classificação é conservadora e não substitui homologação. Total: **128 handlers**.

| Local | Evento | Situação estática | Handler (até 240 caracteres) |
|---|---|---|---|
| client/src/pages/AcceptInvite.tsx:99 | onClick | Revisar fluxo chamado | `startLogin` |
| client/src/pages/AcceptInvite.tsx:114 | onClick | Revisar fluxo chamado | `() => verify({ token })` |
| client/src/pages/AcceptInvite.tsx:119 | onClick | Revisar fluxo chamado | `() => void logout()` |
| client/src/pages/AcceptInvite.tsx:170 | onClick | Chama persistência — conferir evidência do módulo | `() => accept.mutate({ token })` |
| client/src/pages/AdminStudio.tsx:84 | onClick | Ação local — conferir fluxo completo | `() => setActive(item.id)` |
| client/src/pages/AdminStudio.tsx:89 | onClick | Mensagem — conferir se há operação efetiva | `() => { setDraftStatus('PREVIEW'); notify('Preview preparado para validação.'); }` |
| client/src/pages/AdminStudio.tsx:89 | onClick | Chama persistência — conferir evidência do módulo | `() => { if (isAuthenticated && latestDraft) publishMutation.mutate({ versionId: latestDraft.id }); else { setDraftStatus('PUBLISHED'); notify('Modo de demonstração: publicação preparada.'); } }` |
| client/src/pages/AdminStudio.tsx:93 | onClick | Ação local — conferir fluxo completo | `() => setActive('site')` |
| client/src/pages/AdminStudio.tsx:95 | onClick | Revisar fluxo chamado | `saveCurrentDraft` |
| client/src/pages/AdminStudio.tsx:97 | onClick | Mensagem — conferir se há operação efetiva | `() => { setSiteBlocks([...siteBlocks, 'Bloco ${siteBlocks.length + 1}']); notify('Novo bloco adicionado ao draft.'); }` |
| client/src/pages/AdminStudio.tsx:97 | onClick | Mensagem — conferir se há operação efetiva | `() => notify('Editando bloco ${block}.')` |
| client/src/pages/AdminStudio.tsx:104 | onClick | Mensagem — conferir se há operação efetiva | `() => notify('${label} aberto para edição.')` |
| client/src/pages/AdminStudio.tsx:106 | onClick | Mensagem — conferir se há operação efetiva | `() => notify('Configuração salva como draft.')` |
| client/src/pages/Agenda.tsx:67 | onClick | Ação local — conferir fluxo completo | `() => { setDay(""); selectPatient(0); }` |
| client/src/pages/CashManagement.tsx:92 | onClick | Ação local — conferir fluxo completo | `() => setShowCloseModal(true)` |
| client/src/pages/CashManagement.tsx:251 | onSubmit | Revisar fluxo chamado | `handleCloseSession` |
| client/src/pages/CashManagement.tsx:305 | onClick | Ação local — conferir fluxo completo | `() => setShowCloseModal(false)` |
| client/src/pages/Checkout.tsx:422 | onClick | Revisar fluxo chamado | `() => handleUpdateItemQuantity(idx, item.quantity - 1)` |
| client/src/pages/Checkout.tsx:432 | onClick | Revisar fluxo chamado | `() => handleUpdateItemQuantity(idx, item.quantity + 1)` |
| client/src/pages/Checkout.tsx:445 | onClick | Revisar fluxo chamado | `() => handleRemoveItem(idx)` |
| client/src/pages/Checkout.tsx:467 | onClick | Revisar fluxo chamado | `() => handleAddItemFromCatalog(catItem)` |
| client/src/pages/Checkout.tsx:502 | onClick | Ação local — conferir fluxo completo | `() => setPaymentMethod(m.id as PaymentMethod)` |
| client/src/pages/Checkout.tsx:544 | onClick | Ação local — conferir fluxo completo | `() => setInstallments(parc)` |
| client/src/pages/Checkout.tsx:669 | onClick | Revisar fluxo chamado | `handleProceedToPayment` |
| client/src/pages/Checkout.tsx:780 | onClick | Revisar fluxo chamado | `() => { navigator.clipboard.writeText(createdTx.pixCopiaECola &#124;&#124; ''); toast.success('Código Pix copiado para a área de transferência!'); }` |
| client/src/pages/Checkout.tsx:805 | onClick | Revisar fluxo chamado | `handleSimulatePaymentApproval` |
| client/src/pages/Checkout.tsx:844 | onClick | Revisar fluxo chamado | `handleSimulatePaymentApproval` |
| client/src/pages/Checkout.tsx:877 | onClick | Revisar fluxo chamado | `handleSimulatePaymentApproval` |
| client/src/pages/Checkout.tsx:894 | onClick | Ação local — conferir fluxo completo | `() => setStep(1)` |
| client/src/pages/Checkout.tsx:954 | onClick | Ação local — conferir fluxo completo | `() => setShowReceipt(true)` |
| client/src/pages/Checkout.tsx:963 | onClick | Ação local — conferir fluxo completo | `() => setShowInvoice(true)` |
| client/src/pages/Checkout.tsx:975 | onClick | Revisar fluxo chamado | `handleResetCheckout` |
| client/src/pages/ClinicalRecord.tsx:64 | onSubmit | Chama persistência — conferir evidência do módulo | `e => { e.preventDefault(); if (!content.trim()) { setValidation("Escreva o conteúdo antes de salvar."); return; } create.mutate({ patientId, recordType, content: content.trim() }); }` |
| client/src/pages/ClinicalRecord.tsx:181 | onClick | Ação local — conferir fluxo completo | `() => { selectPatient(pendingPatient); setPendingPatient(null); setDirty(false); }` |
| client/src/pages/ClinicalRecord.tsx:191 | onClick | Ação local — conferir fluxo completo | `() => setPendingPatient(null)` |
| client/src/pages/ComponentShowcase.tsx:236 | onClick | Revisar fluxo chamado | `toggleTheme` |
| client/src/pages/ComponentShowcase.tsx:714 | onClick | Ação local — conferir fluxo completo | `() => setProgress(Math.max(0, progress - 10))` |
| client/src/pages/ComponentShowcase.tsx:720 | onClick | Ação local — conferir fluxo completo | `() => setProgress(Math.min(100, progress + 10))` |
| client/src/pages/ComponentShowcase.tsx:743 | onClick | Ação local — conferir fluxo completo | `e => { e.preventDefault(); setCurrentPage(Math.max(1, currentPage - 1)); }` |
| client/src/pages/ComponentShowcase.tsx:754 | onClick | Ação local — conferir fluxo completo | `e => { e.preventDefault(); setCurrentPage(page); }` |
| client/src/pages/ComponentShowcase.tsx:766 | onClick | Ação local — conferir fluxo completo | `e => { e.preventDefault(); setCurrentPage(Math.min(5, currentPage + 1)); }` |
| client/src/pages/ComponentShowcase.tsx:1050 | onClick | Ação local — conferir fluxo completo | `() => setDialogOpen(false)` |
| client/src/pages/ComponentShowcase.tsx:1054 | onClick | Revisar fluxo chamado | `handleDialogSubmit` |
| client/src/pages/ComponentShowcase.tsx:1323 | onClick | Revisar fluxo chamado | `() => { sonnerToast.success("Operation successful", { description: "Your changes have been saved", }); }` |
| client/src/pages/ComponentShowcase.tsx:1333 | onClick | Revisar fluxo chamado | `() => { sonnerToast.error("Operation failed", { description: "Cannot complete operation, please try again", }); }` |
| client/src/pages/ComponentShowcase.tsx:1344 | onClick | Revisar fluxo chamado | `() => { sonnerToast.info("Information", { description: "This is an information message", }); }` |
| client/src/pages/ComponentShowcase.tsx:1354 | onClick | Revisar fluxo chamado | `() => { sonnerToast.warning("Warning", { description: "Please note the impact of this operation", }); }` |
| client/src/pages/ComponentShowcase.tsx:1365 | onClick | Revisar fluxo chamado | `() => { sonnerToast.loading("Loading", { description: "Please wait", }); }` |
| client/src/pages/ComponentShowcase.tsx:1375 | onClick | Ação local — conferir fluxo completo | `() => { const promise = new Promise(resolve => setTimeout(resolve, 2000) ); sonnerToast.promise(promise, { loading: "Processing...", success: "Processing complete!", error: "Processing failed", }); }` |
| client/src/pages/Dashboard.tsx:214 | onClick | Ação local — conferir fluxo completo | `() => setPeriod('today')` |
| client/src/pages/Dashboard.tsx:224 | onClick | Ação local — conferir fluxo completo | `() => setPeriod('month')` |
| client/src/pages/Dashboard.tsx:234 | onClick | Ação local — conferir fluxo completo | `() => setPeriod('year')` |
| client/src/pages/Dashboard.tsx:662 | onClick | Ação local — conferir fluxo completo | `() => setSelectedReceiptTx(tx)` |
| client/src/pages/Dashboard.tsx:670 | onClick | Ação local — conferir fluxo completo | `() => setSelectedInvoiceTx(tx)` |
| client/src/pages/Dashboard.tsx:678 | onClick | Ação local — conferir fluxo completo | `() => setRefundTargetTx(tx)` |
| client/src/pages/Dashboard.tsx:691 | onClick | Revisar fluxo chamado | `() => handleSimulateWebhook(tx.code)` |
| client/src/pages/Dashboard.tsx:727 | onSubmit | Revisar fluxo chamado | `handleRefundSubmit` |
| client/src/pages/Dashboard.tsx:752 | onClick | Ação local — conferir fluxo completo | `() => setRefundTargetTx(null)` |
| client/src/pages/MindOSDashboard.tsx:121 | onClick | Ação local — conferir fluxo completo | `() => setView('today')` |
| client/src/pages/MindOSDashboard.tsx:122 | onClick | Ação local — conferir fluxo completo | `() => setView('week')` |
| client/src/pages/MindOSDashboard.tsx:132 | onClick | Mensagem — conferir se há operação efetiva | `() => toast.info('Ações operacionais disponíveis conforme sua permissão.')` |
| client/src/pages/MindOSDashboard.tsx:141 | onClick | Mensagem — conferir se há operação efetiva | `() => toast.info('${action.label}: fluxo de ação aberto.')` |
| client/src/pages/NotFound.tsx:41 | onClick | Revisar fluxo chamado | `handleGoHome` |
| client/src/pages/OnlineBooking.tsx:14 | onSubmit | Chama persistência — conferir evidência do módulo | `(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); bookingMutation.mutate({ name: String(form.get('name') &#124;&#124; ''), contactChannel: String(form.get('contactChannel') &#124;&#124; 'WHATSAPP_DISCREET') as 'WHATSAPP_DISCR` |
| client/src/pages/PatientPortal.tsx:51 | onClick | Revisar fluxo chamado | `() => void logout()` |
| client/src/pages/PatientPortal.tsx:75 | onClick | Revisar fluxo chamado | `startLogin` |
| client/src/pages/PatientPortal.tsx:93 | onClick | Revisar fluxo chamado | `() => void portalQuery.refetch()` |
| client/src/pages/PatientPortal.tsx:109 | onClick | Ação local — conferir fluxo completo | `() => setTab(id)` |
| client/src/pages/Patients.tsx:88 | onSubmit | Revisar fluxo chamado | `submit` |
| client/src/pages/Patients.tsx:245 | onClick | Ação local — conferir fluxo completo | `() => setEditor({ patient: null })` |
| client/src/pages/Patients.tsx:256 | onSubmit | Ação local — conferir fluxo completo | `e => { e.preventDefault(); setSearch(text.trim()); setPage(1); }` |
| client/src/pages/Patients.tsx:299 | onClick | Revisar fluxo chamado | `() => query.refetch()` |
| client/src/pages/Patients.tsx:348 | onClick | Ação local — conferir fluxo completo | `() => setEditor({ patient: p })` |
| client/src/pages/Patients.tsx:370 | onClick | Ação local — conferir fluxo completo | `() => setPage(p => p - 1)` |
| client/src/pages/Patients.tsx:383 | onClick | Ação local — conferir fluxo completo | `() => setPage(p => p + 1)` |
| client/src/pages/Payables.tsx:93 | onClick | Ação local — conferir fluxo completo | `() => setStatusFilter('ALL')` |
| client/src/pages/Payables.tsx:103 | onClick | Ação local — conferir fluxo completo | `() => setStatusFilter('PENDING')` |
| client/src/pages/Payables.tsx:113 | onClick | Ação local — conferir fluxo completo | `() => setStatusFilter('PAID')` |
| client/src/pages/Payables.tsx:182 | onClick | Chama persistência — conferir evidência do módulo | `() => payMutation.mutate({ code: p.code })` |
| client/src/pages/Receivables.tsx:120 | onClick | Ação local — conferir fluxo completo | `() => setFilter('ALL')` |
| client/src/pages/Receivables.tsx:130 | onClick | Ação local — conferir fluxo completo | `() => setFilter('PENDING')` |
| client/src/pages/Receivables.tsx:140 | onClick | Ação local — conferir fluxo completo | `() => setFilter('OVERDUE')` |
| client/src/pages/Receivables.tsx:211 | onClick | Revisar fluxo chamado | `() => { navigator.clipboard.writeText( 'Olá ${tx.patientName}, segue seu link para liquidação da consulta na ${currentVertical.name}: https://fluxa.med.br/pay/${tx.code}' ); toast.success('Mensagem de cobrança copiada para envio ao paciente` |
| client/src/pages/Receivables.tsx:225 | onClick | Chama persistência — conferir evidência do módulo | `() => confirmMutation.mutate({ code: tx.code })` |
| client/src/pages/Reception.tsx:22 | onClick | Mensagem — conferir se há operação efetiva | `() => toast.success('Novo cadastro administrativo iniciado.')` |
| client/src/pages/Reception.tsx:22 | onClick | Revisar fluxo chamado | `() => registerEvent(item.id, 'MESSAGE_SENT')` |
| client/src/pages/Reception.tsx:22 | onClick | Revisar fluxo chamado | `() => registerEvent(item.id, 'CHECK_IN')` |
| client/src/pages/Reception.tsx:22 | onClick | Mensagem — conferir se há operação efetiva | `() => toast.info('Busca administrativa aberta.')` |
| client/src/pages/Reception.tsx:22 | onClick | Mensagem — conferir se há operação efetiva | `() => toast.info('Contato telefônico aberto.')` |
| client/src/pages/Reception.tsx:22 | onClick | Mensagem — conferir se há operação efetiva | `() => toast.info('Pendências de confirmação abertas.')` |
| client/src/pages/Team.tsx:131 | onClick | Revisar fluxo chamado | `startLogin` |
| client/src/pages/Team.tsx:145 | onClick | Revisar fluxo chamado | `() => void overview.refetch()` |
| client/src/pages/Team.tsx:164 | onSubmit | Chama persistência — conferir evidência do módulo | `event => { event.preventDefault(); createClinic.mutate({ name: clinicName, slug }); }` |
| client/src/pages/Team.tsx:291 | onClick | Ação local — conferir fluxo completo | `() => setEditing({ membershipId: member.id, name: member.name &#124;&#124; member.email &#124;&#124; "Pessoa", active: member.active, access: { role: member.role as TeamRole, permissions: member.permissions, ...(member.patientId ? { patientId: member.patientId` |
| client/src/pages/Team.tsx:325 | onSubmit | Revisar fluxo chamado | `submitInvite` |
| client/src/pages/Team.tsx:380 | onClick | Revisar fluxo chamado | `async () => { try { await navigator.clipboard.writeText(inviteLink); toast.success("Link copiado."); } catch { toast.error("Selecione o link e copie manualmente."); } }` |
| client/src/pages/Team.tsx:428 | onClick | Chama persistência — conferir evidência do módulo | `() => revoke.mutate({ inviteId: invite.id })` |
| client/src/pages/Team.tsx:466 | onSubmit | Revisar fluxo chamado | `submitEdit` |
| client/src/pages/Transactions.tsx:303 | onClick | Ação local — conferir fluxo completo | `() => setSelectedInvoiceTx(tx)` |
| client/src/pages/Transactions.tsx:319 | onClick | Ação local — conferir fluxo completo | `() => setSelectedReceiptTx(tx)` |
| client/src/pages/Transactions.tsx:327 | onClick | Ação local — conferir fluxo completo | `() => setSelectedInvoiceTx(tx)` |
| client/src/pages/Transactions.tsx:335 | onClick | Ação local — conferir fluxo completo | `() => setRefundTargetTx(tx)` |
| client/src/pages/Transactions.tsx:347 | onClick | Chama persistência — conferir evidência do módulo | `() => webhookMutation.mutate({ code: tx.code })` |
| client/src/pages/Transactions.tsx:401 | onClick | Ação local — conferir fluxo completo | `() => setRefundTargetTx(null)` |
| client/src/pages/Transactions.tsx:409 | onClick | Chama persistência — conferir evidência do módulo | `() => { if (!refundReason.trim()) { toast.error('Informe a justificativa do estorno.'); return; } refundMutation.mutate({ code: refundTargetTx.code, reason: refundReason, }); }` |
| client/src/components/AIChatBox.tsx:214 | onClick | Revisar fluxo chamado | `() => onSendMessage(prompt)` |
| client/src/components/AIChatBox.tsx:308 | onSubmit | Revisar fluxo chamado | `handleSubmit` |
| client/src/components/DashboardLayout.tsx:72 | onClick | Revisar fluxo chamado | `() => startLogin()` |
| client/src/components/DashboardLayout.tsx:163 | onClick | Revisar fluxo chamado | `toggleSidebar` |
| client/src/components/DashboardLayout.tsx:187 | onClick | Ação local — conferir fluxo completo | `() => setLocation(item.path)` |
| client/src/components/DashboardLayout.tsx:223 | onClick | Revisar fluxo chamado | `logout` |
| client/src/components/ErrorBoundary.tsx:43 | onClick | Revisar fluxo chamado | `() => window.location.reload()` |
| client/src/components/FinancialLayout.tsx:111 | onClick | Ação local — conferir fluxo completo | `() => setVerticalMenuOpen(!verticalMenuOpen)` |
| client/src/components/FinancialLayout.tsx:126 | onClick | Ação local — conferir fluxo completo | `() => setVerticalMenuOpen(false)` |
| client/src/components/FinancialLayout.tsx:140 | onClick | Ação local — conferir fluxo completo | `() => { setVerticalCode(preset.code); setVerticalMenuOpen(false); }` |
| client/src/components/FinancialLayout.tsx:195 | onClick | Revisar fluxo chamado | `toggleTheme` |
| client/src/components/InvoiceModal.tsx:64 | onClick | Revisar fluxo chamado | `() => window.print()` |
| client/src/components/InvoiceModal.tsx:70 | onClick | Revisar fluxo chamado | `onClose` |
| client/src/components/InvoiceModal.tsx:195 | onClick | Revisar fluxo chamado | `onClose` |
| client/src/components/InvoiceModal.tsx:201 | onClick | Revisar fluxo chamado | `() => { navigator.clipboard.writeText(invoiceKey); toast.success('Chave de acesso da NFS-e copiada com sucesso!'); }` |
| client/src/components/ManusDialog.tsx:80 | onClick | Revisar fluxo chamado | `onLogin` |
| client/src/components/patients/PatientSelector.tsx:40 | onClick | Revisar fluxo chamado | `() => startLogin()` |
| client/src/components/patients/PatientSelector.tsx:73 | onSubmit | Revisar fluxo chamado | `find` |
| client/src/components/ReceiptModal.tsx:63 | onClick | Revisar fluxo chamado | `handlePrint` |
| client/src/components/ReceiptModal.tsx:70 | onClick | Revisar fluxo chamado | `onClose` |
| client/src/components/ReceiptModal.tsx:190 | onClick | Revisar fluxo chamado | `handleCopyCode` |
| client/src/components/ReceiptModal.tsx:202 | onClick | Revisar fluxo chamado | `onClose` |
| client/src/components/ReceiptModal.tsx:208 | onClick | Revisar fluxo chamado | `handlePrint` |
