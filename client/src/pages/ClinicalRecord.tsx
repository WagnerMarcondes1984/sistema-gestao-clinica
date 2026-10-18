import { useState } from 'react';
import { FinancialLayout } from '../components/FinancialLayout';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { FileText, HeartPulse, LockKeyhole, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export default function ClinicalRecord() {
  const { isAuthenticated } = useAuth();
  const recordsQuery = trpc.mindos.clinicalRecords.useQuery({ patientId: 1 }, { enabled: isAuthenticated, retry: false });
  const createMutation = trpc.mindos.createClinicalRecord.useMutation({ onSuccess: () => { recordsQuery.refetch(); toast.success('Registro salvo como rascunho versionado.'); } });
  const [recordType, setRecordType] = useState<'ANAMNESIS' | 'EVOLUTION' | 'RESTRICTED_NOTE' | 'GOAL' | 'CARE_PLAN'>('EVOLUTION');
  const [content, setContent] = useState('');
  const submit = () => {
    if (!content.trim()) { toast.error('Escreva o conteúdo antes de salvar.'); return; }
    if (!isAuthenticated) { toast.info('Faça login para persistir o registro clínico.'); return; }
    createMutation.mutate({ patientId: 1, recordType, content });
    setContent('');
  };
  return (
    <FinancialLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"><div><div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider text-indigo-600 font-bold mb-2"><HeartPulse className="w-3.5 h-3.5" /> Acesso clínico auditado</div><h1 className="text-2xl font-extrabold text-slate-900">Prontuário psicológico</h1><p className="text-sm text-slate-500 mt-1">Marina S. Andrade • registros versionados e sem sobrescrita silenciosa.</p></div><div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-700"><ShieldCheck className="w-4 h-4" /> Acesso clínico autorizado</div></div>
        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5"><section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5"><div className="flex items-center gap-2 mb-4"><Sparkles className="w-4 h-4 text-indigo-600" /><h2 className="font-bold text-slate-900">Novo registro</h2></div><div className="grid grid-cols-2 gap-2 mb-4">{[['ANAMNESIS', 'Anamnese'], ['EVOLUTION', 'Evolução'], ['GOAL', 'Objetivo'], ['CARE_PLAN', 'Plano'], ['RESTRICTED_NOTE', 'Nota restrita']].map(([value, label]) => <button key={value} onClick={() => setRecordType(value as typeof recordType)} className={`px-3 py-2 rounded-xl text-[11px] font-bold border ${recordType === value ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'border-slate-200 text-slate-500'}`}>{label}{value === 'RESTRICTED_NOTE' && <LockKeyhole className="w-3 h-3 inline ml-1" />}</button>)}</div><textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Registre apenas informações necessárias ao cuidado..." className="w-full min-h-48 resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200" /><button onClick={submit} className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Plus className="w-4 h-4" /> Salvar rascunho</button><p className="mt-3 text-[11px] text-slate-500">Notas restritas exigem a permissão <span className="font-mono">EDIT_RESTRICTED_NOTE</span> e geram auditoria específica.</p></section><section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Histórico versionado</h2><p className="text-xs text-slate-500 mt-1">{recordsQuery.data?.length ?? 0} registros retornados pela camada clínica.</p></div><FileText className="w-5 h-5 text-slate-400" /></div><div className="divide-y divide-slate-100">{recordsQuery.data && recordsQuery.data.length > 0 ? recordsQuery.data.map((record) => <div key={record.id} className="p-4"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-800">{record.recordType}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${record.status === 'FINALIZED' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{record.status === 'FINALIZED' ? 'FINALIZADO' : 'RASCUNHO'}</span></div><span className="text-[10px] text-slate-400">v{record.version}</span></div><p className="text-xs text-slate-600 mt-2 leading-relaxed">{record.content}</p><div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400"><LockKeyhole className="w-3 h-3" /> Hash de integridade registrado</div></div>) : <div className="p-10 text-center"><div className="text-sm font-bold text-slate-700">Nenhum registro carregado</div><p className="text-xs text-slate-500 mt-1">A camada clínica retorna apenas dados autorizados.</p></div>}</div></section></div>
      </div>
    </FinancialLayout>
  );
}
