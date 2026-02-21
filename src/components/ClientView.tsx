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

  useEffect(() => {
    fetch(`/api/client/${clientId}`)
      .then(res => res.json())
      .then(data => {
        setClient(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
    <div className="min-h-screen flex items-center justify-center bg-[#141414]">
      <div className="w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!client) return (
    <div className="min-h-screen flex items-center justify-center bg-[#141414] text-white">
      <h1 className="text-2xl font-display">Portfólio não encontrado</h1>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#141414] text-white p-4 md:p-8 no-select">
      <header className="mb-12">
        <h1 className="text-red-600 text-4xl font-bold font-display tracking-tighter mb-2">CINEPORT</h1>
        <p className="text-zinc-400 uppercase tracking-widest text-sm font-medium">Portfólio Exclusivo: {client.name}</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {client.photos.map((photo, index) => (
          <motion.div
            key={photo.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="relative aspect-[2/3] group cursor-pointer overflow-hidden rounded-md bg-zinc-900 shadow-lg"
            onClick={() => setSelectedPhoto(photo)}
          >
            <img
              src={photo.url}
              alt={photo.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
              draggable={false}
            />
            
            {/* Number Badge - Enhanced Visibility */}
            <div className="absolute top-0 left-0 w-full h-12 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />
            <div className="absolute top-3 left-3 bg-red-600 text-white text-sm font-bold w-8 h-8 flex items-center justify-center rounded-lg shadow-lg border border-red-500/50 z-20">
              {index + 1}
            </div>

            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Maximize2 className="text-white w-8 h-8" />
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
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10 text-white font-bold">
              Foto #{client.photos.findIndex(p => p.name === selectedPhoto.name) + 1}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
