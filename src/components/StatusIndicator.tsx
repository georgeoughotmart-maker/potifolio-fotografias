import React, { useState, useEffect } from 'react';

export default function StatusIndicator() {
  const [status, setStatus] = useState<{
    supabaseConnected: boolean;
    errorDetail: string | null;
    version: string;
    loading: boolean;
    setupGuide: any;
  }>({
    supabaseConnected: false,
    errorDetail: null,
    version: '',
    loading: true,
    setupGuide: null
  });

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('API Error');
      const data = await res.json();
      setStatus({
        supabaseConnected: !!data.supabaseConnected,
        errorDetail: data.errorDetail || null,
        version: data.version || '0.0.0',
        loading: false,
        setupGuide: data.setupGuide || null
      });
    } catch (e) {
      console.error('Status check failed:', e);
      setStatus(prev => ({ ...prev, loading: false, errorDetail: 'Erro ao conectar com a API' }));
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  const [showHelp, setShowHelp] = useState(false);

  if (status.loading) return null;

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-black/80 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-full text-[10px] text-white/60">
        <div 
          className={`w-2 h-2 rounded-full ${status.supabaseConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
        />
        <span>v{status.version}</span>
        {status.errorDetail && (
          <button 
            onClick={() => setShowHelp(true)}
            className="underline hover:text-white transition-colors"
          >
            {status.supabaseConnected ? 'Ver Aviso' : 'Como Corrigir?'}
          </button>
        )}
      </div>

      {showHelp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
          <div className="bg-[#111] border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl">
            <h3 className="text-white font-medium mb-4 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Status do Sistema
            </h3>
            
            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-lg mb-6">
              <p className="text-red-400 text-xs leading-relaxed">
                {status.errorDetail}
              </p>
            </div>

            {status.setupGuide && (
              <div className="space-y-4 mb-6">
                <p className="text-white/40 text-[10px] uppercase tracking-wider font-bold">Guia de Configuração</p>
                {Object.values(status.setupGuide).map((step: any, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className="bg-white/5 text-white/40 w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0">{i+1}</span>
                    <p className="text-white/80 text-xs">{step}</p>
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={() => setShowHelp(false)}
              className="w-full bg-white text-black py-2 rounded-xl text-xs font-bold hover:bg-white/90 transition-colors"
            >
              Entendi, vou verificar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
