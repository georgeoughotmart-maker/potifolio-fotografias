import express from "express";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createServer as createViteServer } from "vite";

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

  // Supabase Configuration (Lazy Initialization with extreme safety)
  let supabaseClient: any = null;
  const getSupabase = () => {
    try {
      const url = (process.env.SUPABASE_URL || "").trim().replace(/^["']|["']$/g, '');
      const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "").trim().replace(/^["']|["']$/g, '');
      
      if (!url || !key) {
        return null;
      }

      if (!supabaseClient) {
        supabaseClient = createClient(url, key);
      }
      return supabaseClient;
    } catch (e) {
      console.error(">>> [SUPABASE ERROR]", e);
      return null;
    }
  };

  // Health check
  app.get("/api/health", async (req, res) => {
    let supabaseConnected = false;
    let errorDetail = null;
    
    try {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
      
      if (!url || !key) {
        errorDetail = "Configuração faltando (URL ou Chave)";
      } else {
        const supabase = getSupabase();
        if (supabase) {
          const { error } = await supabase.from('clients').select('id').limit(1);
          if (error) {
            errorDetail = `Erro na tabela: ${error.message}`;
            if (error.code === '42P01') errorDetail = "Tabela 'clients' não encontrada. Execute o SQL de criação.";
          } else {
            supabaseConnected = true;
          }
        } else {
          errorDetail = "Falha ao inicializar cliente Supabase";
        }
      }
    } catch (e: any) {
      errorDetail = e.message;
    }
    
    res.json({ 
      status: "ok", 
      supabaseConnected,
      errorDetail,
      timestamp: new Date().toISOString() 
    });
  });

  // Admin Auth Middleware
  const getAdminPassword = () => {
    try {
      const pass = (process.env.ADMIN_PASSWORD || "admin123").trim();
      return pass.replace(/^["']|["']$/g, '');
    } catch (e) {
      return "admin123";
    }
  };

  app.post("/api/admin/verify", (req, res) => {
    console.log(">>> [AUTH] Verify attempt");
    try {
      const { password } = req.body;
      const currentPassword = getAdminPassword();
      
      if (!password) {
        return res.status(400).json({ error: "Senha é obrigatória" });
      }

      if (String(password) === String(currentPassword)) {
        console.log(">>> [AUTH] Success");
        res.json({ success: true });
      } else {
        console.log(">>> [AUTH] Failed: Password mismatch");
        res.status(401).json({ error: "Senha incorreta" });
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
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('createdAt', { ascending: false });
      
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error("Error fetching clients:", e);
      return [];
    }
  };

  // Helper for settings from Supabase
  const getSettings = async () => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'branding')
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return data?.value || { logo: null };
    } catch (e) {
      console.error("Error fetching settings:", e);
      return { logo: null };
    }
  };

  // Multer Config
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // Branding Routes
  app.get("/api/settings", async (req, res) => {
    const settings = await getSettings();
    res.json(settings);
  });

  app.post("/api/admin/settings/logo", authMiddleware, upload.single("logo"), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    
    try {
      const supabase = getSupabase();
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
    const clients = await getClients();
    res.json(clients);
  });

  // Delete Client
  app.delete("/api/admin/clients/:id", authMiddleware, async (req, res) => {
    const { id } = req.params;
    
    try {
      const supabase = getSupabase();
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
      for (const file of files) {
        const ext = path.extname(file.originalname);
        const filename = `${client}/${uuidv4()}${ext}`;
        
        const { error } = await supabase.storage
          .from('photos')
          .upload(filename, file.buffer, {
            contentType: file.mimetype
          });
        
        if (error) throw error;
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete Photo
  app.delete("/api/admin/photos/:client/:filename", authMiddleware, async (req, res) => {
    const { client, filename } = req.params;
    try {
      const supabase = getSupabase();
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
    
    try {
      const supabase = getSupabase();
      const { data: client, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();

      if (!client || error) {
        return res.status(404).json({ error: "Portfólio não encontrado" });
      }

      const { data: files } = await supabase.storage.from('photos').list(id);
      const photos = (files || []).map(f => ({
        url: supabase.storage.from('photos').getPublicUrl(`${id}/${f.name}`).data.publicUrl,
        name: f.name
      }));

      res.json({ ...client, photos });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  // Error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Global error:", err);
    res.status(500).json({ error: err.message || "Erro interno do servidor" });
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL SERVER ERROR:", err);
});
