import React, { useState, useEffect } from 'react';

export default function StatusIndicator() {
  const [status, setStatus] = useState<{
    supabaseConnected: boolean;
    errorDetail: string | null;
    version: string;
    loading: boolean;
  }>({
    supabaseConnected: false,
    errorDetail: null,
    version: '',
    loading: true
  });

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      setStatus({
        supabaseConnected: data.supabaseConnected,
        errorDetail: data.errorDetail,
        version: data.version,
        loading: false
      });
    } catch (e) {
      setStatus(prev => ({ ...prev, loading: false, errorDetail: 'Erro ao conectar com a API' }));
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30s
    return () => clearInterval(interval);
  }, []);

  if (status.loading) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 bg-black/80 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-full text-[10px] text-white/60">
      <div 
        className={`w-2 h-2 rounded-full ${status.supabaseConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
      />
      <span>v{status.version}</span>
      {status.errorDetail && (
        <button 
          onClick={() => alert(status.errorDetail)}
          className="underline hover:text-white transition-colors"
        >
          Ver Erro
        </button>
      )}
    </div>
  );
}
