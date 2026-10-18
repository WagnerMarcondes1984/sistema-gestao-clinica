import React, { createContext, useContext, useState, useEffect } from 'react';
import { VerticalCode, VerticalPreset } from '../types/finance';

export const VERTICAL_PRESETS: Record<VerticalCode, VerticalPreset> = {
  ALL: {
    code: 'ALL',
    name: 'Fluxa Multi-Clinic Network',
    tagline: 'Gestão Financeira & Fiscal Unificada para Redes e Grupos de Saúde',
    badge: 'Visão Consolidada (5 Verticais)',
    council: 'CNES / CFM / CFO / CREFITO / CRP',
    primaryColor: '#0F172A',
    accentColor: '#3B82F6',
    lightBg: 'bg-slate-50',
    darkBg: 'bg-slate-900',
    borderTone: 'border-slate-200 dark:border-slate-800',
    glowClass: 'shadow-slate-500/10',
    badgeClass: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300',
    textTone: 'text-slate-900 dark:text-slate-100',
    cnpj: '00.123.456/0001-99',
    municipalReg: '0.000.000-0',
    city: 'São Paulo - SP',
    defaultUnit: 'Todas as Unidades',
    defaultOperator: 'Diretoria Financeira',
    defaultProfessional: 'Corpo Clínico Integrado',
    catalog: [],
  },
  DENTAL_CLINIC: {
    code: 'DENTAL_CLINIC',
    name: 'Oralis Odontologia Integrada',
    tagline: 'Excelência em reabilitação oral, implantodontia e estética dental de alta precisão',
    badge: 'Odontologia Especializada',
    council: 'CRO/SP 104.992',
    primaryColor: '#0D9488',
    accentColor: '#14B8A6',
    lightBg: 'bg-teal-50/50',
    darkBg: 'bg-teal-950/20',
    borderTone: 'border-teal-200/70 dark:border-teal-900/40',
    glowClass: 'shadow-teal-500/10',
    badgeClass: 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-200 dark:border-teal-800',
    textTone: 'text-teal-900 dark:text-teal-100',
    cnpj: '18.420.912/0001-44',
    municipalReg: '9.412.081-3',
    city: 'São Paulo - SP',
    defaultUnit: 'Unidade Jardins',
    defaultOperator: 'Camila Rocha (Caixa)',
    defaultProfessional: 'Dr. Lucas Silveira (CRO 104.992)',
    catalog: [
      { name: 'Instalação de Implante Osseointegrado Titânio Neodent', category: 'Implantodontia', defaultPrice: 280000, type: 'PROCEDURE' },
      { name: 'Coroa Cerâmica Pura Zircônia CAD/CAM', category: 'Prótese', defaultPrice: 140000, type: 'PROCEDURE' },
      { name: 'Tratamento Alinhador Invisível (Etapa Completa)', category: 'Ortodontia', defaultPrice: 680000, type: 'PROCEDURE' },
      { name: 'Tartarectomia e Profilaxia com Jato de Bicarbonato', category: 'Prevenção', defaultPrice: 35000, type: 'PROCEDURE' },
      { name: 'Clareamento Dental em Consultório Fotoativado Laser', category: 'Estética', defaultPrice: 60000, type: 'PROCEDURE' },
      { name: 'Facetas em Resina Composta Estratificada (Por Dente)', category: 'Estética', defaultPrice: 95000, type: 'PROCEDURE' },
      { name: 'Endodontia Microscópica Molar (Tratamento de Canal)', category: 'Endodontia', defaultPrice: 120000, type: 'PROCEDURE' },
    ],
  },
  MEDICAL_CLINIC: {
    code: 'MEDICAL_CLINIC',
    name: 'MedCore Centro Médico & Diagnóstico',
    tagline: 'Cuidado clínico multidisciplinar, exames laboratoriais e medicina preventiva',
    badge: 'Medicina e Especialidades',
    council: 'CRM/SP 142.880',
    primaryColor: '#1E40AF',
    accentColor: '#3B82F6',
    lightBg: 'bg-blue-50/50',
    darkBg: 'bg-blue-950/20',
    borderTone: 'border-blue-200/70 dark:border-blue-900/40',
    glowClass: 'shadow-blue-500/10',
    badgeClass: 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    textTone: 'text-blue-900 dark:text-blue-100',
    cnpj: '24.118.730/0001-90',
    municipalReg: '7.821.554-1',
    city: 'São Paulo - SP',
    defaultUnit: 'Hospital Day Vila Mariana',
    defaultOperator: 'Gabriel Siqueira (Recepção)',
    defaultProfessional: 'Dr. Rodrigo Mendonça (CRM 142.880)',
    catalog: [
      { name: 'Consulta Médica Especializada em Cardiologia', category: 'Consulta', defaultPrice: 45000, type: 'SERVICE' },
      { name: 'Eletrocardiograma de Repouso com Laudo Digital', category: 'Exame', defaultPrice: 10000, type: 'PROCEDURE' },
      { name: 'Consulta Médica Endocrinologia & Metabologia', category: 'Consulta', defaultPrice: 50000, type: 'SERVICE' },
      { name: 'Exame de Bioimpedância Clínica Segmentar InBody', category: 'Exame', defaultPrice: 12000, type: 'PROCEDURE' },
      { name: 'Exérese de Lesão Cutânea com Sutura em Camadas', category: 'Cirurgia', defaultPrice: 120000, type: 'PROCEDURE' },
      { name: 'Ultrassonografia com Doppler Abdominal Total', category: 'Exame', defaultPrice: 38000, type: 'PROCEDURE' },
      { name: 'Check-Up Cardiológico Completo Executivo', category: 'Pacote', defaultPrice: 95000, type: 'SERVICE' },
    ],
  },
  AESTHETIC_CLINIC: {
    code: 'AESTHETIC_CLINIC',
    name: 'Lumina Dermatologia & Estética Avançada',
    tagline: 'Harmonização facial, lasers de última geração e dermatologia clínica exclusiva',
    badge: 'Estética & Harmonização',
    council: 'CRM/SP 188.420',
    primaryColor: '#9D174D',
    accentColor: '#BE185D',
    lightBg: 'bg-pink-50/50',
    darkBg: 'bg-pink-950/20',
    borderTone: 'border-pink-200/70 dark:border-pink-900/40',
    glowClass: 'shadow-pink-500/10',
    badgeClass: 'bg-pink-50 text-pink-800 dark:bg-pink-950/60 dark:text-pink-300 border-pink-200 dark:border-pink-800',
    textTone: 'text-pink-900 dark:text-pink-100',
    cnpj: '33.902.148/0001-12',
    municipalReg: '5.109.873-6',
    city: 'São Paulo - SP',
    defaultUnit: 'Unidade Oscar Freire',
    defaultOperator: 'Aline Bittencourt (Concierge)',
    defaultProfessional: 'Dra. Vanessa Aragão (CRM 188.420)',
    catalog: [
      { name: 'Toxina Botulínica Botox Allergan 50U Facial Completa', category: 'Injetáveis', defaultPrice: 180000, type: 'PROCEDURE' },
      { name: 'Ácido Hialurônico Juvederm Voluma 1ml Região Malar', category: 'Preenchimento', defaultPrice: 200000, type: 'PROCEDURE' },
      { name: 'Sessão Laser Fracionado Lavieen BB Laser Rejuvenescimento', category: 'Laser', defaultPrice: 90000, type: 'PROCEDURE' },
      { name: 'Bioestimulador de Colágeno Sculptra Ácido Poli-L-Láctico', category: 'Bioestimulador', defaultPrice: 280000, type: 'PROCEDURE' },
      { name: 'Tratamento Ultraformer MPT Face Completa + Papada', category: 'Ultrassom', defaultPrice: 350000, type: 'PROCEDURE' },
      { name: 'Peeling Químico Médico Renovação Celular Profunda', category: 'Dermatologia', defaultPrice: 45000, type: 'PROCEDURE' },
    ],
  },
  PHYSIOTHERAPY_CLINIC: {
    code: 'PHYSIOTHERAPY_CLINIC',
    name: 'Kinesys Reabilitação & Performance',
    tagline: 'Fisioterapia traumato-ortopédica, pilates clínico e recuperação funcional',
    badge: 'Fisioterapia & Reabilitação',
    council: 'CREFITO/SP 214.881',
    primaryColor: '#065F46',
    accentColor: '#059669',
    lightBg: 'bg-emerald-50/50',
    darkBg: 'bg-emerald-950/20',
    borderTone: 'border-emerald-200/70 dark:border-emerald-900/40',
    glowClass: 'shadow-emerald-500/10',
    badgeClass: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    textTone: 'text-emerald-900 dark:text-emerald-100',
    cnpj: '41.229.083/0001-57',
    municipalReg: '3.627.189-9',
    city: 'São Paulo - SP',
    defaultUnit: 'Unidade Ibirapuera',
    defaultOperator: 'Marcos Vinicius (Caixa)',
    defaultProfessional: 'Dr. Thiago Nogueira (CREFITO 214.881)',
    catalog: [
      { name: 'Sessão Fisioterapia Esportiva & Dinamometria Isocinética', category: 'Reabilitação', defaultPrice: 18000, type: 'PROCEDURE' },
      { name: 'Mensalidade Pilates com Fisioterapeuta Especialista 2x/sem', category: 'Pilates', defaultPrice: 98000, type: 'SERVICE' },
      { name: 'Sessão de Liberação Miofascial Instrumental & Dry Needling', category: 'Terapia Manual', defaultPrice: 22000, type: 'PROCEDURE' },
      { name: 'Avaliação Baropodométrica Estática/Dinâmica + Palmilhas 3D', category: 'Avaliação', defaultPrice: 45000, type: 'PROCEDURE' },
      { name: 'Plano Reabilitação Pós-Operatório Ligamento (10 Sessões)', category: 'Pacote', defaultPrice: 170000, type: 'SERVICE' },
      { name: 'Reeducação Postural Global (RPG Individual 1h)', category: 'Postura', defaultPrice: 20000, type: 'PROCEDURE' },
    ],
  },
  PSYCHOLOGY_CLINIC: {
    code: 'PSYCHOLOGY_CLINIC',
    businessType: 'PSYCHOLOGY_CLINIC',
    name: 'MindOS Psicologia & Saúde Mental',
    tagline: 'Cuidado psicológico com presença, segurança e continuidade',
    badge: 'MindOS • Psicologia & Saúde Mental',
    council: 'CRP/SP 06/142.990',
    primaryColor: '#4338CA',
    accentColor: '#6366F1',
    lightBg: 'bg-indigo-50/50',
    darkBg: 'bg-indigo-950/20',
    borderTone: 'border-indigo-200/70 dark:border-indigo-900/40',
    glowClass: 'shadow-indigo-500/10',
    badgeClass: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
    textTone: 'text-indigo-900 dark:text-indigo-100',
    cnpj: '50.771.394/0001-83',
    municipalReg: '1.983.420-0',
    city: 'São Paulo - SP',
    defaultUnit: 'Unidade Pinheiros',
    defaultOperator: 'Larissa Alencar (Recepção)',
    defaultProfessional: 'Dra. Clarice Vianna (CRP 06/142.990)',
    catalog: [
      { name: 'Sessão de Terapia Cognitivo-Comportamental (TCC) 50 min', category: 'Psicoterapia', defaultPrice: 30000, type: 'SERVICE' },
      { name: 'Pacote Mensal Psicoterapia Adulto (4 Sessões)', category: 'Pacote', defaultPrice: 115000, type: 'SERVICE' },
      { name: 'Bateria Neuropsicológica (6 Encontros + Devolutiva Escrita)', category: 'Avaliação', defaultPrice: 260000, type: 'SERVICE' },
      { name: 'Sessão de Psicoterapia de Casal e Mediação Familiar', category: 'Casal', defaultPrice: 42000, type: 'SERVICE' },
      { name: 'Orientação Vocacional e Carreira para Adolescentes', category: 'Orientação', defaultPrice: 85000, type: 'SERVICE' },
      { name: 'Plantão Psicológico Emergencial e Acolhimento Breve', category: 'Emergência', defaultPrice: 25000, type: 'SERVICE' },
    ],
  },
};

interface VerticalContextType {
  currentVertical: VerticalPreset;
  verticalCode: VerticalCode;
  setVerticalCode: (code: VerticalCode) => void;
  allPresets: VerticalPreset[];
}

const VerticalContext = createContext<VerticalContextType | undefined>(undefined);

export function VerticalProvider({ children }: { children: React.ReactNode }) {
  const [verticalCode, setVerticalCode] = useState<VerticalCode>(() => {
    const saved = localStorage.getItem('fluxa_active_vertical');
    return (saved as VerticalCode) || 'PSYCHOLOGY_CLINIC';
  });

  useEffect(() => {
    localStorage.setItem('fluxa_active_vertical', verticalCode);
  }, [verticalCode]);

  const currentVertical = VERTICAL_PRESETS[verticalCode] || VERTICAL_PRESETS.DENTAL_CLINIC;
  const allPresets = Object.values(VERTICAL_PRESETS);

  return (
    <VerticalContext.Provider
      value={{
        currentVertical,
        verticalCode,
        setVerticalCode,
        allPresets,
      }}
    >
      {children}
    </VerticalContext.Provider>
  );
}

export function useVertical() {
  const context = useContext(VerticalContext);
  if (!context) {
    throw new Error('useVertical deve ser usado dentro de um VerticalProvider');
  }
  return context;
}
