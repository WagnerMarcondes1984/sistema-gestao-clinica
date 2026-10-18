import { useState } from 'react';
import { FinancialLayout } from '../components/FinancialLayout';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Plus, Video, MapPin, Clock3 } from 'lucide-react';
import { toast } from 'sonner';

const schedule = [
  { time: '09:00', patient: 'M. S.', professional: 'Dra. Clarice Vianna', service: 'Psicoterapia individual', mode: 'Presencial', status: 'CONFIRMED', room: 'Sala 02' },
  { time: '10:30', patient: 'R. A.', professional: 'Dr. Felipe Nunes', service: 'Acompanhamento psicológico', mode: 'Online', status: 'WAITING', room: 'Sala virtual' },
  { time: '14:00', patient: 'L. C.', professional: 'Dra. Clarice Vianna', service: 'Psicoterapia de adultos', mode: 'Presencial', status: 'SCHEDULED', room: 'Sala 02' },
  { time: '16:30', patient: 'A. P.', professional: 'Dra. Marina Luz', service: 'Orientação parental', mode: 'Online', status: 'CONFIRMED', room: 'Sala virtual' },
  { time: '18:00', patient: 'F. G.', professional: 'Dr. Felipe Nunes', service: 'Psicoterapia de casal', mode: 'Presencial', status: 'SCHEDULED', room: 'Sala 01' },
];

const statusLabel: Record<string, string> = { CONFIRMED: 'CONFIRMADA', WAITING: 'AGUARDANDO', SCHEDULED: 'AGENDADA' };

export default function Agenda() {
  const { isAuthenticated } = useAuth();
  const appointmentsQuery = trpc.mindos.appointments.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const liveSchedule = appointmentsQuery.data?.slice(0, 12).map((item) => ({
    time: new Date(item.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    patient: item.patient?.preferredName || item.patient?.fullName || 'Paciente',
    professional: item.professionalName,
    service: item.serviceType,
    mode: item.mode === 'ONLINE' ? 'Online' : 'Presencial',
    status: item.status,
    room: item.unitName,
  }));
  const scheduleRows = liveSchedule && liveSchedule.length > 0 ? liveSchedule : schedule;
  const [view, setView] = useState<'day' | 'week' | 'month'>('day');
  return (
    <FinancialLayout>
      <div className="space-y-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><div className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider text-indigo-600 font-bold mb-2"><CalendarDays className="w-3.5 h-3.5" /> Operação clínica</div><h1 className="text-2xl font-extrabold text-slate-900">Agenda</h1><p className="text-sm text-slate-500 mt-1">Visualize e organize sessões sem expor conteúdo clínico na recepção.</p></div><button onClick={() => toast.success('Fluxo de novo agendamento aberto.')} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold self-start"><Plus className="w-4 h-4" /> Novo agendamento</button></div>
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-4"><div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3"><div className="flex items-center gap-2"><button className="p-2 rounded-lg hover:bg-slate-100"><ChevronLeft className="w-4 h-4" /></button><div className="text-sm font-bold text-slate-900 min-w-[150px] text-center">05 de setembro de 2026</div><button className="p-2 rounded-lg hover:bg-slate-100"><ChevronRight className="w-4 h-4" /></button></div><div className="flex items-center gap-2"><div className="flex p-1 bg-slate-100 rounded-xl">{(['day', 'week', 'month'] as const).map((item) => <button key={item} onClick={() => setView(item)} className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold ${view === item ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{item === 'day' ? 'Dia' : item === 'week' ? 'Semana' : 'Mês'}</button>)}</div><button className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600"><Filter className="w-3.5 h-3.5" /> Filtros</button></div></div></div>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-5"><section className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"><div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between"><div><h2 className="font-bold text-slate-900">Sessões do dia</h2><p className="text-xs text-slate-500 mt-1">{scheduleRows.length} compromissos • Unidade Pinheiros</p></div><div className="flex items-center gap-3 text-[10px] text-slate-500"><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Presencial</span><span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-violet-500" /> Online</span></div></div><div className="divide-y divide-slate-100">{scheduleRows.map((item) => <div key={item.time} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition"><div className="w-14 text-center shrink-0"><div className="text-sm font-bold text-slate-900">{item.time}</div><div className="text-[10px] text-slate-400">50 min</div></div><div className={`w-1 h-12 rounded-full ${item.mode === 'Online' ? 'bg-violet-500' : 'bg-indigo-500'}`} /><div className="flex-1 min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-bold text-sm text-slate-900">{item.patient}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${item.status === 'WAITING' ? 'bg-amber-100 text-amber-700' : item.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{statusLabel[item.status]}</span></div><div className="text-xs text-slate-500 mt-1">{item.service} • {item.professional}</div></div><div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">{item.mode === 'Online' ? <Video className="w-3.5 h-3.5" /> : <MapPin className="w-3.5 h-3.5" />}{item.room}</div><button onClick={() => toast.info('Ações disponíveis conforme sua permissão.')} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><Clock3 className="w-4 h-4" /></button></div>)}</div></section><aside className="space-y-4"><div className="bg-indigo-950 text-white rounded-3xl p-5"><div className="text-xs font-bold text-indigo-200">Ocupação da agenda</div><div className="text-3xl font-extrabold mt-2">78%</div><div className="h-2 rounded-full bg-white/15 mt-4 overflow-hidden"><div className="h-full w-[78%] rounded-full bg-indigo-300" /></div><div className="text-[11px] text-indigo-200/70 mt-2">Faixa saudável da clínica: 70–85%</div></div><div className="bg-white rounded-3xl border border-slate-200 p-5"><div className="text-xs font-bold text-slate-800">Agenda recorrente</div><p className="text-[11px] text-slate-500 mt-1">Crie séries semanais ou quinzenais com validação de conflitos antes da confirmação.</p><button onClick={() => toast.info('Assistente de série recorrente aberto.')} className="mt-4 w-full py-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">Criar série</button></div></aside></div>
      </div>
    </FinancialLayout>
  );
}
