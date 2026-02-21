import express from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const CLIENTS_FILE = path.join(process.cwd(), "clients.json");

// On Vercel, we might need to use /tmp for temporary storage
const IS_VERCEL = !!process.env.VERCEL;
const STORAGE_PATH = IS_VERCEL ? "/tmp" : process.cwd();
const VERCEL_UPLOADS = path.join(STORAGE_PATH, "uploads");
const VERCEL_CLIENTS = path.join(STORAGE_PATH, "clients.json");
const VERCEL_SETTINGS = path.join(STORAGE_PATH, "settings.json");

// Ensure directories and files exist
if (!fs.existsSync(VERCEL_UPLOADS)) {
  fs.mkdirSync(VERCEL_UPLOADS, { recursive: true });
}
if (!fs.existsSync(VERCEL_CLIENTS)) {
  fs.writeFileSync(VERCEL_CLIENTS, JSON.stringify([]));
}
if (!fs.existsSync(VERCEL_SETTINGS)) {
  fs.writeFileSync(VERCEL_SETTINGS, JSON.stringify({ logo: null }));
}

app.use(express.json());

// Health check for Vercel
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "API is running", timestamp: new Date().toISOString() });
});

// Admin Auth Middleware (Simple fixed password)
const getAdminPassword = () => (process.env.ADMIN_PASSWORD || "admin123").trim();

// Verify Password Endpoint
app.post("/api/admin/verify", (req, res) => {
  const { password } = req.body;
  const currentPassword = getAdminPassword();
  
  if (password === currentPassword) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: "Senha incorreta" });
  }
});

// Helper to get clients
const getClients = () => {
  try {
    return JSON.parse(fs.readFileSync(VERCEL_CLIENTS, "utf-8"));
  } catch (e) {
    return [];
  }
};
const saveClients = (clients: any) => fs.writeFileSync(VERCEL_CLIENTS, JSON.stringify(clients, null, 2));

// Helper for settings
const getSettings = () => {
  try {
    return JSON.parse(fs.readFileSync(VERCEL_SETTINGS, "utf-8"));
  } catch (e) {
    return { logo: null };
  }
};
const saveSettings = (settings: any) => fs.writeFileSync(VERCEL_SETTINGS, JSON.stringify(settings, null, 2));

const authMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  const currentPassword = getAdminPassword();
  
  if (authHeader === `Bearer ${currentPassword}`) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

// Multer Config for Logo
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const logoDir = path.join(VERCEL_UPLOADS, "branding");
    if (!fs.existsSync(logoDir)) {
      fs.mkdirSync(logoDir, { recursive: true });
    }
    cb(null, logoDir);
  },
  filename: (req, file, cb) => {
    cb(null, `logo${path.extname(file.originalname)}`);
  },
});
const uploadLogo = multer({ storage: logoStorage });

// Branding Routes
app.get("/api/settings", (req, res) => {
  res.json(getSettings());
});

app.post("/api/admin/settings/logo", authMiddleware, uploadLogo.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const settings = getSettings();
  settings.logo = `/api/photos/branding/${req.file.filename}`;
  saveSettings(settings);
  res.json(settings);
});

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { client } = req.params;
    const clientDir = path.join(VERCEL_UPLOADS, client);
    if (!fs.existsSync(clientDir)) {
      fs.mkdirSync(clientDir, { recursive: true });
    }
    cb(null, clientDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  },
});

// API Routes

// Create Client
app.post("/api/admin/clients", authMiddleware, (req, res) => {
  const { name } = req.body;
  const clients = getClients();
  
  if (clients.length >= 4) {
    return res.status(400).json({ error: "Limite de 4 clientes atingido" });
  }

  const clientId = uuidv4().slice(0, 8);
  const newClient = { id: clientId, name, createdAt: new Date() };
  clients.push(newClient);
  saveClients(clients);

  const clientDir = path.join(VERCEL_UPLOADS, clientId);
  if (!fs.existsSync(clientDir)) {
    fs.mkdirSync(clientDir, { recursive: true });
  }

  res.json(newClient);
});

// Get Clients
app.get("/api/admin/clients", authMiddleware, (req, res) => {
  res.json(getClients());
});

// Delete Client
app.delete("/api/admin/clients/:id", authMiddleware, (req, res) => {
  const { id } = req.params;
  let clients = getClients();
  clients = clients.filter((c: any) => c.id !== id);
  saveClients(clients);

  const clientDir = path.join(VERCEL_UPLOADS, id);
  if (fs.existsSync(clientDir)) {
    fs.rmSync(clientDir, { recursive: true, force: true });
  }

  res.json({ success: true });
});

// Upload Photos
app.post("/api/admin/upload/:client", authMiddleware, upload.array("photos", 30), (req, res) => {
  const { client } = req.params;
  const clientDir = path.join(VERCEL_UPLOADS, client);
  const files = fs.readdirSync(clientDir);
  
  if (files.length > 30) {
    // Cleanup if somehow exceeded
    return res.status(400).json({ error: "Limite de 30 fotos atingido" });
  }

  res.json({ success: true });
});

// Delete Photo
app.delete("/api/admin/photos/:client/:filename", authMiddleware, (req, res) => {
  const { client, filename } = req.params;
  const filePath = path.join(VERCEL_UPLOADS, client, filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

// Public: Get Client Info & Photos
app.get("/api/client/:id", (req, res) => {
  const { id } = req.params;
  const clients = getClients();
  const client = clients.find((c: any) => c.id === id);

  if (!client) {
    return res.status(404).json({ error: "Cliente não encontrado" });
  }

  const clientDir = path.join(VERCEL_UPLOADS, id);
  const photos = fs.existsSync(clientDir) 
    ? fs.readdirSync(clientDir).map(filename => ({
        url: `/api/photos/${id}/${filename}`,
        name: filename
      }))
    : [];

  res.json({ ...client, photos });
});

// Serve Photos Securely
app.get("/api/photos/:client/:filename", (req, res) => {
  const { client, filename } = req.params;
  const filePath = path.join(VERCEL_UPLOADS, client, filename);

  if (fs.existsSync(filePath)) {
    // Prevent direct download by setting headers
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
  } else {
    res.status(404).send("Not found");
  }
});

// Vite Integration - Only used locally
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  // Use a string for the import to prevent Vercel from trying to bundle it
  const viteModule = "vite";
  import(viteModule).then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  });
}

if (!process.env.VERCEL) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
