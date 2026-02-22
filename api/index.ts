import express from "express";
import path from "path";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const app = express();
const PORT = 3000;

// Supabase Configuration
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.json());

// Health check
app.get("/api/health", async (req, res) => {
  let supabaseConnected = false;
  if (supabaseUrl) {
    try {
      const { error } = await supabase.from('clients').select('id').limit(1);
      supabaseConnected = !error;
    } catch (e) {
      supabaseConnected = false;
    }
  }
  
  res.json({ 
    status: "ok", 
    supabaseConnected,
    timestamp: new Date().toISOString() 
  });
});

// Admin Auth Middleware
const getAdminPassword = () => (process.env.ADMIN_PASSWORD || "admin123").trim();

app.post("/api/admin/verify", (req, res) => {
  const { password } = req.body;
  if (password === getAdminPassword()) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Senha incorreta" });
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
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('createdAt', { ascending: false });
  
  if (error) {
    console.error("Error fetching clients:", error);
    return [];
  }
  return data || [];
};

// Helper for settings from Supabase
const getSettings = async () => {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'branding')
    .single();
  
  if (error && error.code !== 'PGRST116') {
    console.error("Error fetching settings:", error);
  }
  return data?.value || { logo: null };
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
});

// Create Client
app.post("/api/admin/clients", authMiddleware, async (req, res) => {
  const { name } = req.body;
  const clientId = uuidv4().slice(0, 8);
  
  const { data, error } = await supabase
    .from('clients')
    .insert([{ id: clientId, name, createdAt: new Date() }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Get Clients
app.get("/api/admin/clients", authMiddleware, async (req, res) => {
  const clients = await getClients();
  res.json(clients);
});

// Delete Client
app.delete("/api/admin/clients/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  
  // Delete photos from storage first
  const { data: files } = await supabase.storage.from('photos').list(id);
  if (files && files.length > 0) {
    await supabase.storage.from('photos').remove(files.map(f => `${id}/${f.name}`));
  }

  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});

// Upload Photos
app.post("/api/admin/upload/:client", authMiddleware, upload.array("photos", 30), async (req, res) => {
  const { client } = req.params;
  const files = req.files as Express.Multer.File[];
  
  if (!files || files.length === 0) return res.status(400).json({ error: "Nenhuma foto enviada" });

  try {
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
  const { error } = await supabase.storage.from('photos').remove([`${client}/${filename}`]);
  
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Public: Get Client Info & Photos
app.get("/api/client/:id", async (req, res) => {
  const id = String(req.params.id).trim();
  
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
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global error:", err);
  res.status(500).json({ error: err.message || "Erro interno do servidor" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
