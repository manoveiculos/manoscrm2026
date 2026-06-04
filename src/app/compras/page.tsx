'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { 
  TrendingUp, Calculator, Bell, Database, ShieldAlert, Layers
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { RadarTab } from './components/RadarTab';
import CalculatorTab from './components/CalculatorTab';
import FacebookTab from './components/FacebookTab';
import AlertsTab from './components/AlertsTab';
import ImportTab from './components/ImportTab';
import AdminTab from './components/AdminTab';

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="14"
    height="14"
    stroke="currentColor"
    strokeWidth="2.5"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

export default function ComprasPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-[#03060b] text-white/20 font-black uppercase tracking-widest animate-pulse h-screen">
        Carregando Central de Compras...
      </div>
    }>
      <ComprasContent />
    </Suspense>
  );
}

function ComprasContent() {
  const [activeTab, setActiveTab] = useState('radar');
  const [role, setRole] = useState<'admin' | 'consultant'>('consultant');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);
  const [calculatorParams, setCalculatorParams] = useState<{
    brand: string;
    model: string;
    year_model: string;
    km: string;
  } | null>(null);

  // Verifica a Role do usuário atual no Supabase
  useEffect(() => {
    async function checkRole() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          setUserEmail(user.email || null);
          const { data: consultant } = await supabase
            .from('consultants_manos_crm')
            .select('role')
            .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
            .maybeSingle();

          if (consultant) {
            setRole(consultant.role === 'admin' ? 'admin' : 'consultant');
          } else if (user.email === 'alexandre_gorges@hotmail.com') {
            setRole('admin');
          }
        }
      } catch (err) {
        console.error('[Compras] Falha ao ler role:', err);
      } finally {
        setLoadingRole(false);
      }
    }
    checkRole();
  }, []);

  const allowedTabIds = role === 'admin'
    ? ['radar', 'calculator', 'facebook', 'alerts', 'import', 'admin']
    : (userEmail?.toLowerCase() === 'hgledra@hotmail.com' || userEmail?.toLowerCase() === 'ivo@acesso.com' || userEmail?.toLowerCase() === 'paulo@manoscrm.com'
        ? ['radar', 'calculator', 'facebook', 'alerts']
        : ['radar', 'calculator', 'alerts']);

  // Força vendedor a ficar apenas nas abas permitidas
  useEffect(() => {
    if (!loadingRole && !allowedTabIds.includes(activeTab)) {
      setActiveTab('radar');
    }
  }, [loadingRole, allowedTabIds, activeTab]);

  // Lê a aba ativa dos parâmetros da URL na montagem inicial (caso venha por link)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['radar', 'calculator', 'facebook', 'alerts', 'import', 'admin'].includes(tabParam)) {
        // Se a aba não for permitida para o nível do usuário atual, vai para radar
        if (!loadingRole && !allowedTabIds.includes(tabParam)) {
          setActiveTab('radar');
        } else {
          setActiveTab(tabParam);
        }
      }
      
      const brand = params.get('brand');
      const model = params.get('model');
      const year = params.get('year_model');
      const km = params.get('km');
      if (brand || model) {
        setCalculatorParams({
          brand: brand || '',
          model: model || '',
          year_model: year || '2018',
          km: km || '80000'
        });
      }
    }
  }, [loadingRole, allowedTabIds]);

  const handleNavigateToTab = (tab: string, params?: any) => {
    // Se a aba não for permitida para o usuário atual, impede a navegação
    if (!allowedTabIds.includes(tab)) {
      return;
    }

    if (tab === 'calculator' && params) {
      setCalculatorParams(params);
    }
    setActiveTab(tab);
    
    // Atualiza a URL sem recarregar a página
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', tab);
      if (tab === 'calculator' && params) {
        url.searchParams.set('brand', params.brand || '');
        url.searchParams.set('model', params.model || '');
        url.searchParams.set('year_model', params.year_model || '');
        url.searchParams.set('km', params.km || '');
      } else {
        url.searchParams.delete('brand');
        url.searchParams.delete('model');
        url.searchParams.delete('year_model');
        url.searchParams.delete('km');
      }
      window.history.pushState({}, '', url.toString());
    }
  };

  const allTabs = [
    { id: 'radar', label: 'Radar 24h', icon: TrendingUp },
    { id: 'calculator', label: 'Calculadora de Compra', icon: Calculator },
    { id: 'facebook', label: 'Exclusivas Manos', icon: FacebookIcon },
    { id: 'alerts', label: 'Configurar Alertas', icon: Bell },
    { id: 'import', label: 'Importar Logs', icon: Database },
    { id: 'admin', label: 'Painel Admin', icon: ShieldAlert }
  ];

  // Filtra as abas baseado nas permissões do usuário
  const visibleTabs = allTabs.filter(tab => allowedTabIds.includes(tab.id));

  if (loadingRole) {
    return (
      <div className="flex flex-col min-h-screen bg-[#03060b] text-zinc-100 font-sans">
        <header className="shrink-0 h-16 border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex items-center justify-between px-6 z-30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-4 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-2xl">
            <Layers size={14} className="text-red-600" />
            <h1 className="text-xs font-black uppercase tracking-[0.3em] text-white/95 whitespace-nowrap">
              Central de <span className="text-red-500 font-black">Compras</span>
            </h1>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center text-white/20 font-black uppercase tracking-widest animate-pulse">
          Verificando permissões...
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#03060b] text-zinc-100 font-sans">
      {/* HUD Header */}
      <header className="shrink-0 h-16 border-b border-white/5 bg-[#050101]/80 backdrop-blur-xl flex items-center justify-between px-6 z-30 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-4 px-4 py-2 bg-white/[0.03] border border-white/10 rounded-2xl">
          <Layers size={14} className="text-red-600" />
          <h1 className="text-xs font-black uppercase tracking-[0.3em] text-white/95 whitespace-nowrap">
            Central de <span className="text-red-500 font-black">Compras</span>
          </h1>
        </div>
      </header>

      {/* Tabs Selector Navigation */}
      {visibleTabs.length > 1 && (
        <div className="shrink-0 border-b border-white/5 bg-[#03060b] flex flex-wrap items-center gap-x-2 gap-y-2 px-6 py-3 z-[100] relative">
          <div className="flex flex-wrap items-center gap-2 bg-white/5 p-1 rounded-2xl border border-white/10">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => handleNavigateToTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all font-bold text-xs uppercase tracking-wider cursor-pointer ${
                    isActive 
                      ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' 
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Tab Content */}
      <main className="flex-1 w-full overflow-y-auto px-6 py-8">
        <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">
          
          {activeTab === 'radar' && (
            <RadarTab />
          )}

          {activeTab === 'calculator' && allowedTabIds.includes('calculator') && (
            <CalculatorTab initialParams={calculatorParams} />
          )}

          {activeTab === 'facebook' && allowedTabIds.includes('facebook') && (
            <FacebookTab onNavigateToTab={handleNavigateToTab} userEmail={userEmail} role={role} />
          )}

          {activeTab === 'alerts' && allowedTabIds.includes('alerts') && (
            <AlertsTab />
          )}

          {activeTab === 'import' && allowedTabIds.includes('import') && (
            <ImportTab />
          )}

          {activeTab === 'admin' && allowedTabIds.includes('admin') && (
            <AdminTab />
          )}

        </div>
      </main>
    </div>
  );
}
