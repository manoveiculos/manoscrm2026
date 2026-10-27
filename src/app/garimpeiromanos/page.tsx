'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { OlxTab } from '@/app/compras/components/OlxTab';
import { 
  Flame, 
  Lock, 
  ExternalLink, 
  ArrowLeft, 
  Copy, 
  Check, 
  ShieldCheck, 
  Sparkles,
  Layers
} from 'lucide-react';

export default function GarimpeiroManosPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center bg-[#03060b] text-white/20 font-black uppercase tracking-widest animate-pulse h-screen">
        Carregando Garimpeiro Manos...
      </div>
    }>
      <GarimpeiroContent />
    </Suspense>
  );
}

function GarimpeiroContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<'admin' | 'consultant'>('consultant');
  const [copiadoUrl, setCopiadoUrl] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
          router.push('/login');
          return;
        }

        const email = user.email?.toLowerCase() || '';
        setUserEmail(email);

        // Verifica role do consultor
        const { data: consultant } = await supabase
          .from('consultants_manos_crm')
          .select('role')
          .or(`user_id.eq.${user.id},auth_id.eq.${user.id}`)
          .maybeSingle();

        const userRole = (consultant?.role === 'admin' || email === 'alexandre_gorges@hotmail.com') 
          ? 'admin' 
          : 'consultant';
        setRole(userRole);

        // Autorizado somente Alexandre Gorges e Felipe Ledra (e administradores do CRM)
        const isAlexandre = email === 'alexandre_gorges@hotmail.com';
        const isLedra = email === 'hgledra@hotmail.com';
        const isAdmin = userRole === 'admin';

        if (isAlexandre || isLedra || isAdmin) {
          setAutorizado(true);
        } else {
          setAutorizado(false);
        }
      } catch (err) {
        console.error('Erro ao verificar autenticação para o Garimpeiro:', err);
        setAutorizado(false);
      } finally {
        setLoading(false);
      }
    }

    checkAuth();
  }, [router]);

  const copiarLinkProducao = () => {
    const url = 'http://manoscrm.com.br/garimpeiromanos';
    navigator.clipboard.writeText(url);
    setCopiadoUrl(true);
    setTimeout(() => setCopiadoUrl(false), 2500);
  };

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen bg-[#03060b] text-zinc-100 items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs uppercase tracking-widest text-slate-400 font-bold">
            Carregando Garimpeiro Manos...
          </p>
        </div>
      </div>
    );
  }

  if (!autorizado) {
    return (
      <div className="flex flex-col min-h-screen bg-[#03060b] text-zinc-100 items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-500">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Acesso Restrito</h1>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              O módulo <strong>Garimpeiro Manos</strong> é exclusivo para os logins autorizados de <strong>Alexandre</strong> e <strong>Felipe Ledra</strong>.
            </p>
          </div>
          <div className="pt-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar para o Painel Geral
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#03060b] text-zinc-100">
      {/* Barra Superior Dedicada do Garimpeiro */}
      <header className="shrink-0 border-b border-white/5 bg-[#050101]/90 backdrop-blur-xl px-4 md:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-40 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3">
          <Link
            href="/compras"
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition border border-white/5"
            title="Voltar para Central de Compras"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center gap-2.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
            <Flame className="w-4 h-4 text-amber-500 fill-current" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-white">
                Garimpeiro <span className="text-amber-500">Manos</span>
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 font-black text-[9px] uppercase tracking-wider">
                Full View
              </span>
            </div>
          </div>
        </div>

        {/* Link Direto e Ações Rápidas */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Botão de Copiar Link de Produção */}
          <button
            type="button"
            onClick={copiarLinkProducao}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-amber-500/50 text-slate-300 hover:text-white text-xs font-semibold transition"
            title="Copiar URL de Produção"
          >
            {copiadoUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-bold">Link Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span className="hidden sm:inline">/garimpeiromanos</span>
                <span className="text-amber-400 text-[10px] font-bold">Copiar Link</span>
              </>
            )}
          </button>

          <Link
            href="/compras"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white text-xs font-semibold border border-white/10 transition"
          >
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Central de</span> Compras
          </Link>

          {/* Usuário Logado Autorizado */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span className="truncate max-w-[120px] sm:max-w-none">
              {userEmail === 'alexandre_gorges@hotmail.com' 
                ? 'Alexandre' 
                : userEmail === 'hgledra@hotmail.com' 
                ? 'Felipe Ledra' 
                : userEmail}
            </span>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal do Garimpeiro em Tela Cheia */}
      <main className="flex-1 p-4 md:p-8 max-w-[1600px] w-full mx-auto">
        <OlxTab userEmail={userEmail} role={role} />
      </main>
    </div>
  );
}
