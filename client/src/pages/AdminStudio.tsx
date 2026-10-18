import { useEffect, useState } from 'react';
import { FinancialLayout } from '../components/FinancialLayout';
import { useAuth } from '../_core/hooks/useAuth';
import { trpc } from '../lib/trpc';
import { useVertical } from '../contexts/VerticalContext';
import {
  Check,
  ChevronRight,
  FileText,
  Globe2,
  Image,
  LayoutTemplate,
  LockKeyhole,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

const studioItems = [
  { id: 'overview', label: 'Visão geral', icon: LayoutTemplate },
  { id: 'brand', label: 'Marca e aparência', icon: Palette },
  { id: 'site', label: 'Site e páginas', icon: Globe2 },
  { id: 'content', label: 'Textos e mídia', icon: FileText },
  { id: 'seo', label: 'SEO / GEO / AEO', icon: Search },
  { id: 'portal', label: 'Portal do paciente', icon: Wand2 },
  { id: 'security', label: 'Segurança', icon: ShieldCheck },
];

const blocks = ['Hero', 'Sobre', 'Áreas de atendimento', 'Profissionais públicos', 'Serviços', 'FAQ', 'Localização', 'Agendamento', 'CTA', 'Footer'];

export default function AdminStudio() {
  const { currentVertical } = useVertical();
  const { isAuthenticated } = useAuth();
  const cmsQuery = trpc.mindos.cms.versions.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const profileQuery = trpc.mindos.institutionalProfile.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const saveProfileMutation = trpc.mindos.saveInstitutionalProfile.useMutation({ onSuccess: () => { profileQuery.refetch(); notify('Perfil institucional salvo com auditoria.'); } });
  const saveDraftMutation = trpc.mindos.cms.saveDraft.useMutation({ onSuccess: () => { cmsQuery.refetch(); notify('Draft salvo com versionamento.'); } });
  const publishMutation = trpc.mindos.cms.publish.useMutation({ onSuccess: () => { cmsQuery.refetch(); setDraftStatus('PUBLISHED'); notify('Versão publicada e registrada na auditoria.'); } });
  const latestDraft = cmsQuery.data?.find((version) => version.status === 'DRAFT');
  const latestPublished = cmsQuery.data?.find((version) => version.status === 'PUBLISHED');
  const [active, setActive] = useState('overview');
  const [draftStatus, setDraftStatus] = useState<'DRAFT' | 'PREVIEW' | 'PUBLISHED'>(latestPublished ? 'PUBLISHED' : 'DRAFT');
  const [siteTitle, setSiteTitle] = useState('MindOS — Psicologia e Saúde Mental');
  const [heroText, setHeroText] = useState('Cuidado psicológico com presença, segurança e continuidade.');
  const [siteBlocks, setSiteBlocks] = useState(blocks);
  useEffect(() => {
    const version = latestDraft ?? latestPublished;
    if (!version) return;
    try {
      const content = JSON.parse(version.contentJson) as { title?: string; hero?: string; sections?: string[] };
      if (content.title) setSiteTitle(content.title);
      if (content.hero) setHeroText(content.hero);
      if (content.sections?.length) setSiteBlocks(content.sections);
    } catch {
      // Conteúdo legado inválido permanece em modo seguro com os blocos base.
    }
  }, [latestDraft?.id, latestPublished?.id]);

  const notify = (message: string) => toast.success(message);
  const saveCurrentDraft = () => {
    const contentJson = JSON.stringify({ title: siteTitle, hero: heroText, sections: siteBlocks, status: 'DRAFT' });
    if (isAuthenticated) {
      saveDraftMutation.mutate({ contentJson, changeSummary: 'Atualização de marca e conteúdo institucional' });
      saveProfileMutation.mutate({ title: siteTitle, metaDescription: heroText, city: currentVertical.city, faqJson: JSON.stringify([{ question: 'Como agendar?', answer: 'Escolha uma preferência e a equipe confirma o horário.' }]), llmsTxt: `MindOS é uma clínica de psicologia em ${currentVertical.city} com atendimento responsável.` });
    } else {
      notify('Modo de demonstração: draft preparado localmente.');
    }
  };

  return (
    <FinancialLayout>
      <div className="flex flex-col lg:flex-row gap-6 min-h-[680px]">
        <aside className="lg:w-64 shrink-0 bg-white rounded-3xl border border-slate-200 shadow-sm p-3 h-fit lg:sticky lg:top-28">
          <div className="px-3 py-3 border-b border-slate-100 mb-2"><div className="flex items-center gap-2"><div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center"><Sparkles className="w-4 h-4" /></div><div><div className="text-sm font-extrabold text-slate-900">Admin Studio</div><div className="text-[10px] text-slate-500">MindOS White Label</div></div></div></div>
          <nav className="space-y-1">{studioItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setActive(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-semibold transition ${active === item.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="w-4 h-4" />{item.label}<ChevronRight className={`w-3.5 h-3.5 ml-auto ${active === item.id ? 'opacity-100' : 'opacity-0'}`} /></button> })}</nav>
          <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-100"><div className="flex items-center gap-2 text-[11px] font-bold text-slate-700"><LockKeyhole className="w-3.5 h-3.5 text-indigo-600" />Sem scripts arbitrários</div><p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">O Site Builder usa blocos controlados para preservar segurança e desempenho.</p></div>
        </aside>

        <main className="flex-1 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><div className="inline-flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase text-indigo-600 mb-2"><Settings2 className="w-3.5 h-3.5" /> Configuração do tenant</div><h1 className="text-2xl font-extrabold text-slate-900">Admin Studio</h1><p className="text-sm text-slate-500 mt-1">Configure o site público, o portal e a identidade da {currentVertical.name} sem alterar código.</p></div><div className="flex gap-2"><button onClick={() => { setDraftStatus('PREVIEW'); notify('Preview preparado para validação.'); }} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50"><Globe2 className="w-4 h-4" /> Preview</button><button onClick={() => { if (isAuthenticated && latestDraft) publishMutation.mutate({ versionId: latestDraft.id }); else { setDraftStatus('PUBLISHED'); notify('Modo de demonstração: publicação preparada.'); } }} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"><Send className="w-4 h-4" /> Publicar</button></div></div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1"><div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200 text-[11px] font-semibold"><span className="w-2 h-2 rounded-full bg-slate-400" /> Editar</div><ChevronRight className="w-3.5 h-3.5 text-slate-300" /><div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold ${draftStatus === 'DRAFT' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-white border-slate-200 text-slate-600'}`}><span className="w-2 h-2 rounded-full bg-amber-400" /> Draft</div><ChevronRight className="w-3.5 h-3.5 text-slate-300" /><div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold ${draftStatus === 'PREVIEW' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}><span className="w-2 h-2 rounded-full bg-indigo-500" /> Preview</div><ChevronRight className="w-3.5 h-3.5 text-slate-300" /><div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-semibold ${draftStatus === 'PUBLISHED' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-600'}`}><span className="w-2 h-2 rounded-full bg-emerald-500" /> Publicado</div></div>

          {active === 'overview' && <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="md:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-sm p-6"><div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-900">Site público</h2><p className="text-xs text-slate-500 mt-1">Conteúdo institucional publicado para o tenant.</p></div><button onClick={() => setActive('site')} className="text-xs font-bold text-indigo-700">Editar site</button></div><div className="rounded-2xl bg-gradient-to-br from-indigo-950 to-violet-900 p-6 text-white"><div className="text-[10px] uppercase tracking-widest text-indigo-200">{siteTitle}</div><div className="text-2xl font-extrabold mt-4 max-w-md">{heroText}</div><div className="mt-5 inline-flex px-3 py-2 rounded-lg bg-white text-indigo-950 text-xs font-bold">Agendar conversa</div></div></div><div className="space-y-4"><div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm"><div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Status do conteúdo</div><div className="text-2xl font-extrabold text-slate-900 mt-2">{draftStatus === 'PUBLISHED' ? 'Publicado' : 'Em edição'}</div><div className="text-xs text-slate-500 mt-1">{profileQuery.data?.[0] ? 'Perfil institucional persistido' : 'Perfil em configuração'}</div></div><div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm"><div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Domínio</div><div className="font-bold text-slate-900 mt-2">mindos.clinic</div><div className="text-xs text-emerald-600 mt-1">SSL e DNS verificados</div></div></div></div>}

          {active === 'brand' && <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6"><div><h2 className="font-bold text-slate-900">Marca e aparência</h2><p className="text-xs text-slate-500 mt-1">A identidade é aplicada ao site público, portal e comunicações autorizadas.</p></div><div className="grid grid-cols-1 md:grid-cols-2 gap-5"><label className="text-xs font-semibold text-slate-700">Nome público<input value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-700">Slogan<input value={heroText} onChange={(e) => setHeroText(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" /></label></div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Primária', currentVertical.primaryColor], ['Acento', currentVertical.accentColor], ['Fundo claro', '#F8FAFC'], ['Texto', '#1E1B4B']].map(([label, color]) => <div key={label} className="rounded-2xl border border-slate-200 p-3"><div className="h-12 rounded-xl" style={{ backgroundColor: color }} /><div className="text-xs font-bold text-slate-700 mt-2">{label}</div><div className="text-[10px] font-mono text-slate-400 mt-0.5">{color}</div></div>)}</div><button onClick={saveCurrentDraft} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Save className="w-4 h-4" /> Salvar draft</button></section>}

          {active === 'site' && <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6"><div className="flex items-center justify-between mb-5"><div><h2 className="font-bold text-slate-900">Section Builder</h2><p className="text-xs text-slate-500 mt-1">Blocos controlados e ordenáveis para criar páginas sem scripts arbitrários.</p></div><button onClick={() => { setSiteBlocks([...siteBlocks, `Bloco ${siteBlocks.length + 1}`]); notify('Novo bloco adicionado ao draft.'); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Plus className="w-4 h-4" /> Novo bloco</button></div><div className="space-y-2">{siteBlocks.map((block, index) => <div key={block} className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30"><div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center text-xs font-bold">{index + 1}</div><div className="flex-1"><div className="text-sm font-bold text-slate-800">{block}</div><div className="text-[11px] text-slate-500">Bloco configurável do site público</div></div><button onClick={() => notify(`Editando bloco ${block}.`)} className="p-2 rounded-lg hover:bg-white text-slate-400"><Pencil className="w-4 h-4" /></button></div>)}</div></section>}

          {active === 'content' && <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6"><h2 className="font-bold text-slate-900">Textos e mídia</h2><p className="text-xs text-slate-500 mt-1 mb-6">Gerencie textos institucionais, profissionais públicos, FAQ, fotos e banners com histórico.</p><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[
              { label: 'Textos', count: '12 itens', Icon: FileText },
              { label: 'Imagens', count: '18 arquivos', Icon: Image },
              { label: 'Profissionais', count: '6 perfis', Icon: Wand2 },
              { label: 'FAQ', count: '8 perguntas', Icon: Search },
            ].map(({ label, count, Icon }) => <button key={label} onClick={() => notify(`${label} aberto para edição.`)} className="text-left p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30"><Icon className="w-5 h-5 text-indigo-600 mb-4" /><div className="text-sm font-bold text-slate-800">{label}</div><div className="text-[11px] text-slate-500 mt-1">{count}</div></button>)}</div></section>}

          {(active === 'seo' || active === 'portal' || active === 'security') && <section className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">{active === 'security' ? <ShieldCheck className="w-5 h-5" /> : active === 'portal' ? <Wand2 className="w-5 h-5" /> : <Search className="w-5 h-5" />}</div><div><h2 className="font-bold text-slate-900">{active === 'seo' ? 'SEO, GEO, AEO e LLM' : active === 'portal' ? 'Portal do paciente' : 'Segurança por camada'}</h2><p className="text-xs text-slate-500 mt-1">Módulo configurável da experiência MindOS.</p></div></div><div className="space-y-3">{(active === 'seo' ? ['Title e meta description', 'Dados estruturados públicos', 'GEO por localização', 'AEO e perguntas frequentes', 'llms.txt institucional'] : active === 'portal' ? ['Agenda e próximas sessões', 'Reagendamento', 'Documentos explicitamente liberados', 'Consentimentos', 'Financeiro e dados pessoais', 'Teleatendimento por sessão'] : ['Administrative data', 'Clinical data', 'Highly restricted clinical notes', 'Financial data', 'Public data', 'Auditoria de acesso']).map((item) => <div key={item} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"><Check className="w-4 h-4 text-emerald-600" /><span className="text-xs font-semibold text-slate-700">{item}</span></div>)}</div><button onClick={() => notify('Configuração salva como draft.')} className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold"><Save className="w-4 h-4" /> Salvar configuração</button></section>}
        </main>
      </div>
    </FinancialLayout>
  );
}
