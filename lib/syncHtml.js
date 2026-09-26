import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");
const INDEX_PATH = path.join(ROOT_DIR, "index.html");
const CONTENT_PATH = path.join(ROOT_DIR, "data/portfolio-content.json");

export function getContent() {
  try {
    if (fs.existsSync(CONTENT_PATH)) {
      return JSON.parse(fs.readFileSync(CONTENT_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Error reading portfolio-content.json:", err);
  }
  return {
    arte: [],
    musica: [],
    video: [],
    voz: []
  };
}

export function saveContent(content) {
  try {
    fs.writeFileSync(CONTENT_PATH, JSON.stringify(content, null, 2), "utf8");
    syncHtmlFromContent(content);
    return true;
  } catch (err) {
    console.error("Error saving content or syncing index.html:", err);
    throw err;
  }
}

export function renderArteHtml(items) {
  return items.map(item => {
    const capHtml = item.cap ? `<p class="cap">${escapeHtml(item.cap)}</p>` : '';
    const descAttr = escapeHtml(item.description || '');
    const titleAttr = escapeHtml(item.cap || 'Arte');
    return `        <div class="float-item" data-title="${titleAttr}" data-description="${descAttr}"><div class="thumb-wrap"><img class="lightbox-img" src="${escapeHtml(item.src)}" loading="lazy" alt="${titleAttr}"><span class="zoom-badge"><span class="circle"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><line x1="15" y1="15" x2="20.5" y2="20.5"/></svg></span></span></div>${capHtml}</div>`;
  }).join("\n");
}

export function renderMusicaHtml(items) {
  return items.map(item => {
    const capHtml = item.cap ? `<p class="cap">${escapeHtml(item.cap)}</p>` : '';
    const descAttr = escapeHtml(item.description || '');
    const titleAttr = escapeHtml(item.cap || 'The Cat Wolfson Music Experience');
    const songAttr = escapeHtml(item.songUrl || '');
    return `        <div class="float-item" data-title="${titleAttr}" data-description="${descAttr}" data-song="${songAttr}"><div class="thumb-wrap"><img class="lightbox-img" src="${escapeHtml(item.src)}" loading="lazy" alt="${titleAttr}"><span class="zoom-badge"><span class="circle"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><line x1="15" y1="15" x2="20.5" y2="20.5"/></svg></span></span></div>${capHtml}</div>`;
  }).join("\n");
}

export function renderVideoHtml(items) {
  return items.map(item => {
    return `        <button class="video-chip" data-video="${escapeHtml(item.videoId)}">
          <div class="video-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" loading="lazy" alt="${escapeHtml(item.title)}"><div class="play-badge"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
          <p class="video-title">${escapeHtml(item.title)}</p>
        </button>`;
  }).join("\n");
}

export function renderVozHtml(items) {
  return items.map(item => {
    return `        <button class="video-chip" data-video="${escapeHtml(item.videoId)}">
          <div class="video-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" loading="lazy" alt="${escapeHtml(item.title)}"><div class="play-badge"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
          <p class="video-title">${escapeHtml(item.title)}</p>
        </button>`;
  }).join("\n");
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function syncHtmlFromContent(content) {
  if (!fs.existsSync(INDEX_PATH)) return false;
  let html = fs.readFileSync(INDEX_PATH, "utf8");

  // Sync Arte
  const arteStartMarker = "<!-- ARTE_GALLERY_START -->";
  const arteEndMarker = "<!-- ARTE_GALLERY_END -->";
  if (html.includes(arteStartMarker) && html.includes(arteEndMarker)) {
    const arteSnippet = "\n" + renderArteHtml(content.arte || []) + "\n        ";
    const pattern = new RegExp(`${arteStartMarker}[\\s\\S]*?${arteEndMarker}`);
    html = html.replace(pattern, `${arteStartMarker}${arteSnippet}${arteEndMarker}`);
  }

  // Sync Musica
  const musicaStartMarker = "<!-- MUSICA_GALLERY_START -->";
  const musicaEndMarker = "<!-- MUSICA_GALLERY_END -->";
  if (html.includes(musicaStartMarker) && html.includes(musicaEndMarker)) {
    const musicaSnippet = "\n" + renderMusicaHtml(content.musica || []) + "\n        ";
    const pattern = new RegExp(`${musicaStartMarker}[\\s\\S]*?${musicaEndMarker}`);
    html = html.replace(pattern, `${musicaStartMarker}${musicaSnippet}${musicaEndMarker}`);
  }

  // Sync Video
  const videoStartMarker = "<!-- VIDEO_CLOUD_START -->";
  const videoEndMarker = "<!-- VIDEO_CLOUD_END -->";
  if (html.includes(videoStartMarker) && html.includes(videoEndMarker)) {
    const videoSnippet = "\n" + renderVideoHtml(content.video || []) + "\n        ";
    const pattern = new RegExp(`${videoStartMarker}[\\s\\S]*?${videoEndMarker}`);
    html = html.replace(pattern, `${videoStartMarker}${videoSnippet}${videoEndMarker}`);
  }

  // Sync Voz
  const vozStartMarker = "<!-- VOZ_CLOUD_START -->";
  const vozEndMarker = "<!-- VOZ_CLOUD_END -->";
  if (html.includes(vozStartMarker) && html.includes(vozEndMarker)) {
    const vozSnippet = "\n" + renderVozHtml(content.voz || []) + "\n        ";
    const pattern = new RegExp(`${vozStartMarker}[\\s\\S]*?${vozEndMarker}`);
    html = html.replace(pattern, `${vozStartMarker}${vozSnippet}${vozEndMarker}`);
  }

  // Sync Logos and graphic elements
  if (content.logos && typeof content.logos === "object") {
    for (const [key, logoData] of Object.entries(content.logos)) {
      const src = typeof logoData === "string" ? logoData : logoData?.src;
      if (!src) continue;
      // Replace src on all images with data-logo="key"
      const reg1 = new RegExp(`(<img[^>]*data-logo="${key}"[^>]*src=")[^"]*(")`, "g");
      html = html.replace(reg1, `$1${escapeHtml(src)}$2`);
      const reg2 = new RegExp(`(<img[^>]*src=")[^"]*("[^>]*data-logo="${key}")`, "g");
      html = html.replace(reg2, `$1${escapeHtml(src)}$2`);
    }
  }

  // Sync Footer visibility from settings
  if (content.settings && typeof content.settings === "object") {
    if (content.settings.hideFooter) {
      html = html.replace(/<div class="contact-pill[^"]*" id="footerContactPill"[^>]*>/g, '<div class="contact-pill hidden-footer" id="footerContactPill" style="display:none;">');
    } else {
      html = html.replace(/<div class="contact-pill[^"]*" id="footerContactPill"[^>]*>/g, '<div class="contact-pill" id="footerContactPill">');
    }
  }

  fs.writeFileSync(INDEX_PATH, html, "utf8");
  return true;
}
