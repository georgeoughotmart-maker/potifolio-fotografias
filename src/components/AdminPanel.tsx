import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trash2, Plus, Upload, LogOut, Link as LinkIcon, Image as ImageIcon, Maximize2 } from 'lucide-react';

interface Client {
  id: string;
  name: string;
  createdAt: string;
}

export default function AdminPanel() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [clients, setClients] = useState<Client[]>([]);
  const [newClientName, setNewClientName] = useState('');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [photos, setPhotos] = useState<{url: string, name: string}[]>([]);
  const [uploading, setUploading] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);

  useEffect(() => {
    const savedPass = localStorage.getItem('admin_pass');
    if (savedPass) {
      setPassword(savedPass);
      setIsLoggedIn(true);
    }
    fetchSettings();
  }, []);

  const [supabaseStatus, setSupabaseStatus] = useState<'loading' | 'connected' | 'error'>('loading');

  const fetchSettings = async () => {
    const res = await fetch('/api/settings');
    if (res.ok) {
      const data = await res.json();
      setLogo(data.logo);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const formData = new FormData();
    formData.append('logo', e.target.files[0]);

    const res = await fetch('/api/admin/settings/logo', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${password}` },
      body: formData
    });

    if (res.ok) {
      const data = await res.json();
      setLogo(data.logo);
      alert('Logo atualizada com sucesso!');
    }
  };

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/health');
        const data = await res.json();
        setSupabaseStatus(data.supabaseConnected ? 'connected' : 'error');
      } catch (e) {
        setSupabaseStatus('error');
      }
    };
    checkStatus();
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem('admin_pass', password);
      fetchClients();
      fetchSettings();
    }
  }, [isLoggedIn]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      if (res.ok) {
        setIsLoggedIn(true);
        fetchClients();
      } else {
        const status = res.status;
        let errorMessage = `Erro ${status}`;
        
        try {
          const text = await res.text();
          try {
            const err = JSON.parse(text);
            errorMessage = err.error || `Erro ${status}: Senha incorreta`;
          } catch (e) {
            // If not JSON, show the first 100 chars of the response
            errorMessage = `Erro ${status}: ${text.slice(0, 100)}...`;
          }
        } catch (e) {
          errorMessage = `Erro ${status}: Não foi possível ler a resposta do servidor.`;
        }
        
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
    }
  };

  const fetchClients = async () => {
    const res = await fetch('/api/admin/clients', {
      headers: { 'Authorization': `Bearer ${password}` }
    });
    if (res.ok) {
      const data = await res.json();
      setClients(data);
    } else {
      setIsLoggedIn(false);
    }
  };

  const createClient = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${password}` 
      },
      body: JSON.stringify({ name: newClientName })
    });
    if (res.ok) {
      setNewClientName('');
      fetchClients();
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  const deleteClient = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cliente e todas as suas fotos?')) return;
    const res = await fetch(`/api/admin/clients/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${password}` }
    });
    if (res.ok) {
      fetchClients();
      if (selectedClient === id) {
        setSelectedClient(null);
        setPhotos([]);
      }
    }
  };

  const fetchPhotos = async (clientId: string) => {
    const res = await fetch(`/api/client/${clientId}`);
    const data = await res.json();
    setPhotos(data.photos || []);
    setSelectedClient(clientId);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedClient || !e.target.files) return;
    
    setUploading(true);
    const files = Array.from(e.target.files);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('photos', file as File);

      try {
        const res = await fetch(`/api/admin/upload/${selectedClient}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${password}` },
          body: formData
        });

        if (res.ok) {
          successCount++;
        } else {
          const errorData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
          console.error('Upload failed:', errorData);
          failCount++;
        }
      } catch (error) {
        console.error('Upload error:', error);
        failCount++;
      }
      
      // Small delay between uploads to be safe on serverless
      if (i < files.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    if (failCount > 0) {
      alert(`${successCount} fotos enviadas, ${failCount} falharam.\n\nPossíveis causas:\n1. Foto maior que 4.5MB\n2. Formato não suportado (use JPG, PNG ou WEBP)\n3. Limite de 30 fotos atingido`);
    } else if (successCount > 0) {
      alert('Todas as fotos foram enviadas com sucesso!');
    }
    
    fetchPhotos(selectedClient);
    setUploading(false);
  };

  const deletePhoto = async (filename: string) => {
    if (!selectedClient) return;
    const res = await fetch(`/api/admin/photos/${selectedClient}/${filename}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${password}` }
    });
    if (res.ok) {
      fetchPhotos(selectedClient);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_pass');
    setIsLoggedIn(false);
    setPassword('');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-4 font-sans">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,#1a1a1a_0%,#0a0a0a_100%)] pointer-events-none" />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/50 backdrop-blur-xl p-10 rounded-3xl w-full max-w-md border border-white/5 shadow-2xl relative z-10"
        >
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center shadow-lg shadow-red-600/20 rotate-3">
              <ImageIcon className="text-white" size={32} />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 text-center font-display tracking-tight">STUDIO ADMIN</h1>
          <p className="text-zinc-500 text-center text-sm mb-10 uppercase tracking-[0.2em] font-medium">Acesso Restrito</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] uppercase tracking-widest text-zinc-500 font-bold ml-1">Senha de Segurança</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white focus:outline-none focus:border-red-600/50 focus:bg-white/10 transition-all text-center tracking-[0.5em] text-xl"
                placeholder="••••••"
                required
              />
            </div>
            <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-red-600/20 active:scale-[0.98]">
              AUTENTICAR
            </button>
          </form>
          
          <p className="text-center text-[10px] text-zinc-600 mt-10 uppercase tracking-widest">© 2024 Studio Photography</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col md:flex-row font-sans">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-[#0a0a0a] border-r border-white/5 p-8 flex flex-col relative z-20">
        <div className="mb-6 flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${supabaseStatus === 'connected' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : supabaseStatus === 'loading' ? 'bg-zinc-500 animate-pulse' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`} />
          <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">
            {supabaseStatus === 'connected' ? 'Supabase Online' : supabaseStatus === 'loading' ? 'Verificando...' : 'Supabase Offline'}
          </span>
        </div>
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center shadow-lg shadow-red-600/20">
              <ImageIcon size={18} className="text-white" />
            </div>
            <h2 className="text-xl font-bold font-display text-white tracking-tighter">STUDIO</h2>
          </div>
          <button onClick={handleLogout} className="text-zinc-600 hover:text-white transition-colors p-2 hover:bg-white/5 rounded-lg">
            <LogOut size={18} />
          </button>
        </div>

        <div className="mb-10">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-4">Identidade Visual</h3>
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5 shadow-inner">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">Logo Atual</span>
              <div className="h-10 w-20 bg-black/40 rounded-lg flex items-center justify-center border border-white/5 overflow-hidden">
                {logo ? (
                  <img src={logo} alt="Logo" className="max-h-full max-w-full object-contain p-1" />
                ) : (
                  <ImageIcon size={16} className="text-zinc-700" />
                )}
              </div>
            </div>
            <label className="block w-full text-center py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-[10px] uppercase tracking-widest font-bold cursor-pointer transition-all active:scale-95 border border-white/5">
              ATUALIZAR MARCA
              <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            </label>
          </div>
        </div>

        <div className="mb-10">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-4">Novo Cliente</h3>
          <form onSubmit={createClient} className="relative">
            <input 
              type="text" 
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Nome do cliente"
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-red-600/50 transition-all pr-12"
              required
            />
            <button className="absolute right-2 top-1/2 -translate-y-1/2 bg-red-600 p-2 rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-90">
              <Plus size={18} />
            </button>
          </form>
          <p className="text-[10px] text-zinc-600 mt-3 uppercase tracking-widest font-medium">Limite: 4 clientes</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-4">Clientes ({clients.length}/4)</h3>
          <div className="space-y-3">
            {clients.map(client => (
              <div 
                key={client.id}
                onClick={() => fetchPhotos(client.id)}
                className={`group flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${selectedClient === client.id ? 'bg-red-600 text-white shadow-lg shadow-red-600/20' : 'bg-white/5 hover:bg-white/10 border border-white/5'}`}
              >
                <div className="flex flex-col">
                  <span className={`font-bold text-sm ${selectedClient === client.id ? 'text-white' : 'text-zinc-200'}`}>{client.name}</span>
                  <span className={`text-[10px] font-mono ${selectedClient === client.id ? 'text-white/60' : 'text-zinc-500'}`}>{client.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => { e.stopPropagation(); window.open(`/portfolio/${client.id}`, '_blank'); }}
                    className={`transition-all ${selectedClient === client.id ? 'text-white/70 hover:text-white' : 'opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-white'}`}
                    title="Visualizar Portfólio"
                  >
                    <Maximize2 size={16} />
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteClient(client.id); }}
                    className={`transition-all ${selectedClient === client.id ? 'text-white/70 hover:text-white' : 'opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-500'}`}
                    title="Excluir Cliente"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-12 overflow-y-auto bg-[#0f0f0f]">
        {selectedClient ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            key={selectedClient}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-12 gap-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="bg-red-600/20 text-red-500 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Cliente Ativo</span>
                  <span className="text-zinc-600 text-[10px] font-mono">{selectedClient}</span>
                </div>
                <h2 className="text-4xl md:text-5xl font-bold font-display tracking-tight">{clients.find(c => c.id === selectedClient)?.name}</h2>
                <div className="flex items-center gap-3 text-zinc-500 mt-4 group cursor-pointer" onClick={() => {
                  const url = `${window.location.origin}/portfolio/${selectedClient}`;
                  navigator.clipboard.writeText(url);
                  alert('Link copiado!');
                }}>
                  <div className="bg-zinc-800 p-2 rounded-lg group-hover:bg-zinc-700 transition-colors">
                    <LinkIcon size={16} />
                  </div>
                  <span className="text-sm font-mono opacity-60 group-hover:opacity-100 transition-opacity">/portfolio/{selectedClient}</span>
                  <span className="text-[10px] bg-zinc-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">Copiar Link</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <button 
                  onClick={() => window.open(`/portfolio/${selectedClient}`, '_blank')}
                  className="flex items-center gap-3 px-8 py-4 rounded-xl font-bold bg-red-600 text-white hover:bg-red-700 transition-all shadow-xl shadow-red-600/20 active:scale-95"
                >
                  <Maximize2 size={20} />
                  <span className="text-sm">Abrir Portfólio</span>
                </button>

                <label className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold cursor-pointer transition-all shadow-xl ${uploading ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' : 'bg-white text-black hover:scale-105 active:scale-95'}`}>
                  <Upload size={20} className={uploading ? 'animate-bounce' : ''} />
                  <span className="text-sm">{uploading ? 'Enviando fotos...' : 'Adicionar Fotos'}</span>
                  <input 
                    type="file" 
                    multiple 
                    accept="image/jpeg,image/png,image/webp" 
                    className="hidden" 
                    onChange={handleUpload}
                    disabled={uploading || photos.length >= 30}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl">
                <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-1">Armazenamento</p>
                <div className="flex items-end gap-2">
                  <span className="text-3xl font-bold font-display">{photos.length}</span>
                  <span className="text-zinc-600 mb-1">/ 30 fotos</span>
                </div>
                <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-4 overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(photos.length / 30) * 100}%` }}
                    className={`h-full rounded-full ${photos.length >= 25 ? 'bg-red-600' : 'bg-zinc-400'}`}
                  />
                </div>
              </div>
              <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-zinc-500 text-xs uppercase tracking-widest font-bold mb-1">Status do Link</p>
                  <span className="text-emerald-500 font-bold flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    Online e Público
                  </span>
                </div>
                <button 
                  onClick={() => window.open(`/portfolio/${selectedClient}`, '_blank')}
                  className="bg-zinc-800 hover:bg-zinc-700 p-3 rounded-xl transition-colors"
                >
                  <Maximize2 size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {photos.map((photo, index) => (
                <div key={photo.name} className="relative aspect-[2/3] group rounded-2xl overflow-hidden bg-zinc-900 border border-white/5 shadow-xl">
                  <img src={photo.url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  
                  {/* Number Badge */}
                  <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10" />
                  <div className="absolute top-4 left-4 bg-white/10 backdrop-blur-md text-white text-[10px] font-bold w-7 h-7 flex items-center justify-center rounded-full border border-white/20 z-20">
                    {String(index + 1).padStart(2, '0')}
                  </div>

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center backdrop-blur-sm">
                    <button 
                      onClick={() => deletePhoto(photo.name)}
                      className="bg-red-600 p-4 rounded-full hover:bg-red-700 transition-all hover:scale-110 shadow-xl shadow-red-600/20 transform translate-y-4 group-hover:translate-y-0"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
              {photos.length === 0 && (
                <div className="col-span-full py-32 flex flex-col items-center justify-center text-zinc-700 border-2 border-dashed border-zinc-800/50 rounded-3xl bg-zinc-900/20">
                  <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-6 border border-zinc-800">
                    <ImageIcon size={32} className="opacity-20" />
                  </div>
                  <h4 className="text-lg font-medium text-zinc-500">Nenhuma foto neste portfólio</h4>
                  <p className="text-sm text-zinc-600 mt-1">Comece fazendo o upload das fotos do cliente.</p>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-600">
            <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mb-4">
              <Plus size={32} />
            </div>
            <h3 className="text-xl font-medium text-zinc-400">Selecione ou crie um cliente</h3>
            <p className="text-sm">Gerencie os portfólios privados a partir da barra lateral.</p>
          </div>
        )}
      </div>
    </div>
  );
}
