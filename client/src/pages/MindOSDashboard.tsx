import { useState } from 'react';
import { Link } from 'wouter';
import { FinancialLayout } from '../components/FinancialLayout';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileCheck2,
  HeartHandshake,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';

const sessions = [
  { time: '09:00', patient: 'M. S.', professional: 'Dra. Clarice Vianna', type: 'Psicoterapia individual', mode: 'Presencial', status: 'CONFIRMED', room: 'Sala 02' },
  { time: '10:30', patient: 'R. A.', professional: 'Dr. Felipe Nunes', type: 'Acompanhamento psicológico', mode: 'Online', status: 'WAITING', room: 'Sala virtual' },
  { time: '14:00', patient: 'L. C.', professional: 'Dra. Clarice Vianna', type: 'Psicoterapia de adultos', mode: 'Presencial', status: 'SCHEDULED', room: 'Sala 02' },
  { time: '16:30', patient: 'A. P.', professional: 'Dra. Marina Luz', type: 'Orientação parental', mode: 'Online', status: 'CONFIRMED', room: 'Sala virtual' },
];

const actions = [
  { label: 'Sessões sem confirmação', detail: '3 contatos precisam de retorno', icon: CalendarDays, tone: 'amber' },
  { label: 'Consentimentos pendentes', detail: '2 documentos aguardam assinatura', icon: FileCheck2, tone: 'indigo' },
  { label: 'Follow-ups administrativos', detail: '5 pacientes na fila de contato', icon: MessageCircle, tone: 'violet' },
  { label: 'Pagamentos vencidos', detail: '1 cobrança requer atenção', icon: AlertCircle, tone: 'rose' },
];

const toneMap: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  violet: 'bg-violet-50 text-violet-700 border-violet-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function MindOSDashboard() {
  const { currentVertical } = useVertical();
  const { isAuthenticated } = useAuth();
  const mindosQuery = trpc.mindos.dashboard.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const liveData = mindosQuery.data;
  const liveSessions = liveData?.appointments?.slice(0, 6).map((item) => {
    const patient = liveData.patients.find((candidate) => candidate.id === item.patientId);
    return {
      time: new Date(item.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      patient: patient?.preferredName || patient?.fullName || 'Paciente',
      professional: item.professionalName,
      type: item.serviceType,
      mode: item.mode === 'ONLINE' ? 'Online' : 'Presencial',
      status: item.status,
      room: item.unitName,
    };
  });
  const scheduleRows = liveSessions && liveSessions.length > 0 ? liveSessions : sessions;
  const [view, setView] = useState<'today' | 'week'>('today');

  return (
    <FinancialLayout>
      <div className="space-y-6">
        <section className="rounded-[28px] overflow-hidden border border-indigo-100 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 text-white shadow-xl shadow-indigo-900/10">
          <div className="p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-indigo-100 text-[11px] font-semibold uppercase tracking-wider mb-4">
                <Sparkles className="w-3.5 h-3.5" /> MindOS • Psicologia & Saúde Mental
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Clareza operacional para cuidar melhor.</h1>
              <p className="mt-3 text-sm sm:text-base text-indigo-100/80 max-w-xl">Uma visão segura da rotina da clínica, com agenda, recepção, relacionamento e financeiro separados do conteúdo clínico.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/agenda" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-indigo-950 text-xs font-bold hover:bg-indigo-50 transition"><CalendarDays className="w-4 h-4" /> Abrir agenda</Link>
              <Link href="/patients" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white text-xs font-bold hover:bg-white/15 transition"><UsersRound className="w-4 h-4" /> Paciente 360°</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 border-t border-white/10 bg-black/10">
            {[
              { label: 'Sessões hoje', value: String(liveData?.metrics.sessionsToday ?? 12), Icon: CalendarDays },
              { label: 'Confirmadas', value: String(liveData?.metrics.confirmed ?? 8).padStart(2, '0'), Icon: CheckCircle2 },
              { label: 'Aguardando', value: String(liveData?.metrics.waiting ?? 2).padStart(2, '0'), Icon: Clock3 },
              { label: 'Novos pacientes', value: String(liveData?.metrics.newPatients ?? 4).padStart(2, '0'), Icon: UserRound },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="p-4 sm:p-5 border-r border-white/10 last:border-r-0">
                <Icon className="w-4 h-4 text-indigo-200 mb-3" />
                <div className="text-2xl font-extrabold">{value}</div>
                <div className="text-[11px] text-indigo-100/70 mt-1">{label}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Pacientes ativos', '186', '2,4% vs. mês anterior', 'text-indigo-700'],
            ['Sessões realizadas', '94', '87% de presença', 'text-emerald-700'],
            ['Receita do mês', 'R$ 28.400', '91% conciliada', 'text-slate-900'],
            ['Ocupação da agenda', '78%', 'Janela ideal: 70–85%', 'text-violet-700'],
          ].map(([label, value, note, color]) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">{label}</div>
              <div className={`text-xl font-extrabold mt-2 ${color}`}>{value}</div>
              <div className="text-[11px] text-slate-500 mt-1">{note}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.9fr] gap-6">
          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div><h2 className="font-bold text-slate-900">Agenda operacional</h2><p className="text-xs text-slate-500 mt-1">Somente informações necessárias para o atendimento.</p></div>
              <div className="flex rounded-xl bg-slate-100 p-1 text-[11px] font-semibold">
                <button onClick={() => setView('today')} className={`px-3 py-1.5 rounded-lg ${view === 'today' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Hoje</button>
                <button onClick={() => setView('week')} className={`px-3 py-1.5 rounded-lg ${view === 'week' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Semana</button>
              </div>
            </div>
            <div className="divide-y divide-slate-100">
              {scheduleRows.map((session) => (
                <div key={session.time} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition">
                  <div className="w-14 text-center"><div className="text-sm font-bold text-slate-900">{session.time}</div><div className="text-[10px] text-slate-400">50 min</div></div>
                  <div className="w-px h-10 bg-indigo-200" />
                  <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-bold text-sm text-slate-900">{session.patient}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${session.status === 'WAITING' ? 'bg-amber-100 text-amber-700' : session.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{session.status === 'WAITING' ? 'AGUARDANDO' : session.status === 'CONFIRMED' ? 'CONFIRMADA' : 'AGENDADA'}</span></div><div className="text-xs text-slate-500 mt-1">{session.type} • {session.professional}</div></div>
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500"><span className="w-2 h-2 rounded-full bg-indigo-400" />{session.mode}</div>
                  <button onClick={() => toast.info('Ações operacionais disponíveis conforme sua permissão.')} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><MoreHorizontal className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="px-5 py-4 border-t border-slate-100"><Link href="/agenda" className="inline-flex items-center gap-2 text-xs font-bold text-indigo-700 hover:text-indigo-900">Ver agenda completa <ArrowRight className="w-3.5 h-3.5" /></Link></div>
          </section>

          <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4"><div><h2 className="font-bold text-slate-900">Central de ações</h2><p className="text-xs text-slate-500 mt-1">Pendências administrativas sem conteúdo clínico.</p></div><div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center"><HeartHandshake className="w-4 h-4" /></div></div>
            <div className="space-y-2.5">{actions.map((action) => { const Icon = action.icon; return <button key={action.label} onClick={() => toast.info(`${action.label}: fluxo de ação aberto.`)} className="w-full text-left p-3 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/40 transition flex items-center gap-3"><div className={`w-9 h-9 rounded-xl border flex items-center justify-center ${toneMap[action.tone]}`}><Icon className="w-4 h-4" /></div><div className="flex-1 min-w-0"><div className="text-xs font-bold text-slate-800">{action.label}</div><div className="text-[11px] text-slate-500 mt-0.5">{action.detail}</div></div><ArrowRight className="w-4 h-4 text-slate-300" /></button> })}</div>
            <div className="mt-5 p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex gap-3"><LockKeyhole className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" /><div><div className="text-xs font-bold text-slate-800">Privacidade por camada ativa</div><div className="text-[11px] text-slate-500 mt-1">Recepção e financeiro não acessam prontuários ou notas restritas.</div></div></div>
          </section>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-indigo-700 mb-3"><ShieldCheck className="w-4 h-4" /><span className="text-xs font-bold">Dados protegidos</span></div><p className="text-xs text-slate-500 leading-relaxed">Dados administrativos, clínicos, financeiros e públicos possuem acessos separados por permissão.</p></div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-violet-700 mb-3"><Video className="w-4 h-4" /><span className="text-xs font-bold">Teleatendimento opcional</span></div><p className="text-xs text-slate-500 leading-relaxed">Links temporários por sessão, com expiração e auditoria de acesso.</p></div>
          <div className="bg-white rounded-2xl border border-slate-200 p-5"><div className="flex items-center gap-2 text-emerald-700 mb-3"><Plus className="w-4 h-4" /><span className="text-xs font-bold">Ações rápidas</span></div><div className="flex flex-wrap gap-2"><Link href="/patients" className="px-3 py-1.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">Novo paciente</Link><Link href="/app/admin-studio" className="px-3 py-1.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">Abrir Studio</Link></div></div>
        </div>
      </div>
    </FinancialLayout>
  );
}
