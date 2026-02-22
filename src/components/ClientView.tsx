import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2 } from 'lucide-react';

interface Photo {
  url: string;
  name: string;
}

interface ClientData {
  id: string;
  name: string;
  photos: Photo[];
}

export default function ClientView() {
  const { clientId } = useParams();
  const [client, setClient] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [logo, setLogo] = useState<string | null>(null);

  const [error, setError] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [clientRes, settingsRes] = await Promise.all([
          fetch(`/api/client/${clientId}`),
          fetch('/api/settings')
        ]);
        
        if (clientRes.ok) {
          const clientData = await clientRes.json();
          setClient(clientData);
        } else {
          const errData = await clientRes.json();
          setError(errData);
        }
        
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setLogo(settingsData.logo);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError({ error: 'Erro de conexão' });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [clientId]);

  // Security: Disable right click
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-white p-6 text-center">
      <h1 className="text-3xl font-display font-bold mb-4">Portfólio não encontrado</h1>
      <p className="text-zinc-500 mb-8 max-w-md">O link que você acessou pode estar incorreto ou o portfólio foi removido.</p>
      
      {error?.debug && (
        <div className="bg-zinc-900/50 p-6 rounded-2xl border border-white/5 text-left font-mono text-xs max-w-lg w-full">
          <p className="text-red-500 mb-2 uppercase tracking-widest font-bold">Debug Info:</p>
          <p className="text-zinc-400 mb-1">ID Solicitado: <span className="text-white">{error.debug.requestedId}</span></p>
          <p className="text-zinc-400">IDs Disponíveis: <span className="text-white">{error.debug.availableIds.join(', ') || 'Nenhum'}</span></p>
        </div>
      )}
      
      <button 
        onClick={() => window.location.href = '/admin'}
        className="mt-10 px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm transition-all"
      >
        Voltar para o Início
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4 md:p-12 no-select font-sans">
      <header className="mb-16 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          {logo ? (
            <img src={logo} alt="Studio Logo" className="h-16 md:h-20 object-contain mb-6" />
          ) : (
            <h1 className="text-red-600 text-5xl font-bold font-display tracking-tighter mb-4">STUDIO</h1>
          )}
          <div className="h-px w-24 bg-red-600 mb-6" />
          <h2 className="text-zinc-500 uppercase tracking-[0.3em] text-xs font-bold">Portfólio Exclusivo</h2>
          <p className="text-3xl md:text-5xl font-display font-light mt-2 tracking-tight">{client.name}</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-zinc-600 text-[10px] uppercase tracking-widest">Acesso Privado</p>
          <p className="text-zinc-400 text-xs font-mono mt-1">{new Date().toLocaleDateString('pt-BR')}</p>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
        {client.photos.map((photo, index) => (
          <motion.div
            key={photo.name}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.03 }}
            className="relative aspect-[2/3] group cursor-pointer overflow-hidden rounded-xl bg-zinc-900 shadow-2xl border border-white/5"
            onClick={() => setSelectedPhoto(photo)}
          >
            <img
              src={photo.url}
              alt={photo.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
              draggable={false}
            />
            
            {/* Branding Overlay on Photo */}
            {logo && (
              <div className="absolute bottom-3 right-3 opacity-30 group-hover:opacity-60 transition-opacity pointer-events-none">
                <img src={logo} alt="" className="h-6 object-contain grayscale brightness-200" />
              </div>
            )}

            {/* Number Badge */}
            <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />
            <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md text-white text-[10px] font-bold w-7 h-7 flex items-center justify-center rounded-full border border-white/20 z-20">
              {String(index + 1).padStart(2, '0')}
            </div>

            <div className="absolute inset-0 bg-red-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="bg-white/10 backdrop-blur-xl p-3 rounded-full border border-white/20 transform translate-y-4 group-hover:translate-y-0 transition-transform">
                <Maximize2 className="text-white w-5 h-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {client.photos.length === 0 && (
        <div className="text-center py-20 text-zinc-500">
          Nenhuma foto disponível neste portfólio.
        </div>
      )}

      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4"
            onClick={() => setSelectedPhoto(null)}
          >
            <button 
              className="absolute top-6 right-6 text-white/70 hover:text-white transition-colors"
              onClick={() => setSelectedPhoto(null)}
            >
              <X size={40} />
            </button>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={selectedPhoto.url}
              alt={selectedPhoto.name}
              className="max-w-full max-h-full object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
            />
            
            {/* Modal Logo Watermark */}
            {logo && (
              <div className="absolute bottom-10 right-10 opacity-20 pointer-events-none hidden md:block">
                <img src={logo} alt="" className="h-12 object-contain grayscale brightness-200" />
              </div>
            )}

            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-white/5 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 text-white/80 font-mono text-sm tracking-widest">
              FOTO #{String(client.photos.findIndex(p => p.name === selectedPhoto.name) + 1).padStart(2, '0')}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
