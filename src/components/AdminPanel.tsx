import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trash2, Plus, Upload, LogOut, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';

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

  useEffect(() => {
    const savedPass = localStorage.getItem('admin_pass');
    if (savedPass) {
      setPassword(savedPass);
      setIsLoggedIn(true);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      localStorage.setItem('admin_pass', password);
      fetchClients();
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
        const err = await res.json().catch(() => ({ error: `Erro ${status} no servidor` }));
        alert(err.error || `Erro ${status}: Senha incorreta`);
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
    const formData = new FormData();
    Array.from(e.target.files).forEach(file => {
      formData.append('photos', file as File);
    });

    const res = await fetch(`/api/admin/upload/${selectedClient}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${password}` },
      body: formData
    });

    if (res.ok) {
      fetchPhotos(selectedClient);
    } else {
      const err = await res.json();
      alert(err.error);
    }
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

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#141414] p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-zinc-900 p-8 rounded-xl w-full max-w-md border border-zinc-800"
        >
          <h1 className="text-2xl font-bold text-white mb-6 text-center font-display">Painel Administrativo</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Senha de Acesso</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white focus:outline-none focus:border-red-600 transition-colors"
                placeholder="Digite a senha..."
                required
              />
            </div>
            <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors">
              Entrar
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-zinc-900 border-r border-zinc-800 p-6 flex flex-col">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-xl font-bold font-display text-red-600">ADMIN</h2>
          <button onClick={() => setIsLoggedIn(false)} className="text-zinc-500 hover:text-white">
            <LogOut size={20} />
          </button>
        </div>

        <div className="mb-8">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-4">Novo Cliente</h3>
          <form onSubmit={createClient} className="flex gap-2">
            <input 
              type="text" 
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="Nome do cliente"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-red-600"
              required
            />
            <button className="bg-red-600 p-2 rounded-lg hover:bg-red-700 transition-colors">
              <Plus size={20} />
            </button>
          </form>
          <p className="text-[10px] text-zinc-600 mt-2">Máximo de 4 clientes permitidos.</p>
        </div>

        <div className="flex-1 overflow-y-auto">
          <h3 className="text-xs uppercase tracking-widest text-zinc-500 font-bold mb-4">Clientes ({clients.length}/4)</h3>
          <div className="space-y-2">
            {clients.map(client => (
              <div 
                key={client.id}
                onClick={() => fetchPhotos(client.id)}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${selectedClient === client.id ? 'bg-red-600/10 border border-red-600/50' : 'bg-zinc-800/50 hover:bg-zinc-800 border border-transparent'}`}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm">{client.name}</span>
                  <span className="text-[10px] text-zinc-500">{client.id}</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteClient(client.id); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-500 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 md:p-10 overflow-y-auto">
        {selectedClient ? (
          <div>
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
              <div>
                <h2 className="text-3xl font-bold font-display">{clients.find(c => c.id === selectedClient)?.name}</h2>
                <div className="flex items-center gap-2 text-zinc-500 mt-1 text-sm">
                  <LinkIcon size={14} />
                  <span className="select-all">/portfolio/{selectedClient}</span>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold cursor-pointer transition-colors ${uploading ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-black hover:bg-zinc-200'}`}>
                  <Upload size={20} />
                  {uploading ? 'Enviando...' : 'Fazer Upload'}
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleUpload}
                    disabled={uploading || photos.length >= 30}
                  />
                </label>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm text-zinc-500">{photos.length} de 30 fotos utilizadas</span>
              {photos.length >= 30 && <span className="text-xs text-red-500 font-bold">Limite atingido</span>}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {photos.map((photo, index) => (
                <div key={photo.name} className="relative aspect-[2/3] group rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
                  <img src={photo.url} alt="" className="w-full h-full object-cover" />
                  
                  {/* Number Badge - Enhanced Visibility */}
                  <div className="absolute top-0 left-0 w-full h-10 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />
                  <div className="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold w-6 h-6 flex items-center justify-center rounded-md shadow-lg border border-red-500/50 z-20">
                    {index + 1}
                  </div>

                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={() => deletePhoto(photo.name)}
                      className="bg-red-600 p-3 rounded-full hover:bg-red-700 transition-transform hover:scale-110"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
              {photos.length === 0 && (
                <div className="col-span-full py-20 flex flex-col items-center justify-center text-zinc-600 border-2 border-dashed border-zinc-800 rounded-xl">
                  <ImageIcon size={48} className="mb-2 opacity-20" />
                  <p>Nenhuma foto enviada ainda.</p>
                </div>
              )}
            </div>
          </div>
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
