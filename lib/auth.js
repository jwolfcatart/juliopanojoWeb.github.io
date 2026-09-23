import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_PATH = path.join(__dirname, "../data/admin-config.json");

const DEFAULT_SALT = "wolfcat_secure_salt_2026";
const DEFAULT_PASSWORD = "admin"; // Default password, can be changed easily in overlay

function hashPassword(password, salt = DEFAULT_SALT) {
  return crypto.createHash("sha256").update(salt + password).digest("hex");
}

export function getAdminConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Error reading admin config:", err);
  }

  // Create default configuration if none exists
  const defaultConfig = {
    salt: DEFAULT_SALT,
    passwordHash: hashPassword(DEFAULT_PASSWORD, DEFAULT_SALT),
    sessionDurationHours: 24,
    updatedAt: new Date().toISOString()
  };

  try {
    const dataDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing default admin config:", err);
  }

  return defaultConfig;
}

export function verifyPassword(password) {
  const config = getAdminConfig();
  const inputHash = hashPassword(password, config.salt || DEFAULT_SALT);
  return inputHash === config.passwordHash;
}

export function changePassword(currentPassword, newPassword) {
  if (!verifyPassword(currentPassword)) {
    return { success: false, error: "Contraseña actual incorrecta." };
  }
  if (!newPassword || newPassword.length < 4) {
    return { success: false, error: "La nueva contraseña debe tener al menos 4 caracteres." };
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const newHash = hashPassword(newPassword, salt);
  const updatedConfig = {
    salt,
    passwordHash: newHash,
    sessionDurationHours: 24,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, null, 2), "utf8");
  return { success: true };
}

// In-memory active sessions map
const activeSessions = new Map();

export function createSessionToken() {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  activeSessions.set(token, { expiresAt });
  return token;
}

export function isValidSession(token) {
  if (!token) return false;
  const session = activeSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(token);
    return false;
  }
  return true;
}

export function destroySession(token) {
  if (token) {
    activeSessions.delete(token);
  }
}
