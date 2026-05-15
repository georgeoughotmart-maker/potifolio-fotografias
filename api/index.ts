import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

// Load .env if it exists (local dev), but don't fail if it doesn't (Vercel)
dotenv.config();

// Global error handlers to prevent process crashes
process.on('uncaughtException', (err) => {
  console.error('>>> [CRITICAL] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('>>> [CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware de log para depuração
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  app.use(express.json());

  // Global environment variable helper
  const getVar = (name: string) => {
    const aliases: Record<string, string[]> = {
      'SUPABASE_URL': ['SUPABASE_URL', 'URL_DO_SUPABASE', 'URL_SUPABASE', 'NEXT_PUBLIC_SUPABASE_URL'],
      'SUPABASE_SERVICE_ROLE_KEY': ['SUPABASE_SERVICE_ROLE_KEY', 'CHAVE_DO_SUPABASE', 'CHAVE_SUPABASE', 'SUPABASE_KEY', 'SUPABASE_ANON_KEY'],
      'ADMIN_PASSWORD': ['ADMIN_PASSWORD', 'SENHA_DE_ADMINISTRADOR', 'SENHA_ADMIN', 'SENHA_ADMINISTRADOR', 'ENSAIO']
    };

    const variants = (aliases[name] || [name]);
    const allKeys = Object.keys(process.env);
    let value: string | null = null;
    let foundSource: string | null = null;
    
    // Log finding keys (unmasked keys names, masked values)
    if (name === 'SUPABASE_URL') {
      const found = allKeys.filter(k => variants.some(v => v.toUpperCase() === k.toUpperCase()));
      if (found.length > 0) {
        console.log(`>>> [CONFIG] Found keys for ${name}:`, found);
      }
    }

    // 1. Precise match
    for (const v of variants) {
      if (process.env[v]) {
        value = process.env[v]!.trim();
        foundSource = v;
        break;
      }
    }
    
    // 2. Case-insensitive search
    if (!value) {
      const foundKey = allKeys.find(k => variants.some(v => v.toUpperCase() === k.toUpperCase()));
      if (foundKey) {
        value = process.env[foundKey]!.trim();
        foundSource = foundKey;
      }
    }

    if (value) {
      // 1. Remove quotes
      value = value.replace(/^["']|["']$/g, '');
      
      // 2. Remove ANY whitespace
      value = value.replace(/\s/g, '').replace(/\u00A0/g, '');
      
      // 3. Remove non-printable / invisible characters
      value = value.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '');

      if (name === 'SUPABASE_URL') {
        // RADICAL cleanup - only URL allowed chars
        value = value.replace(/[^a-zA-Z0-9.\-:/]/g, '');
        
        // Fix if only ID pasted
        if (value.length >= 15 && value.length <= 30 && !value.includes('.')) {
          value = `https://${value.toLowerCase()}.supabase.co`;
        }

        // Remove path suffixes
        value = value.replace(/\/+$/, '')
                     .split('/rest/v1')[0]
                     .split('/auth/v1')[0]
                     .split('/storage/v1')[0]
                     .split('/api/v1')[0];
        
        if (value.includes('supabase.co') && !value.includes('://')) {
          value = `https://${value}`;
        }
        
        try {
          const urlObj = new URL(value.includes('://') ? value : `https://${value}`);
          value = urlObj.origin;
        } catch (e) {
          value = value.replace(/^(https?:\/\/)+/i, '');
          if (value) value = `https://${value}`;
        }
        
        console.log(`>>> [CONFIG] ${name} Final: "${value}"`);
      }
    }
    
    return { value, source: foundSource };
  };

  const getVarValue = (name: string) => getVar(name).value;
  const getVarSource = (name: string) => getVar(name).source;

  // Supabase Configuration (Lazy Initialization with extreme safety)
  let supabaseClient: any = null;
  let lastUsedUrl: string | null = null;
  let lastUsedKey: string | null = null;

  const getSupabase = () => {
    try {
      const url = getVarValue('SUPABASE_URL');
      const key = getVarValue('SUPABASE_SERVICE_ROLE_KEY');
      
      if (!url || !key) return null;

      // Re-initialize if environment variables changed (rare but possible in some environments)
      if (!supabaseClient || url !== lastUsedUrl || key !== lastUsedKey) {
        supabaseClient = createClient(url, key);
        lastUsedUrl = url;
        lastUsedKey = key;
      }
      return supabaseClient;
    } catch (e) {
      console.error(">>> [SUPABASE INITIALIZATION ERROR]", e);
      return null;
    }
  };

// Health check
app.get("/api/health", async (req, res) => {
  let supabaseConnected = false;
  let errorDetail = null;
  let supabaseUrl = null;
  
  try {
    supabaseUrl = getVarValue('SUPABASE_URL');
    const key = getVarValue('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !key) {
      const missing = [];
      if (!supabaseUrl) missing.push('URL_DO_SUPABASE');
      if (!key) missing.push('CHAVE_DO_SUPABASE');
      
      errorDetail = `Configuração incompleta. Faltando: ${missing.join(' e ')}. `;
      errorDetail += `Verifique se as chaves foram adicionadas corretamente no painel de Secrets ou na Vercel.`;
    } else {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { error: dbError } = await supabase.from('clients').select('id').limit(1);
          if (dbError) {
            errorDetail = `Erro retornado pelo Supabase: ${dbError.message}`;
            if (dbError.message.includes('getaddrinfo ENOTFOUND')) {
              errorDetail = `ERRO DE DNS: O endereço "${supabaseUrl}" não foi encontrado. Verifique se a URL do projeto Supabase está correta.`;
            }
          } else {
            supabaseConnected = true;
          }
        } catch (fetchErr: any) {
          console.error(">>> [HEALTH CHECK FETCH ERROR]", fetchErr);
          const msg = fetchErr.message || String(fetchErr);
          const cause = fetchErr.cause ? String(fetchErr.cause) : "";
          
          if (msg.includes('ENOTFOUND') || cause.includes('ENOTFOUND')) {
            errorDetail = `URL NÃO ENCONTRADA (DNS): O endereço "${supabaseUrl}" não existe no sistema da Supabase. `;
            errorDetail += `Verifique se o ID "${supabaseUrl?.split('//')[1]?.split('.')[0]}" está correto. `;
            errorDetail += `Isso acontece se o projeto foi deletado, pausado ou se houve erro de digitação.`;
          } else if (msg.includes('fetch failed')) {
            errorDetail = `FALHA DE CONEXÃO: O servidor não conseguiu alcançar o Supabase ("${supabaseUrl}"). `;
            if (supabaseUrl.includes('supabase.co')) {
              errorDetail += "DICA: Verifique se o projeto não está PAUSADO no Dashboard do Supabase.";
            }
            if (cause) errorDetail += ` (Causa: ${cause})`;
          } else {
            errorDetail = "Erro de rede ao acessar Supabase: " + msg;
          }
        }
      } else {
        errorDetail = "Erro técnico ao carregar o cliente do banco de dados.";
      }
    }
  } catch (e: any) {
    errorDetail = "Erro interno crítico no servidor: " + e.message;
  }
  
  const passSource = getVarSource('ADMIN_PASSWORD') || 'Padrão (admin123)';

  res.json({ 
    status: "ok", 
    supabaseConnected,
    errorDetail,
    version: "2.4.2",
    passwordSource: passSource,
    currentUrl: supabaseUrl || "Não configurado",
    diagnostic: {
      projectId: supabaseUrl?.split('//')[1]?.split('.')[0] || null,
      hasKey: !!getVarValue('SUPABASE_SERVICE_ROLE_KEY'),
      envSource: getVarSource('SUPABASE_URL')
    },
    setupGuide: !supabaseConnected ? {
      dns_error: errorDetail?.includes('ENOTFOUND') ? "A URL não foi encontrada no DNS. Verifique se o ID do projeto no Supabase está correto." : null,
      paused_error: errorDetail?.includes('fetch failed') ? "O projeto pode estar pausado ou o Supabase com instabilidade." : null,
      step1: "Se despausou agora, o DNS pode levar até 15 min para propagar.",
      step2: "Confirme se o ID do projeto exibido no diagnóstico acima é o correto.",
      step3: "Verifique se você copiou a 'service_role' key (chave longa), não a 'anon'.",
      step4: "Clique em 'Redeploy' na Vercel para forçar o reinício da conexão.",
    } : null
  });
});

  // Admin Auth Middleware
  const getAdminPassword = () => {
    return getVarValue('ADMIN_PASSWORD') || "admin123";
  };

  app.post("/api/admin/verify", (req, res) => {
    console.log(">>> [AUTH] Verify attempt");
    try {
      const { password } = req.body;
      const currentPassword = getAdminPassword();
      const passSource = getVarSource('ADMIN_PASSWORD') || 'Padrão (admin123)';
      
      console.log(">>> [AUTH] Check:", { 
        providedLength: password ? String(password).length : 0, 
        expectedLength: currentPassword ? String(currentPassword).length : 0,
        match: String(password) === String(currentPassword),
        source: passSource
      });

      if (!password) {
        return res.status(400).json({ error: "Senha é obrigatória" });
      }

      if (String(password) === String(currentPassword)) {
        console.log(">>> [AUTH] Success");
        res.json({ success: true });
      } else {
        console.log(">>> [AUTH] Failed: Password mismatch");
        res.status(401).json({ 
          error: "Senha incorreta", 
          source: passSource,
          hint: passSource !== 'Padrão (admin123)' ? `A senha atual é o valor da variável ${passSource} na Vercel.` : "A senha padrão é admin123"
        });
      }
    } catch (err: any) {
      console.error(">>> [AUTH] Error:", err);
      res.status(500).json({ error: `Erro interno de autenticação: ${err.message}` });
    }
  });

  const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    if (authHeader === `Bearer ${getAdminPassword()}`) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  // Helper to get clients from Supabase
  const getClients = async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) return [];
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('createdAt', { ascending: false });
      
      if (error) {
        console.error("Error fetching clients:", error);
        throw new Error(`Falha ao buscar clientes: ${error.message} (${error.code || 'sem código'})`);
      }
      return data || [];
    } catch (e: any) {
      console.error("Critical error in getClients:", e);
      throw e; // Relançar para que a rota capture
    }
  };

  // Helper for settings from Supabase
  const getSettings = async () => {
    try {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase não inicializado");

      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'branding')
        .single();
      
      if (error && error.code !== 'PGRST116') {
        console.error("Error fetching settings from DB:", error);
        throw new Error(`Falha ao buscar configurações: ${error.message}`);
      }
      return data?.value || { logo: null };
    } catch (e: any) {
      console.error("Critical error in getSettings:", e);
      throw e;
    }
  };

  // Multer Config
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // Setup Storage Bucket
  app.post("/api/admin/setup-storage", authMiddleware, async (req, res) => {
    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Supabase não configurado" });

      const { data, error } = await supabase.storage.createBucket('photos', {
        public: true,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        fileSizeLimit: 5242880 // 5MB
      });

      if (error) {
        // If it already exists, just return success
        if (error.message.includes('already exists')) {
          return res.json({ success: true, message: "Bucket já existe" });
        }
        return res.status(500).json({ error: error.message });
      }

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  // Branding Routes
  app.get("/api/settings", async (req, res) => {
    try {
      const settings = await getSettings();
      res.json(settings);
    } catch (err: any) {
      console.error("Settings route error:", err);
      // Return default branding if DB fails but server is up
      res.json({ logo: null });
    }
  });

  app.post("/api/admin/settings/logo", authMiddleware, upload.single("logo"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Supabase não configurado" });

      const ext = path.extname(req.file.originalname);
      const filename = `branding/logo${ext}`;
      
      const { data, error } = await supabase.storage
        .from('photos')
        .upload(filename, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true
        });

      if (error) return res.status(500).json({ error: error.message });

      const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(filename);

      const { error: dbError } = await supabase
        .from('settings')
        .upsert({ key: 'branding', value: { logo: publicUrl } });

      if (dbError) return res.status(500).json({ error: dbError.message });

      res.json({ logo: publicUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create Client
  app.post("/api/admin/clients", authMiddleware, async (req, res) => {
    const { name } = req.body;
    const clientId = uuidv4().slice(0, 8);
    
    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Supabase não configurado" });

      const { data, error } = await supabase
        .from('clients')
        .insert([{ id: clientId, name, createdAt: new Date() }])
        .select()
        .single();

      if (error) return res.status(500).json({ error: error.message });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get Clients
  app.get("/api/admin/clients", authMiddleware, async (req, res) => {
    try {
      const clients = await getClients();
      res.json(clients);
    } catch (err: any) {
      console.error("Admin clients route error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Client
  app.delete("/api/admin/clients/:id", authMiddleware, async (req, res) => {
    const { id } = req.params;
    
    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Supabase não configurado" });

      // Delete photos from storage first
      const { data: files } = await supabase.storage.from('photos').list(id);
      if (files && files.length > 0) {
        await supabase.storage.from('photos').remove(files.map(f => `${id}/${f.name}`));
      }

      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) return res.status(500).json({ error: error.message });

      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Upload Photos
  app.post("/api/admin/upload/:client", authMiddleware, upload.array("photos", 30), async (req, res) => {
    const { client } = req.params;
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) return res.status(400).json({ error: "Nenhuma foto enviada" });

    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Supabase não configurado" });

      // Tenta garantir que o bucket existe antes de subir
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find(b => b.name === 'photos')) {
        await supabase.storage.createBucket('photos', { public: true });
      }

      for (const file of files) {
        const ext = path.extname(file.originalname);
        const filename = `${client}/${uuidv4()}${ext}`;
        
        const { error } = await supabase.storage
          .from('photos')
          .upload(filename, file.buffer, {
            contentType: file.mimetype,
            upsert: true
          });
        
        if (error) {
          console.error("Erro no upload do arquivo:", error);
          const msg = error.message || "Erro desconhecido";
          const hint = msg.includes("security policy") ? "Erro de Permissão (RLS). Use a chave 'service_role'." : "";
          throw new Error(`Erro ao subir ${file.originalname}: ${msg} ${hint}`);
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Erro geral no upload:", err);
      res.status(500).json({ error: err.message || "Erro desconhecido no upload" });
    }
  });

  // Delete Photo
  app.delete("/api/admin/photos/:client/:filename", authMiddleware, async (req, res) => {
    const { client, filename } = req.params;
    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Supabase não configurado" });

      const { error } = await supabase.storage.from('photos').remove([`${client}/${filename}`]);
      
      if (error) return res.status(500).json({ error: error.message });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Public: Get Client Info & Photos
  app.get("/api/client/:id", async (req, res) => {
    const id = String(req.params.id).trim();
    console.log(`>>> [PORTFOLIO] Request for ID: "${id}"`);
    
    try {
      const supabase = getSupabase();
      if (!supabase) return res.status(503).json({ error: "Serviço temporariamente indisponível (Supabase não configurado)" });

      const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (!client || error) {
        console.warn(`>>> [PORTFOLIO] Client not found: "${id}". Error:`, error);
        // Fetch list of available IDs for debugging
        const { data: allClients } = await supabase.from('clients').select('id');
        const availableIds = (allClients || []).map(c => c.id);
        
        return res.status(404).json({ 
          error: "Portfólio não encontrado",
          debug: {
            requestedId: id,
            availableIds: availableIds,
            supabaseError: error?.message || null
          }
        });
      }

      console.log(`>>> [PORTFOLIO] Found client: ${client.name}. Listing files...`);
      const { data: files, error: storageError } = await supabase.storage.from('photos').list(id);
      
      if (storageError) {
        console.error(">>> [PORTFOLIO] Error listing storage:", storageError);
      }

      const photos = (files || [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => ({
          url: supabase.storage.from('photos').getPublicUrl(`${id}/${f.name}`).data.publicUrl,
          name: f.name
        }));

      console.log(`>>> [PORTFOLIO] Success. Photos found: ${photos.length}`);
      res.json({ ...client, photos });
    } catch (err: any) {
      console.error(">>> [PORTFOLIO] Critical error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  const distPath = path.join(process.cwd(), 'dist');
  const indexHtmlInDist = path.join(distPath, 'index.html');
  const indexHtmlInRoot = path.join(process.cwd(), 'index.html');

  // Serve static files from 'dist' if they exist
  if (fs.existsSync(distPath)) {
    console.log(`>>> [SERVER] Serving static files from: ${distPath}`);
    try {
      const files = fs.readdirSync(distPath);
      console.log(`>>> [SERVER] Files in dist:`, files);
    } catch (e) {}
    app.use(express.static(distPath));
  }

  // Vite middleware for development (ONLY if dist doesn't exist or we are explicitly in dev)
  const isDev = process.env.NODE_ENV !== "production" && !process.env.VERCEL;
  
  if (isDev && !fs.existsSync(distPath)) {
    console.log(">>> [SERVER] Starting Vite middleware (Dev Mode)...");
    try {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error(">>> [SERVER] Vite failed to load:", e);
    }
  }

  // SPA Fallback
  app.get('*', (req, res) => {
    // Basic API 404
    if (req.url.startsWith('/api')) {
      return res.status(404).json({ error: "API route not found" });
    }

    if (fs.existsSync(indexHtmlInDist)) {
      res.sendFile(indexHtmlInDist);
    } else if (fs.existsSync(indexHtmlInRoot)) {
      res.sendFile(indexHtmlInRoot);
    } else {
      res.status(404).send("Error: index.html not found. Check build output.");
    }
  });

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global error:", err);
    res.status(500).json({ error: err.message || "Erro interno do servidor" });
  });

  return app;
}

const appPromise = startServer();

// Export the app for Vercel's serverless environment
export default async (req: any, res: any) => {
  const app = await appPromise;
  return app(req, res);
};

// Control process: Listen if not on Vercel
if (!process.env.VERCEL) {
  appPromise.then(app => {
    const PORT = process.env.PORT || 3000;
    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`>>> [SERVER] Running on http://0.0.0.0:${PORT}`);
    });
  });
}
