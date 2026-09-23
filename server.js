import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import {
  verifyPassword,
  changePassword,
  createSessionToken,
  isValidSession,
  destroySession,
  getAdminConfig
} from "./lib/auth.js";
import {
  getContent,
  saveContent,
  syncHtmlFromContent
} from "./lib/syncHtml.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Body parsers
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Ensure admin config and content files exist on startup
getAdminConfig();
const initialContent = getContent();
// Sync index.html with initial markers on startup if needed
syncHtmlFromContent(initialContent);

// Configure multer for disk storage inside project images folders
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let subfolder = "arte";
    if (req.params?.logoKey || req.body?.isLogo || req.originalUrl?.includes("logo")) {
      subfolder = "inicio";
    } else if (req.body?.category === "musica" || req.params?.category === "musica") {
      subfolder = "musica";
    }
    const dest = path.join(__dirname, "images", subfolder);
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeName = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 30);
    const uniqueSuffix = Date.now() + "_" + Math.round(Math.random() * 1e4);
    cb(null, `${safeName}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max per image
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|webp|gif|avif|svg)$/i;
    if (allowed.test(file.originalname) || file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos de imagen (JPG, PNG, WebP, GIF, SVG)."));
    }
  }
});

// Authentication middleware
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-admin-token"]) {
    token = req.headers["x-admin-token"];
  }

  if (!isValidSession(token)) {
    return res.status(401).json({ error: "No autorizado. Inicie sesión nuevamente." });
  }
  next();
}

// Helper: Extract YouTube ID
function extractYouTubeId(urlOrId) {
  if (!urlOrId) return null;
  const str = urlOrId.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
    return str;
  }
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = str.match(regex);
  return match ? match[1] : null;
}

// ===== ADMIN API ROUTES =====

// 1. Login
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: "Debe introducir la contraseña." });
  }

  if (verifyPassword(password)) {
    const token = createSessionToken();
    return res.json({ success: true, token, message: "Sesión iniciada con éxito." });
  } else {
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }
});

// 2. Check session status
app.get("/api/admin/check", (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-admin-token"]) {
    token = req.headers["x-admin-token"];
  }

  res.json({ authenticated: isValidSession(token) });
});

// 3. Logout
app.post("/api/admin/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  let token = null;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else if (req.headers["x-admin-token"]) {
    token = req.headers["x-admin-token"];
  }

  destroySession(token);
  res.json({ success: true, message: "Sesión cerrada correctamente." });
});

// 4. Change Password
app.post("/api/admin/change-password", requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Todos los campos de contraseña son requeridos." });
  }

  const result = changePassword(currentPassword, newPassword);
  if (result.success) {
    return res.json({ success: true, message: "Contraseña actualizada correctamente." });
  } else {
    return res.status(400).json({ error: result.error });
  }
});

// 5. Get current portfolio content
app.get("/api/admin/content", requireAdmin, (req, res) => {
  const content = getContent();
  res.json({ success: true, content });
});

// 6. Upload Image (Arte or Música)
app.post("/api/admin/upload-image", requireAdmin, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Error al subir la imagen." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No se ha seleccionado ninguna imagen." });
    }

    const category = req.body.category === "musica" ? "musica" : "arte";
    const caption = (req.body.caption || "").trim();
    const description = (req.body.description || "").trim();
    const relativeSrc = `images/${category}/${req.file.filename}`;

    const content = getContent();
    if (!content[category]) content[category] = [];

    const newItem = {
      id: `${category}-${Date.now()}`,
      src: relativeSrc,
      cap: caption,
      description: description
    };

    // Prepend or append depending on preference (append to end by default)
    content[category].push(newItem);

    try {
      saveContent(content);
      return res.json({
        success: true,
        message: `Imagen subida y guardada en el proyecto con éxito (${relativeSrc}). index.html ha sido actualizado.`,
        item: newItem,
        content
      });
    } catch (saveErr) {
      return res.status(500).json({ error: "Error al actualizar los archivos del proyecto." });
    }
  });
});

// 7. Add Video Link (0:45 Audiovisual or Locución/Voz)
app.post("/api/admin/add-video", requireAdmin, (req, res) => {
  const { category, videoUrl, title } = req.body;

  if (category !== "video" && category !== "voz") {
    return res.status(400).json({ error: "Categoría de vídeo no válida (debe ser 'video' o 'voz')." });
  }

  const videoId = extractYouTubeId(videoUrl);
  if (!videoId) {
    return res.status(400).json({
      error: "Enlace o ID de YouTube inválido. Asegúrese de ingresar una URL válida (ej: https://www.youtube.com/watch?v=... o https://youtu.be/...)."
    });
  }

  const videoTitle = (title || "").trim() || (category === "voz" ? "Demo reel" : "Vídeo");

  const content = getContent();
  if (!content[category]) content[category] = [];

  const newItem = {
    id: `${category}-${Date.now()}`,
    videoId,
    title: videoTitle
  };

  content[category].push(newItem);

  try {
    saveContent(content);
    return res.json({
      success: true,
      message: `Vídeo añadido con éxito. index.html y portfolio-content.json actualizados en el proyecto.`,
      item: newItem,
      content
    });
  } catch (err) {
    return res.status(500).json({ error: "Error al actualizar los archivos del proyecto." });
  }
});

// 8. Update Item (Caption or Title)
app.put("/api/admin/items/:category/:id", requireAdmin, (req, res) => {
  const { category, id } = req.params;
  const { cap, title, videoId, description } = req.body;

  const content = getContent();
  if (!content[category]) {
    return res.status(404).json({ error: "Categoría no encontrada." });
  }

  const itemIndex = content[category].findIndex(item => item.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Elemento no encontrado." });
  }

  if (cap !== undefined) content[category][itemIndex].cap = cap.trim();
  if (title !== undefined) content[category][itemIndex].title = title.trim();
  if (description !== undefined) content[category][itemIndex].description = description.trim();
  if (videoId !== undefined) {
    const validId = extractYouTubeId(videoId);
    if (validId) content[category][itemIndex].videoId = validId;
  }

  try {
    saveContent(content);
    res.json({ success: true, message: "Elemento actualizado en el proyecto.", content });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar cambios en los archivos." });
  }
});

// 9. Delete Item
app.delete("/api/admin/items/:category/:id", requireAdmin, (req, res) => {
  const { category, id } = req.params;

  const content = getContent();
  if (!content[category]) {
    return res.status(404).json({ error: "Categoría no encontrada." });
  }

  const itemIndex = content[category].findIndex(item => item.id === id);
  if (itemIndex === -1) {
    return res.status(404).json({ error: "Elemento no encontrado." });
  }

  const [removedItem] = content[category].splice(itemIndex, 1);

  // If item has a custom uploaded file path, we can safely attempt deletion
  if (removedItem && removedItem.src && removedItem.src.startsWith("images/")) {
    const filePath = path.join(__dirname, removedItem.src);
    // Only delete if it was created dynamically (starts with timestamp pattern or user confirmed)
    if (fs.existsSync(filePath) && (removedItem.src.includes("_") || removedItem.id.includes("-"))) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn("No se pudo eliminar el archivo físico:", filePath, err.message);
      }
    }
  }

  try {
    saveContent(content);
    res.json({
      success: true,
      message: "Elemento eliminado y archivos del proyecto actualizados.",
      content
    });
  } catch (err) {
    res.status(500).json({ error: "Error al actualizar los archivos del proyecto." });
  }
});

// 10. Reorder Items
app.post("/api/admin/reorder/:category", requireAdmin, (req, res) => {
  const { category } = req.params;
  const { items } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "La lista de elementos ordenados es requerida." });
  }

  const content = getContent();
  if (!content[category]) {
    return res.status(404).json({ error: "Categoría no encontrada." });
  }

  content[category] = items;

  try {
    saveContent(content);
    res.json({ success: true, message: "Orden actualizado en el proyecto.", content });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar el nuevo orden." });
  }
});

// 11. Update Settings (Footer visibility, etc.)
app.post("/api/admin/settings", requireAdmin, (req, res) => {
  const content = getContent();
  content.settings = {
    ...(content.settings || {}),
    ...req.body
  };

  try {
    saveContent(content);
    res.json({
      success: true,
      message: "Configuración de la interfaz actualizada.",
      settings: content.settings,
      content
    });
  } catch (err) {
    res.status(500).json({ error: "Error al guardar la configuración." });
  }
});

// 12. Update Logo or Graphic Element (Banner, Sections, Icons)
app.post("/api/admin/logos/:logoKey", requireAdmin, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Error al subir la imagen del elemento." });
    }

    const { logoKey } = req.params;
    if (!logoKey || !/^[a-zA-Z0-9_-]+$/.test(logoKey)) {
      return res.status(400).json({ error: "Identificador de elemento gráfico no válido." });
    }

    const content = getContent();
    if (!content.logos) {
      content.logos = {};
    }

    let newSrc = "";
    if (req.file) {
      newSrc = `images/inicio/${req.file.filename}`;
    } else if (req.body.svg && typeof req.body.svg === "string") {
      // Guardar el SVG elegido del repositorio en images/inicio/
      const cleanSvg = req.body.svg.trim();
      const svgFileName = `icon_${logoKey}.svg`;
      const svgFilePath = path.join(INIT_IMG_DIR, svgFileName);
      try {
        fs.writeFileSync(svgFilePath, cleanSvg, "utf8");
        newSrc = `images/inicio/${svgFileName}`;
      } catch (writeErr) {
        return res.status(500).json({ error: "No se pudo guardar el icono SVG seleccionado." });
      }
    } else if (req.body.src) {
      newSrc = req.body.src.trim();
    } else {
      return res.status(400).json({ error: "Debe seleccionar un archivo, icono de repositorio o indicar una ruta." });
    }

    if (typeof content.logos[logoKey] === "object" && content.logos[logoKey] !== null) {
      content.logos[logoKey].src = newSrc;
    } else {
      content.logos[logoKey] = {
        src: newSrc,
        title: logoKey.charAt(0).toUpperCase() + logoKey.slice(1)
      };
    }

    try {
      saveContent(content);
      return res.json({
        success: true,
        message: `Elemento gráfico "${content.logos[logoKey].title || logoKey}" guardado con éxito.`,
        logoKey,
        newSrc,
        content
      });
    } catch (saveErr) {
      return res.status(500).json({ error: "Error al actualizar los archivos del proyecto." });
    }
  });
});

// 11. Project Files Summary
app.get("/api/admin/files-status", requireAdmin, (req, res) => {
  const content = getContent();
  const summary = {
    arteCount: (content.arte || []).length,
    musicaCount: (content.musica || []).length,
    videoCount: (content.video || []).length,
    vozCount: (content.voz || []).length,
    indexPath: "index.html",
    contentJsonPath: "data/portfolio-content.json",
    lastUpdated: new Date().toISOString()
  };
  res.json({ success: true, summary });
});

// Serve all static files from root folder (css, js, images, CNAME, data)
app.use(express.static(__dirname));

// Direct fallback route requests to index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
