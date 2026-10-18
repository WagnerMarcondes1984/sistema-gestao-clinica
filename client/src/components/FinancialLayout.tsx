import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useVertical } from '../contexts/VerticalContext';
import { useTheme } from '../contexts/ThemeContext';
import { VerticalCode } from '../types/finance';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Layers,
  LayoutDashboard,
  Moon,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Sun,
  TrendingUp,
  User,
  Wallet,
  CalendarDays,
  UsersRound,
  Settings2,
  UserRoundCheck,
  FileHeart,
} from 'lucide-react';

interface FinancialLayoutProps {
  children: React.ReactNode;
  onOpenQuickCheckout?: () => void;
  operatorName?: string;
  contextLabel?: string;
  showFiscalBanner?: boolean;
}

export function FinancialLayout({ children, onOpenQuickCheckout, operatorName, contextLabel, showFiscalBanner = true }: FinancialLayoutProps) {
  const { currentVertical, verticalCode, setVerticalCode, allPresets } = useVertical();
  const { theme, toggleTheme } = useTheme();
  const [location] = useLocation();
  const [verticalMenuOpen, setVerticalMenuOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'MindOS', icon: Sparkles },
    { href: '/agenda', label: 'Agenda', icon: CalendarDays },
    { href: '/reception', label: 'Recepção', icon: UserRoundCheck },
    { href: '/patients', label: 'Pacientes', icon: UsersRound },
    { href: '/clinical-records', label: 'Prontuário', icon: FileHeart },
    { href: '/checkout', label: 'Financeiro', icon: CreditCard, highlight: true },
    { href: '/transactions', label: 'Transações', icon: Receipt },
    { href: '/app/admin-studio', label: 'Admin Studio', icon: Settings2 },
    { href: '/app/scheduling', label: 'Configuração da agenda', icon: CalendarDays },
    { href: '/app/team', label: 'Equipe', icon: UsersRound },
  ];

  const getVerticalIcon = (code: VerticalCode) => {
    switch (code) {
      case 'DENTAL_CLINIC':
        return Sparkles;
      case 'MEDICAL_CLINIC':
        return Stethoscope;
      case 'AESTHETIC_CLINIC':
        return Sparkles;
      case 'PHYSIOTHERAPY_CLINIC':
        return Activity;
      case 'PSYCHOLOGY_CLINIC':
        return TrendingUp;
      default:
        return Layers;
    }
  };

  const VerticalIcon = getVerticalIcon(verticalCode);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50/70 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100 transition-colors duration-200">
      {/* Top Banner White Label Switcher */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 dark:border-zinc-800 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Brand Logo & Vertical Tag */}
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-3 group">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-sm transition-transform duration-200 group-hover:scale-105"
                  style={{ backgroundColor: currentVertical.primaryColor }}
                >
                  <VerticalIcon className="w-5 h-5" />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-bold text-lg tracking-tight leading-none text-slate-900 dark:text-white flex items-center gap-2">
                    {currentVertical.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    {currentVertical.badge} • MindOS Core
                  </span>
                </div>
              </Link>

              {/* White Label Preset Picker */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setVerticalMenuOpen(!verticalMenuOpen)}
                  className="hidden md:inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all text-slate-700 dark:text-zinc-300 shadow-xs"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block animate-pulse"
                    style={{ backgroundColor: currentVertical.primaryColor }}
                  />
                  <span>Trocar Vertical White Label</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {verticalMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setVerticalMenuOpen(false)}
                    />
                    <div className="absolute left-0 mt-2 w-80 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl p-2 z-40 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-zinc-800/80 mb-1">
                        Selecionar Vertical White Label
                      </div>
                      <div className="space-y-1">
                        {allPresets.map((preset) => {
                          const Icon = getVerticalIcon(preset.code);
                          const isSelected = preset.code === verticalCode;
                          return (
                            <button
                              key={preset.code}
                              type="button"
                              onClick={() => {
                                setVerticalCode(preset.code);
                                setVerticalMenuOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors ${
                                isSelected
                                  ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white font-semibold'
                                  : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50 text-slate-600 dark:text-zinc-400'
                              }`}
                            >
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                                style={{ backgroundColor: preset.primaryColor }}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {preset.name}
                                </div>
                                <div className="text-[11px] text-slate-400 truncate">
                                  {preset.badge}
                                </div>
                              </div>
                              {isSelected && (
                                <CheckCircle2
                                  className="w-4 h-4 shrink-0"
                                  style={{ color: preset.primaryColor }}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-3">
              {/* Quick Checkout CTA */}
              <Link
                href="/agenda"
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-white px-3.5 py-2 rounded-xl shadow-sm transition-all duration-150 hover:brightness-110 active:scale-95"
                style={{ backgroundColor: currentVertical.primaryColor }}
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Nova sessão</span>
              </Link>

              {/* Theme toggle */}
              <button
                type="button"
                onClick={toggleTheme}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                title="Alternar tema claro/escuro"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4" />
                )}
              </button>

              {/* Operator Badge */}
              <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-slate-200 dark:border-zinc-800 text-xs">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-zinc-800 flex items-center justify-center font-bold text-slate-700 dark:text-zinc-300">
                  <User className="w-4 h-4" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-semibold text-slate-800 dark:text-zinc-200 leading-tight">
                    {operatorName ?? currentVertical.defaultOperator}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {contextLabel ?? currentVertical.defaultUnit}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Sub-bar with Navigation Links */}
        <div className="border-t border-slate-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center space-x-1 sm:space-x-2 py-1.5 overflow-x-auto no-scrollbar">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-zinc-950 font-semibold shadow-xs'
                        : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-80" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* Info Ribbon for Institutional & Fiscal Transparency */}
      {showFiscalBanner && <div className="bg-slate-100/80 dark:bg-zinc-900/40 border-b border-slate-200/60 dark:border-zinc-800/60 py-1.5 px-4 text-[11px] text-slate-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-slate-700 dark:text-zinc-300">
              CNPJ: {currentVertical.cnpj}
            </span>
            <span>•</span>
            <span>Inscrição Municipal: {currentVertical.municipalReg}</span>
            <span>•</span>
            <span>Conselho: {currentVertical.council}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Ambiente de Produção Fiscal NFS-e Conectado
            </span>
          </div>
        </div>
      </div>}

      {/* Page Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {children}
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 py-6 text-xs text-slate-500 dark:text-zinc-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: currentVertical.primaryColor }}
            />
            <span className="font-semibold text-slate-800 dark:text-zinc-200">
              {currentVertical.name}
            </span>
            <span>— Core Financeiro & Fiscal Multi-Tenant</span>
          </div>
          <div className="flex items-center gap-4">
              <span>Privacidade por camadas</span>
            <span>•</span>
            <span>Auditoria de acesso</span>
            <span>•</span>
            <span>MindOS Core v1.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
