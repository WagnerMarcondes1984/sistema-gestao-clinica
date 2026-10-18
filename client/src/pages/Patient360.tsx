import { useState } from 'react';
import { FinancialLayout } from '../components/FinancialLayout';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FileText,
  HeartPulse,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';

const tabs = [
  { id: 'overview', label: 'Visão geral', icon: UserRound, permission: 'VIEW_PATIENT_BASIC' },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays, permission: 'MANAGE_APPOINTMENTS' },
  { id: 'clinical', label: 'Prontuário', icon: HeartPulse, permission: 'VIEW_CLINICAL_RECORD' },
  { id: 'sessions', label: 'Sessões', icon: Activity, permission: 'VIEW_CLINICAL_RECORD' },
  { id: 'documents', label: 'Documentos', icon: FileText, permission: 'VIEW_DOCUMENTS' },
  { id: 'consents', label: 'Consentimentos', icon: FileCheck2, permission: 'VIEW_DOCUMENTS' },
  { id: 'financial', label: 'Financeiro', icon: WalletCards, permission: 'VIEW_FINANCIAL' },
];

export default function Patient360() {
  const { currentVertical } = useVertical();
  const { isAuthenticated } = useAuth();
  const patientQuery = trpc.mindos.patient360.useQuery({ patientId: 1 }, { enabled: isAuthenticated, retry: false });
  const patientData = patientQuery.data;
  const patientRecord = patientData?.patient;
  const patientName = patientRecord?.preferredName || patientRecord?.fullName || 'Marina S. Andrade';
  const assignedProfessional = patientData?.appointments?.[0]?.professionalName || 'Dra. Clarice Vianna';
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <FinancialLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><div className="text-[10px] uppercase tracking-wider text-indigo-600 font-bold mb-2">Paciente 360° • Dados administrativos</div><h1 className="text-2xl font-extrabold text-slate-900">{patientName}</h1><p className="text-sm text-slate-500 mt-1">Cadastro PAT-{String(patientRecord?.id || '000184').padStart(6, '0')} • Último contato administrativo há 2 dias</p></div><div className="flex gap-2"><button onClick={() => toast.info('Nova sessão disponível conforme permissão clínica.')} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"><CalendarDays className="w-4 h-4" /> Agendar sessão</button><button onClick={() => toast.info('Mensagem administrativa preparada em linguagem discreta.')} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700"><MessageCircle className="w-4 h-4" /> Contatar</button></div></div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5"><div className="flex flex-col lg:flex-row lg:items-center gap-5"><div className="w-16 h-16 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center text-xl font-extrabold">MA</div><div className="flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-bold text-slate-900">Marina S. Andrade</h2><span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold">PACIENTE ATIVA</span></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs"><div><span className="text-slate-400 block">Contato</span><span className="font-semibold text-slate-700">(11) 9 5555-0184</span></div><div><span className="text-slate-400 block">Preferência</span><span className="font-semibold text-slate-700">WhatsApp discreto</span></div><div><span className="text-slate-400 block">Profissional</span><span className="font-semibold text-slate-700">{assignedProfessional}</span></div></div></div><div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 text-xs min-w-[190px]"><div className="flex items-center gap-2 text-indigo-700 font-bold"><ShieldCheck className="w-4 h-4" /> Acesso por permissão</div><div className="text-[11px] text-slate-500 mt-1.5">Você está vendo dados administrativos autorizados.</div></div></div></div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><div className="flex gap-1 p-2 border-b border-slate-100 overflow-x-auto">{tabs.map((tab) => { const Icon = tab.icon; const restricted = tab.permission.includes('CLINICAL'); return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><Icon className="w-3.5 h-3.5" />{tab.label}{restricted && <LockKeyhole className="w-3 h-3 opacity-60" />}</button> })}</div><div className="p-5 sm:p-6">{activeTab === 'overview' && <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-6"><div><h3 className="font-bold text-slate-900">Resumo operacional</h3><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">{[['Próxima sessão', 'Hoje, 14:00'], ['Sessões realizadas', '18'], ['Consentimentos', '3/3'], ['Financeiro', 'Em dia']].map(([label, value]) => <div key={label} className="p-3 rounded-2xl bg-slate-50 border border-slate-100"><div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">{label}</div><div className="text-sm font-bold text-slate-800 mt-2">{label === 'Sessões realizadas' ? (patientData?.appointments?.length ?? value) : value}</div></div>)}</div><div className="mt-5"><h3 className="font-bold text-slate-900">Timeline administrativa</h3><div className="mt-3 space-y-3">{['Sessão confirmada para hoje às 14:00', 'Consentimento de teleatendimento atualizado', 'Lembrete discreto enviado por WhatsApp', 'Cadastro revisado pela recepção'].map((item, index) => <div key={item} className="flex gap-3 text-xs"><div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /></div><div><div className="font-semibold text-slate-700">{item}</div><div className="text-[10px] text-slate-400 mt-0.5">{index + 1} dia{index === 0 ? '' : 's'} atrás</div></div></div>)}</div></div></div><div className="rounded-2xl bg-indigo-950 text-white p-5"><div className="flex items-center gap-2 text-indigo-200 text-xs font-bold"><LockKeyhole className="w-4 h-4" /> Camadas de privacidade</div><div className="mt-5 space-y-3">{[['Administrativo', 'Recepção e CRM', true], ['Clínico', 'Profissional autorizado', true], ['Notas restritas', 'Permissão adicional', false], ['Financeiro', 'Equipe financeira', true]].map(([label, detail, enabled]) => <div key={label as string} className="flex items-center justify-between"><div><div className="text-xs font-semibold">{label}</div><div className="text-[10px] text-indigo-200/70 mt-0.5">{detail}</div></div><span className={`w-2 h-2 rounded-full ${enabled ? 'bg-emerald-400' : 'bg-indigo-400'}`} /></div>)}</div></div></div>}{activeTab !== 'overview' && <div className="min-h-[230px] flex flex-col items-center justify-center text-center"><div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-4"><LockKeyhole className="w-5 h-5" /></div><h3 className="font-bold text-slate-900">{tabs.find((tab) => tab.id === activeTab)?.label}</h3><p className="text-xs text-slate-500 max-w-md mt-2">Este módulo respeita ACL própria. Conteúdo clínico e notas restritas não são exibidos para recepção, financeiro, CRM, portal ou IA sem permissão explícita.</p><button onClick={() => toast.info('Acesso registrado na trilha de auditoria.')} className="mt-4 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold">Solicitar acesso auditado</button></div>}</div></div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Registros finalizados não são sobrescritos silenciosamente. Alterações posteriores geram adendo ou nova versão auditável.</div>
      </div>
    </FinancialLayout>
  );
}
