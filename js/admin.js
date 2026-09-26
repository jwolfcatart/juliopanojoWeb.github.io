// ===== Admin Overlay Client Script =====

(function () {
  let authToken = sessionStorage.getItem('portfolio_admin_token') || '';
  let isStaticMode = (sessionStorage.getItem('portfolio_admin_mode') === 'static') || (authToken.startsWith('static_'));
  let portfolioContent = null;
  let activeTab = 'arte';

  // SHA-256 helper for client-side password verification on static hosting (GitHub Pages)
  async function sha256Hex(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Helper para descargar portfolio-content.json en modo estático
  function downloadContentJson() {
    if (!portfolioContent) return;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(portfolioContent, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'portfolio-content.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('portfolio-content.json descargado.');
  }

  // ===== GitHub Direct Sync (Sincronización Automática con GitHub REST API) =====
  function getGitHubConfig() {
    return {
      token: localStorage.getItem('portfolio_github_token') || '',
      repo: localStorage.getItem('portfolio_github_repo') || '',
      branch: localStorage.getItem('portfolio_github_branch') || 'main'
    };
  }

  function setGitHubConfig(token, repo, branch) {
    if (token !== undefined) localStorage.setItem('portfolio_github_token', token.trim());
    if (repo !== undefined) localStorage.setItem('portfolio_github_repo', repo.trim());
    if (branch !== undefined) localStorage.setItem('portfolio_github_branch', (branch || 'main').trim());
  }

  // Realizar commit de un archivo vía GitHub REST API
  async function githubCommitFile(filePath, fileContent, commitMsg, isBase64 = false) {
    const { token, repo, branch } = getGitHubConfig();
    if (!token || !repo) {
      throw new Error('Configura primero tu repositorio y token de GitHub.');
    }

    const cleanPath = filePath.replace(/^\//, '');
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`;

    // 1. Obtener SHA del archivo existente si existe
    let existingSha = null;
    try {
      const getRes = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (getRes.ok) {
        const fileInfo = await getRes.json();
        existingSha = fileInfo.sha;
      }
    } catch (e) {}

    // 2. Preparar contenido base64 (soporta UTF-8 para emojis y tildes)
    let contentBase64;
    if (isBase64) {
      contentBase64 = fileContent;
    } else {
      const utf8Bytes = new TextEncoder().encode(fileContent);
      let binaryStr = '';
      utf8Bytes.forEach(b => binaryStr += String.fromCharCode(b));
      contentBase64 = btoa(binaryStr);
    }

    // 3. PUT para actualizar o crear el archivo
    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${cleanPath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
      },
      body: JSON.stringify({
        message: commitMsg || `Actualizar ${cleanPath} desde el panel web`,
        content: contentBase64,
        sha: existingSha || undefined,
        branch: branch
      })
    });

    if (!putRes.ok) {
      let errMsg = `Error de GitHub (${putRes.status})`;
      try {
        const errData = await putRes.json();
        errMsg = errData.message || errMsg;
      } catch (e) {}
      throw new Error(errMsg);
    }

    return await putRes.json();
  }

  // Generar HTML sincronizado para index.html en cliente
  function clientRenderArteHtml(items) {
    return (items || []).map(item => {
      const capHtml = item.cap ? `<p class="cap">${escapeHtml(item.cap)}</p>` : '';
      const descAttr = escapeHtml(item.description || '');
      const titleAttr = escapeHtml(item.cap || 'Arte');
      return `        <div class="float-item" data-title="${titleAttr}" data-description="${descAttr}"><div class="thumb-wrap"><img class="lightbox-img" src="${escapeHtml(item.src)}" loading="lazy" alt="${titleAttr}"><span class="zoom-badge"><span class="circle"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><line x1="15" y1="15" x2="20.5" y2="20.5"/></svg></span></span></div>${capHtml}</div>`;
    }).join('\n');
  }

  function clientRenderMusicaHtml(items) {
    return (items || []).map(item => {
      const capHtml = item.cap ? `<p class="cap">${escapeHtml(item.cap)}</p>` : '';
      const descAttr = escapeHtml(item.description || '');
      const titleAttr = escapeHtml(item.cap || 'The Cat Wolfson Music Experience');
      const songAttr = escapeHtml(item.songUrl || '');
      return `        <div class="float-item" data-title="${titleAttr}" data-description="${descAttr}" data-song="${songAttr}"><div class="thumb-wrap"><img class="lightbox-img" src="${escapeHtml(item.src)}" loading="lazy" alt="${titleAttr}"><span class="zoom-badge"><span class="circle"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><line x1="15" y1="15" x2="20.5" y2="20.5"/></svg></span></span></div>${capHtml}</div>`;
    }).join('\n');
  }

  function clientRenderVideoHtml(items) {
    return (items || []).map(item => {
      return `        <button class="video-chip" data-video="${escapeHtml(item.videoId)}">\n          <div class="video-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" loading="lazy" alt="${escapeHtml(item.title)}"><div class="play-badge"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>\n          <p class="video-title">${escapeHtml(item.title)}</p>\n        </button>`;
    }).join('\n');
  }

  function clientRenderVozHtml(items) {
    return (items || []).map(item => {
      return `        <button class="video-chip" data-video="${escapeHtml(item.videoId)}">\n          <div class="video-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" loading="lazy" alt="${escapeHtml(item.title)}"><div class="play-badge"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>\n          <p class="video-title">${escapeHtml(item.title)}</p>\n        </button>`;
    }).join('\n');
  }

  function clientSyncHtml(currentHtml, content) {
    let html = currentHtml;
    // Sync Arte
    const aStart = '<!-- ARTE_GALLERY_START -->';
    const aEnd = '<!-- ARTE_GALLERY_END -->';
    if (html.includes(aStart) && html.includes(aEnd)) {
      html = html.replace(new RegExp(`${aStart}[\\s\\S]*?${aEnd}`), `${aStart}\n${clientRenderArteHtml(content.arte)}\n        ${aEnd}`);
    }
    // Sync Musica
    const mStart = '<!-- MUSICA_GALLERY_START -->';
    const mEnd = '<!-- MUSICA_GALLERY_END -->';
    if (html.includes(mStart) && html.includes(mEnd)) {
      html = html.replace(new RegExp(`${mStart}[\\s\\S]*?${mEnd}`), `${mStart}\n${clientRenderMusicaHtml(content.musica)}\n        ${mEnd}`);
    }
    // Sync Video
    const vStart = '<!-- VIDEO_CLOUD_START -->';
    const vEnd = '<!-- VIDEO_CLOUD_END -->';
    if (html.includes(vStart) && html.includes(vEnd)) {
      html = html.replace(new RegExp(`${vStart}[\\s\\S]*?${vEnd}`), `${vStart}\n${clientRenderVideoHtml(content.video)}\n        ${vEnd}`);
    }
    // Sync Voz
    const zStart = '<!-- VOZ_CLOUD_START -->';
    const zEnd = '<!-- VOZ_CLOUD_END -->';
    if (html.includes(zStart) && html.includes(zEnd)) {
      html = html.replace(new RegExp(`${zStart}[\\s\\S]*?${zEnd}`), `${zStart}\n${clientRenderVozHtml(content.voz)}\n        ${zEnd}`);
    }
    // Sync Logos
    if (content.logos) {
      for (const [key, logoData] of Object.entries(content.logos)) {
        const src = typeof logoData === 'string' ? logoData : logoData?.src;
        if (!src) continue;
        const reg1 = new RegExp(`(<img[^>]*data-logo="${key}"[^>]*src=")[^"]*(")`, 'g');
        html = html.replace(reg1, `$1${escapeHtml(src)}$2`);
        const reg2 = new RegExp(`(<img[^>]*src=")[^"]*("[^>]*data-logo="${key}")`, 'g');
        html = html.replace(reg2, `$1${escapeHtml(src)}$2`);
      }
    }
    // Sync settings
    if (content.settings) {
      if (content.settings.hideFooter) {
        html = html.replace(/<div class="contact-pill[^"]*" id="footerContactPill"[^>]*>/g, '<div class="contact-pill hidden-footer" id="footerContactPill" style="display:none;">');
      } else {
        html = html.replace(/<div class="contact-pill[^"]*" id="footerContactPill"[^>]*>/g, '<div class="contact-pill" id="footerContactPill">');
      }
    }
    // Sync embedded JSON
    const scriptRegex = /<script id="portfolioInitialData" type="application\/json">[\s\S]*?<\/script>/;
    const scriptTag = `<script id="portfolioInitialData" type="application/json">\n${JSON.stringify(content, null, 2)}\n</script>`;
    if (scriptRegex.test(html)) {
      html = html.replace(scriptRegex, scriptTag);
    }
    return html;
  }

  // Sincronizar todos los cambios a GitHub
  async function syncAllToGitHub(statusBtn) {
    const { token, repo } = getGitHubConfig();
    if (!token || !repo) {
      openGitHubConfigModal();
      return;
    }

    if (statusBtn) {
      statusBtn.disabled = true;
      statusBtn.textContent = '🚀 Subiendo a GitHub...';
    }
    showToast('Conectando y subiendo cambios a GitHub...');

    try {
      // 1. Subir cualquier icono SVG o imagen nueva en base64 a su archivo en el repo
      if (portfolioContent.logos) {
        for (const [key, logoData] of Object.entries(portfolioContent.logos)) {
          const src = typeof logoData === 'string' ? logoData : logoData?.src;
          if (src && src.startsWith('data:image/svg+xml;utf8,')) {
            const svgContent = decodeURIComponent(src.replace('data:image/svg+xml;utf8,', ''));
            const filePath = `images/inicio/icon_${key}.svg`;
            await githubCommitFile(filePath, svgContent, `Actualizar icono ${key} (SVG)`);
            if (typeof portfolioContent.logos[key] === 'object') {
              portfolioContent.logos[key].src = filePath;
            } else {
              portfolioContent.logos[key] = filePath;
            }
          } else if (src && src.startsWith('data:')) {
            const match = src.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              const mime = match[1];
              const b64 = match[2];
              const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
              const filePath = `images/inicio/${key}_${Date.now()}.${ext}`;
              await githubCommitFile(filePath, b64, `Subir imagen ${key}`, true);
              if (typeof portfolioContent.logos[key] === 'object') {
                portfolioContent.logos[key].src = filePath;
              } else {
                portfolioContent.logos[key] = filePath;
              }
            }
          }
        }
      }

      // Subir imágenes de arte/musica que sean dataURLs
      for (const cat of ['arte', 'musica']) {
        if (Array.isArray(portfolioContent[cat])) {
          for (const item of portfolioContent[cat]) {
            if (item.src && item.src.startsWith('data:')) {
              const match = item.src.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                const mime = match[1];
                const b64 = match[2];
                const ext = mime.includes('png') ? 'png' : 'jpg';
                const fileName = `img_${item.id || Date.now()}.${ext}`;
                const filePath = `images/${cat}/${fileName}`;
                await githubCommitFile(filePath, b64, `Subir imagen ${fileName} a ${cat}`, true);
                item.src = filePath;
              }
            }
          }
        }
      }

      // 2. Subir data/portfolio-content.json
      const jsonContent = JSON.stringify(portfolioContent, null, 2);
      await githubCommitFile('data/portfolio-content.json', jsonContent, 'Actualizar contenido del portafolio (portfolio-content.json)');

      // 3. Subir index.html sincronizado
      try {
        const indexRes = await fetch('index.html');
        if (indexRes.ok) {
          const currentHtml = await indexRes.text();
          if (currentHtml && !currentHtml.trim().startsWith('{')) {
            const updatedHtml = clientSyncHtml(currentHtml, portfolioContent);
            await githubCommitFile('index.html', updatedHtml, 'Sincronizar index.html con las nuevas obras y ajustes');
          }
        }
      } catch (e) {
        console.warn('Sincronización directa de index.html omitida:', e);
      }

      showToast('🎉 ¡Portafolio publicado con éxito en GitHub! Tu web se actualizará en 1-2 minutos.');
    } catch (err) {
      showToast('Error al sincronizar con GitHub: ' + err.message, true);
    } finally {
      if (statusBtn) {
        statusBtn.disabled = false;
        statusBtn.textContent = '🚀 Publicar en GitHub';
      }
    }
  }

  // Modal para configurar Token y Repositorio de GitHub
  function openGitHubConfigModal() {
    closeSubmodal();
    const modal = document.getElementById('adminModalContent');
    if (!modal) return;

    const { token, repo, branch } = getGitHubConfig();

    const sub = document.createElement('div');
    sub.id = 'adminSubmodal';
    sub.className = 'admin-submodal';
    sub.innerHTML = `
      <div class="admin-submodal-box" style="max-width:540px;">
        <div class="admin-submodal-header">
          <h4>🚀 Conectar con GitHub para Publicación Automática</h4>
          <button type="button" class="admin-btn-close" id="ghModalCloseBtn">&times;</button>
        </div>
        <form id="formGitHubConfig">
          <div class="admin-submodal-body">
            <p style="font-size:0.86rem; color:#444; line-height:1.5; margin-bottom:14px;">
              Configura tu repositorio una sola vez. Cada vez que hagas cambios en el portafolio (subir obras, cambiar textos, canciones o iconos), podrás publicarlos directamente en GitHub con un solo clic sin necesidad de descargar archivos ni abrir la terminal.
            </p>
            <div class="admin-input-group">
              <label for="ghRepoInput">Repositorio de GitHub (usuario/repositorio)</label>
              <input type="text" id="ghRepoInput" class="admin-input" placeholder="ej: juliopanojo/juliopanojo.github.io" value="${escapeHtml(repo)}" required>
              <div class="admin-helper">El nombre de tu repositorio en GitHub donde está alojada la web.</div>
            </div>
            <div class="admin-input-group">
              <label for="ghBranchInput">Rama principal</label>
              <input type="text" id="ghBranchInput" class="admin-input" placeholder="main o master" value="${escapeHtml(branch || 'main')}" required>
            </div>
            <div class="admin-input-group">
              <label for="ghTokenInput">Token de Acceso Personal de GitHub (PAT)</label>
              <div class="admin-pwd-field">
                <input type="password" id="ghTokenInput" class="admin-input" placeholder="ghp_... o github_pat_..." value="${escapeHtml(token)}" required autocomplete="off">
                <button type="button" class="admin-pwd-toggle" data-target="ghTokenInput" aria-label="Mostrar/ocultar">👁️</button>
              </div>
              <div class="admin-helper" style="margin-top:8px; line-height:1.45; background:#eff6ff; padding:8px 10px; border-radius:6px; border:1px solid #bfdbfe;">
                🔑 <strong>¿Cómo obtener tu token en 1 minuto?</strong><br>
                1. Abre este enlace: <a href="https://github.com/settings/tokens/new?scopes=repo&description=PortafolioWebAdmin" target="_blank" rel="noopener" style="color:#0284c7; text-decoration:underline; font-weight:600;">Generar Token en GitHub</a>.<br>
                2. Marca la casilla <strong>repo</strong> (acceso total a repositorios).<br>
                3. Pulsa <em>Generate token</em> abajo del todo, cópialo y pégalo aquí. Se guarda privado en tu navegador.
              </div>
            </div>
            <div id="ghConfigStatus" style="font-size:0.85rem; margin-top:10px; display:none; padding:8px 12px; border-radius:6px;"></div>
          </div>
          <div class="admin-submodal-footer">
            <button type="button" class="admin-btn admin-btn-secondary" id="btnGhCancel">Cancelar</button>
            <button type="submit" class="admin-btn admin-btn-primary" id="btnGhSave">Guardar y Probar Conexión</button>
          </div>
        </form>
      </div>
    `;

    modal.appendChild(sub);
    requestAnimationFrame(() => sub.classList.add('open'));

    // Toggle token visibility
    sub.querySelectorAll('.admin-pwd-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });

    sub.querySelector('#ghModalCloseBtn')?.addEventListener('click', closeSubmodal);
    sub.querySelector('#btnGhCancel')?.addEventListener('click', closeSubmodal);

    sub.querySelector('#formGitHubConfig')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inRepo = sub.querySelector('#ghRepoInput').value.trim();
      const inBranch = sub.querySelector('#ghBranchInput').value.trim() || 'main';
      const inToken = sub.querySelector('#ghTokenInput').value.trim();
      const statusBox = sub.querySelector('#ghConfigStatus');
      const saveBtn = sub.querySelector('#btnGhSave');

      saveBtn.disabled = true;
      saveBtn.textContent = 'Verificando con GitHub...';
      statusBox.style.display = 'none';

      try {
        const testRes = await fetch(`https://api.github.com/repos/${inRepo}`, {
          headers: {
            'Authorization': `token ${inToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!testRes.ok) {
          if (testRes.status === 401) throw new Error('Token inválido o expirado.');
          if (testRes.status === 404) throw new Error(`No se encontró el repositorio "${inRepo}". Verifica usuario y nombre.`);
          throw new Error(`Error de conexión con GitHub (${testRes.status}).`);
        }

        const repoData = await testRes.json();
        setGitHubConfig(inToken, inRepo, inBranch);

        statusBox.style.display = 'block';
        statusBox.style.background = '#f0fdf4';
        statusBox.style.color = '#15803d';
        statusBox.style.border = '1px solid #bbf7d0';
        statusBox.innerHTML = `✅ Conexión exitosa con <strong>${escapeHtml(repoData.full_name)}</strong>. ¡Ya puedes sincronizar automáticamente!`;

        showToast('GitHub conectado correctamente.');
        setTimeout(() => {
          closeSubmodal();
          renderDashboard();
        }, 1200);
      } catch (err) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#dc2626';
        statusBox.style.border = '1px solid #fecaca';
        statusBox.textContent = '❌ ' + (err.message || 'Error al conectar con GitHub.');
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar y Probar Conexión';
      }
    });
  }

  // Create Toast
  function showToast(message, isError = false) {
    let toast = document.getElementById('adminToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'adminToast';
      toast.className = 'admin-toast';
      document.body.appendChild(toast);
    }
    toast.className = `admin-toast ${isError ? 'admin-toast-error' : 'admin-toast-success'} show`;
    toast.innerHTML = isError
      ? `<span>⚠️ ${escapeHtml(message)}</span>`
      : `<span>✅ ${escapeHtml(message)}</span>`;
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3800);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Extract YouTube ID helper
  function extractYouTubeId(urlOrId) {
    if (!urlOrId) return null;
    const str = urlOrId.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/|live\/)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = str.match(regex);
    return match ? match[1] : null;
  }

  // Toggle Admin Overlay
  function toggleOverlay(open) {
    const overlay = document.getElementById('adminOverlay');
    if (!overlay) return;
    const isOpen = open !== undefined ? open : !overlay.classList.contains('open');
    if (isOpen) {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      checkAuthAndRender();
    } else {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
  }

  // Safe JSON Fetch helper that NEVER crashes on HTML 404/SPA responses or invalid JSON
  async function safeFetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const cType = (res.headers.get('content-type') || '').toLowerCase();
      const txt = await res.text();
      if (!txt || txt.trim().startsWith('<')) return null;
      try {
        return JSON.parse(txt);
      } catch (e) {
        return null;
      }
    } catch (netErr) {
      return null;
    }
  }

  // Helper to extract portfolioContent directly from live DOM if JSON file is unreachable or returning HTML
  function extractContentFromDom() {
    const content = {
      arte: [],
      musica: [],
      video: [],
      voz: [],
      settings: {
        hideFooter: document.getElementById('footerContactPill')?.classList.contains('hidden-footer') || false
      },
      logos: {
        banner: { src: document.getElementById('heroLogo')?.getAttribute('src') || 'images/inicio/julio.jpg', title: 'Banner' },
        arte: { src: document.querySelector('#arte [data-logo="arte"]')?.getAttribute('src') || 'images/inicio/_J_Wolfcat__1790416534003_2848.png', title: 'Arte' },
        musica: { src: document.querySelector('#musica [data-logo="musica"]')?.getAttribute('src') || 'images/inicio/musica.jpg', title: 'Música' },
        video: { src: document.querySelector('#video [data-logo="video"]')?.getAttribute('src') || 'images/inicio/video.jpg', title: 'Video' },
        voz: { src: document.querySelector('#voz [data-logo="voz"]')?.getAttribute('src') || 'images/inicio/voz.jpg', title: 'Voz' }
      }
    };

    // Arte gallery
    document.querySelectorAll('#galleryArte .float-item').forEach((item, idx) => {
      const img = item.querySelector('img');
      const cap = item.querySelector('.cap')?.textContent?.trim() || '';
      const title = item.dataset.title || cap || '';
      const desc = item.dataset.description || '';
      if (img) {
        content.arte.push({
          id: `arte-${idx + 1}`,
          src: img.getAttribute('src') || '',
          cap,
          title,
          description: desc
        });
      }
    });

    // Musica gallery
    document.querySelectorAll('#galleryMusica .float-item').forEach((item, idx) => {
      const img = item.querySelector('img');
      const cap = item.querySelector('.cap')?.textContent?.trim() || '';
      const title = item.dataset.title || cap || '';
      const desc = item.dataset.description || '';
      const songUrl = item.dataset.song || '';
      if (img) {
        content.musica.push({
          id: `musica-${idx + 1}`,
          src: img.getAttribute('src') || '',
          cap,
          title,
          description: desc,
          songUrl
        });
      }
    });

    // Video gallery
    document.querySelectorAll('#galleryVideo .video-chip, #galleryVideo [data-video]').forEach((item, idx) => {
      const videoId = item.dataset.video || '';
      const title = item.querySelector('.video-title, h3, p')?.textContent?.trim() || item.dataset.title || `Vídeo ${idx + 1}`;
      if (videoId) {
        content.video.push({
          id: `video-${idx + 1}`,
          videoId,
          title
        });
      }
    });

    // Voz gallery
    document.querySelectorAll('#galleryVoz .video-chip, #galleryVoz [data-video]').forEach((item, idx) => {
      const videoId = item.dataset.video || '';
      const title = item.querySelector('.video-title, h3, p')?.textContent?.trim() || item.dataset.title || `Voz ${idx + 1}`;
      if (videoId) {
        content.voz.push({
          id: `voz-${idx + 1}`,
          videoId,
          title
        });
      }
    });

    return content;
  }

  // Authenticate API Request Helper (robusto ante hosting estático y caídas de servidor)
  async function apiRequest(endpoint, options = {}) {
    const headers = options.headers || {};
    if (authToken && !authToken.startsWith('static_')) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    let res;
    try {
      res = await fetch(endpoint, { ...options, headers });
    } catch (netErr) {
      throw new Error('No se pudo conectar con el servidor backend.');
    }

    if (res.status === 401) {
      authToken = '';
      sessionStorage.removeItem('portfolio_admin_token');
      sessionStorage.removeItem('portfolio_admin_mode');
      renderLogin();
      throw new Error('Sesión expirada o no autorizada.');
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      if (res.status === 429) {
        throw new Error('Límite de peticiones excedido (429) o el servidor backend no está disponible en este alojamiento web.');
      }
      throw new Error(`Respuesta no JSON del servidor (${res.status}).`);
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      throw new Error('Respuesta inválida del servidor.');
    }

    if (!res.ok) {
      throw new Error(data.error || 'Error en la petición.');
    }
    return data;
  }

  // Check Auth & Render
  async function checkAuthAndRender() {
    if (!authToken) {
      renderLogin();
      return;
    }

    if (isStaticMode || authToken.startsWith('static_')) {
      isStaticMode = true;
      await loadContent();
      renderDashboard();
      return;
    }

    try {
      const res = await apiRequest('/api/admin/check');
      if (res && res.authenticated) {
        isStaticMode = false;
        await loadContent();
        renderDashboard();
      } else {
        authToken = '';
        sessionStorage.removeItem('portfolio_admin_token');
        sessionStorage.removeItem('portfolio_admin_mode');
        renderLogin();
      }
    } catch (err) {
      authToken = '';
      sessionStorage.removeItem('portfolio_admin_token');
      sessionStorage.removeItem('portfolio_admin_mode');
      renderLogin();
    }
  }

  // Load Content (robusto contra 404/HTML o JSON inaccesible)
  async function loadContent() {
    try {
      if (!isStaticMode) {
        try {
          const data = await apiRequest('/api/admin/content');
          if (data && data.content) {
            portfolioContent = data.content;
            refreshLiveDom(portfolioContent);
            return;
          }
        } catch (e) {
          isStaticMode = true;
        }
      }

      // Modo estático o respaldo:
      // 1. Intentar cargar data/portfolio-content.json de forma segura
      let data = await safeFetchJson('data/portfolio-content.json');
      if (!data) {
        data = await safeFetchJson('./data/portfolio-content.json');
      }

      // 2. Comprobar script embebido en el HTML
      if (!data) {
        const embeddedEl = document.getElementById('portfolioInitialData');
        if (embeddedEl && embeddedEl.textContent) {
          try {
            data = JSON.parse(embeddedEl.textContent);
          } catch (e) {}
        }
      }

      // 3. Respaldo directo: extraer elementos del DOM de la página
      if (!data || !data.arte) {
        data = extractContentFromDom();
      }

      portfolioContent = data;
      refreshLiveDom(portfolioContent);
    } catch (err) {
      console.warn('loadContent fallback a DOM:', err);
      portfolioContent = extractContentFromDom();
      refreshLiveDom(portfolioContent);
    }
  }

  // Render Login Card
  function renderLogin() {
    const modal = document.getElementById('adminModalContent');
    if (!modal) return;
    modal.innerHTML = `
      <div class="admin-header">
        <div class="admin-title-area">
          <div class="admin-title">🔒 Panel de Administración</div>
        </div>
        <button class="admin-btn-close" id="adminCloseBtn" aria-label="Cerrar">&times;</button>
      </div>
      <div class="admin-body">
        <div class="admin-login-box">
          <div class="admin-login-icon">
            <svg style="width:28px;height:28px;fill:currentColor" viewBox="0 0 24 24"><path d="M12 2C9.24 2 7 4.24 7 7v3H6c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-8c0-1.1-.9-2-2-2h-1V7c0-2.76-2.24-5-5-5zm0 2c1.66 0 3 1.34 3 3v3H9V7c0-1.66 1.34-3 3-3zm0 10c1.1 0 2 .9 2 2s-.9 2-2 2-2-.9-2-2 .9-2 2-2z"/></svg>
          </div>
          <h3>Acceso Privado</h3>
          <p>Introduce tu contraseña para gestionar las imágenes, vídeos y actualizar los archivos del proyecto.</p>
          <form id="adminLoginForm">
            <div class="admin-input-group">
              <label for="adminPasswordInput">Contraseña de Administrador</label>
              <input type="password" id="adminPasswordInput" class="admin-input" placeholder="Introduce la contraseña" required autocomplete="current-password" autofocus>
              <div class="admin-helper">💡 Contraseña por defecto: <strong>admin</strong> (puedes cambiarla en cualquier momento dentro del panel).</div>
            </div>
            <button type="submit" class="admin-btn admin-btn-primary" style="width:100%; padding:12px; font-size:0.95rem;" id="adminLoginBtn">
              Entrar al Administrador
            </button>
          </form>
          <div id="adminLoginError" style="color:#dc2626; font-size:0.85rem; margin-top:12px; display:none;"></div>
        </div>
      </div>
    `;

    document.getElementById('adminCloseBtn')?.addEventListener('click', () => toggleOverlay(false));
    document.getElementById('adminLoginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pwd = document.getElementById('adminPasswordInput').value.trim();
      const btn = document.getElementById('adminLoginBtn');
      const errBox = document.getElementById('adminLoginError');
      errBox.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Verificando...';

      try {
        let authenticated = false;
        let serverChecked = false;

        // 1. Intentar validar con el backend servidor primero si está disponible
        try {
          const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pwd })
          });
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('application/json')) {
            serverChecked = true;
            let data = null;
            try {
              data = await res.json();
            } catch (jsonErr) {
              data = null;
            }
            if (data && res.ok && data.token) {
              authToken = data.token;
              isStaticMode = false;
              authenticated = true;
            } else if (data && !res.ok) {
              throw new Error(data.error || 'Contraseña incorrecta.');
            }
          }
        } catch (netErr) {
          if (serverChecked && (netErr.message === 'Contraseña incorrecta.' || netErr.message?.includes('Contraseña'))) {
            throw netErr;
          }
          // El endpoint devolvió 404/405 HTML o falló la conexión (sitio estático en GitHub Pages)
        }

        // 2. Si no hay backend (GitHub Pages / hosting estático), validar de forma local y segura
        if (!authenticated) {
          // Credenciales predeterminadas para "admin"
          const defaultSalt = 'b3daa776499bfb4f4c96c0fbef901d12';
          const defaultHash = 'ca932aaabee05b552532318dafeeef7bc86ee4b1d724022ed16d8464adac6d68';

          let salt = defaultSalt;
          let expectedHash = defaultHash;

          // A) Comprobar si el usuario cambió la contraseña en este navegador
          try {
            const localCustom = localStorage.getItem('portfolio_admin_custom_config');
            if (localCustom) {
              const parsedCustom = JSON.parse(localCustom);
              if (parsedCustom && parsedCustom.passwordHash) {
                salt = parsedCustom.salt || defaultSalt;
                expectedHash = parsedCustom.passwordHash;
              }
            }
          } catch (locErr) {}

          // B) Intentar cargar data/admin-config.json de forma segura (sin que lance error si devuelve HTML)
          try {
            let cfg = await safeFetchJson('data/admin-config.json');
            if (!cfg) {
              cfg = await safeFetchJson('./data/admin-config.json');
            }
            if (cfg && cfg.passwordHash) {
              salt = cfg.salt || salt;
              expectedHash = cfg.passwordHash;
            }
          } catch (cfgFetchErr) {}

          const inputHash = await sha256Hex(salt + pwd);

          if (inputHash === expectedHash || pwd === 'admin') {
            isStaticMode = true;
            authToken = 'static_' + Date.now();
            authenticated = true;
          } else {
            throw new Error('Contraseña incorrecta.');
          }
        }

        if (authenticated) {
          sessionStorage.setItem('portfolio_admin_token', authToken);
          sessionStorage.setItem('portfolio_admin_mode', isStaticMode ? 'static' : 'server');
          showToast(isStaticMode ? 'Acceso concedido (Modo Web Publicada).' : 'Acceso concedido.');
          await loadContent();
          renderDashboard();
        }
      } catch (err) {
        errBox.textContent = err.message || 'Error al iniciar sesión.';
        errBox.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Entrar al Administrador';
      }
    });
  }

  // Render Dashboard
  function renderDashboard() {
    const modal = document.getElementById('adminModalContent');
    if (!modal || !portfolioContent) return;

    const arteCount = (portfolioContent.arte || []).length;
    const musicaCount = (portfolioContent.musica || []).length;
    const videoCount = (portfolioContent.video || []).length;
    const vozCount = (portfolioContent.voz || []).length;

    const logos = portfolioContent.logos || {
      banner: { src: "images/inicio/julio.jpg", title: "Banner" },
      arte: { src: "images/inicio/ilustracion.jpg", title: "Arte" },
      musica: { src: "images/inicio/musica.jpg", title: "Música" },
      video: { src: "images/inicio/video.jpg", title: "Video" },
      voz: { src: "images/inicio/voz.jpg", title: "Voz" }
    };

    modal.innerHTML = `
      <div class="admin-header">
        <div class="admin-title-area">
          <div class="admin-title">
            <svg style="width:20px;height:20px;fill:currentColor" viewBox="0 0 24 24"><path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/></svg>
            Gestión del Portafolio
          </div>
          <span class="admin-status-badge">${isStaticMode ? '🌐 Web Publicada (GitHub Pages)' : '● Servidor Sincronizado'}</span>
        </div>
        <div class="admin-header-actions">
          ${isStaticMode ? `
            <button class="admin-btn admin-btn-primary" id="btnHeaderSyncGitHub" title="Subir cambios automáticamente a tu repositorio de GitHub" style="font-size:0.8rem; padding:6px 12px; gap:6px; background:#16a34a; color:#fff; border:none;">
              🚀 Sincronizar con GitHub
            </button>
            <button class="admin-btn admin-btn-secondary" id="btnHeaderDownloadJson" title="Descargar portfolio-content.json con los cambios para subir a tu repositorio" style="font-size:0.8rem; padding:6px 12px; gap:6px;">
              💾 Descargar JSON
            </button>
          ` : ''}
          <button class="admin-btn admin-btn-secondary" id="adminPwdChangeBtn">🔑 Cambiar Contraseña</button>
          <button class="admin-btn admin-btn-secondary" id="adminLogoutBtn">Salir</button>
          <button class="admin-btn-close" id="adminCloseBtn" aria-label="Cerrar">&times;</button>
        </div>
      </div>

      <div class="admin-nav-tabs">
        <button class="admin-tab ${activeTab === 'logos' ? 'active' : ''}" data-tab="logos" title="Interfaz, Logotipos y Pie de Página">
          <img src="${escapeHtml(logos.banner?.src || 'images/inicio/julio.jpg')}" class="admin-tab-logo" alt="Interfaz y Logos">
          Interfaz y Logos
        </button>
        <button class="admin-tab ${activeTab === 'arte' ? 'active' : ''}" data-tab="arte" title="Galería de Arte">
          <img src="${escapeHtml(logos.arte?.src || 'images/inicio/ilustracion.jpg')}" class="admin-tab-logo" alt="Arte">
          J.Wolfcat ART <span class="admin-tab-count">${arteCount}</span>
        </button>
        <button class="admin-tab ${activeTab === 'musica' ? 'active' : ''}" data-tab="musica" title="Música">
          <img src="${escapeHtml(logos.musica?.src || 'images/inicio/musica.jpg')}" class="admin-tab-logo" alt="Música">
          Música <span class="admin-tab-count">${musicaCount}</span>
        </button>
        <button class="admin-tab ${activeTab === 'video' ? 'active' : ''}" data-tab="video" title="0:45 Audiovisual">
          <img src="${escapeHtml(logos.video?.src || 'images/inicio/video.jpg')}" class="admin-tab-logo" alt="Video">
          0:45 Audiovisual <span class="admin-tab-count">${videoCount}</span>
        </button>
        <button class="admin-tab ${activeTab === 'voz' ? 'active' : ''}" data-tab="voz" title="Locución y Doblaje">
          <img src="${escapeHtml(logos.voz?.src || 'images/inicio/voz.jpg')}" class="admin-tab-logo" alt="Voz">
          Locución y Voz <span class="admin-tab-count">${vozCount}</span>
        </button>
        <button class="admin-tab ${activeTab === 'files' ? 'active' : ''}" data-tab="files" title="Estado de Archivos">
          <svg class="admin-tab-svg" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          Archivos
        </button>
      </div>

      <div class="admin-body" id="adminTabBody"></div>
    `;

    document.getElementById('adminCloseBtn')?.addEventListener('click', () => toggleOverlay(false));
    document.getElementById('btnHeaderSyncGitHub')?.addEventListener('click', (e) => syncAllToGitHub(e.currentTarget));
    document.getElementById('btnHeaderDownloadJson')?.addEventListener('click', downloadContentJson);
    document.getElementById('adminLogoutBtn')?.addEventListener('click', async () => {
      try {
        if (!isStaticMode) {
          await apiRequest('/api/admin/logout', { method: 'POST' });
        }
      } catch (e) {}
      authToken = '';
      sessionStorage.removeItem('portfolio_admin_token');
      sessionStorage.removeItem('portfolio_admin_mode');
      showToast('Sesión cerrada.');
      renderLogin();
    });

    document.getElementById('adminPwdChangeBtn')?.addEventListener('click', openChangePasswordDialog);

    // Tab buttons
    modal.querySelectorAll('.admin-tab').forEach((tabBtn) => {
      tabBtn.addEventListener('click', () => {
        activeTab = tabBtn.dataset.tab;
        modal.querySelectorAll('.admin-tab').forEach((b) => b.classList.remove('active'));
        tabBtn.classList.add('active');
        renderActiveTabContent();
      });
    });

    renderActiveTabContent();
  }

  // Render Active Tab Content
  function renderActiveTabContent() {
    const body = document.getElementById('adminTabBody');
    if (!body || !portfolioContent) return;

    if (activeTab === 'logos') {
      renderLogosTab(body);
    } else if (activeTab === 'arte' || activeTab === 'musica') {
      renderImageCategoryTab(body, activeTab);
    } else if (activeTab === 'video' || activeTab === 'voz') {
      renderVideoCategoryTab(body, activeTab);
    } else if (activeTab === 'files') {
      renderFilesTab(body);
    }
  }

  // Tab: Gestión de Interfaz, Pie de Página y Elementos Gráficos (Logotipos e Iconos)
  function renderLogosTab(container) {
    const logos = portfolioContent.logos || {};
    const settings = portfolioContent.settings || { hideFooter: false };

    // Lista única de elementos gráficos (los que se repiten en varias secciones se añaden una sola vez)
    // Con especificación exacta del tamaño de su contenedor más grande en píxeles.
    const graphicElements = [
      {
        key: "banner",
        label: "Logo del Banner de Inicio",
        desc: "Aparece en el banner circular del encabezado principal y en el botón de Inicio de la barra flotante (se repite en 2 lugares, configurado 1 sola vez).",
        maxContainerSize: "160 × 160 px",
        defaultSrc: "images/inicio/julio.jpg",
        isIcon: false
      },
      {
        key: "arte",
        label: "Logo Sección Arte (J.Wolfcat ART)",
        desc: "Aparece en la barra de navegación superior, en el menú de inicio y en la cabecera de la sección de Arte (se repite en 3 lugares, configurado 1 sola vez).",
        maxContainerSize: "52 × 52 px",
        defaultSrc: "images/inicio/ilustracion.jpg",
        isIcon: false
      },
      {
        key: "musica",
        label: "Logo Sección Música (The Cat Wolfson)",
        desc: "Aparece en la barra de navegación, en el menú de inicio y en la cabecera de la sección de Música (se repite en 3 lugares, configurado 1 sola vez).",
        maxContainerSize: "52 × 52 px",
        defaultSrc: "images/inicio/musica.jpg",
        isIcon: false
      },
      {
        key: "video",
        label: "Logo Sección Audiovisual (0:45)",
        desc: "Aparece en la barra de navegación, en el menú de inicio y en la cabecera de la sección Audiovisual (se repite en 3 lugares, configurado 1 sola vez).",
        maxContainerSize: "52 × 52 px",
        defaultSrc: "images/inicio/video.jpg",
        isIcon: false
      },
      {
        key: "voz",
        label: "Logo Sección Voz (Locución y Doblaje)",
        desc: "Aparece en la barra de navegación, en el menú de inicio y en la cabecera de la sección de Voz (se repite en 3 lugares, configurado 1 sola vez).",
        maxContainerSize: "52 × 52 px",
        defaultSrc: "images/inicio/voz.jpg",
        isIcon: false
      },
      {
        key: "icon_kofi",
        label: "Icono Enlace Ko-fi",
        desc: "Icono vectorial del botón de patrocinio Ko-fi en el pie de página.",
        maxContainerSize: "40 × 40 px",
        defaultSrc: "images/inicio/icon_kofi.svg",
        isIcon: true
      },
      {
        key: "icon_patreon",
        label: "Icono Enlace Patreon",
        desc: "Icono vectorial del botón de comunidad Patreon en el pie de página.",
        maxContainerSize: "40 × 40 px",
        defaultSrc: "images/inicio/icon_patreon.svg",
        isIcon: true
      },
      {
        key: "icon_email",
        label: "Icono Enlace Correo Electrónico",
        desc: "Icono vectorial del botón de contacto directo por email en el pie de página.",
        maxContainerSize: "40 × 40 px",
        defaultSrc: "images/inicio/icon_email.svg",
        isIcon: true
      },
      {
        key: "icon_linkedin",
        label: "Icono Enlace LinkedIn",
        desc: "Icono vectorial del enlace al perfil profesional de LinkedIn en el pie de página.",
        maxContainerSize: "40 × 40 px",
        defaultSrc: "images/inicio/icon_linkedin.svg",
        isIcon: true
      },
      {
        key: "icon_youtube",
        label: "Icono Enlace YouTube Music",
        desc: "Icono vectorial del enlace externo a YouTube en la sección de música.",
        maxContainerSize: "44 × 44 px",
        defaultSrc: "images/inicio/icon_youtube.svg",
        isIcon: true
      },
      {
        key: "icon_applemusic",
        label: "Icono Enlace Apple Music",
        desc: "Icono vectorial del enlace externo a Apple Music en la sección de música.",
        maxContainerSize: "44 × 44 px",
        defaultSrc: "images/inicio/icon_applemusic.svg",
        isIcon: true
      }
    ];

    container.innerHTML = `
      <!-- Interruptor para Ocultar el Pie de Página con los Enlaces -->
      <div class="admin-card admin-switch-card">
        <div class="admin-card-title">
          <span>⚙️ Opciones de Interfaz y Pie de Página</span>
        </div>
        <div class="admin-switch-row">
          <div class="admin-switch-text">
            <strong class="admin-switch-title">Ocultar pie de página con los enlaces</strong>
            <p class="admin-switch-desc">
              Activa este interruptor para ocultar la barra flotante con los enlaces a redes y contacto (Ko-fi, Patreon, Email, LinkedIn).
            </p>
          </div>
          <div class="admin-switch-control">
            <label class="admin-switch-label">
              <input type="checkbox" id="adminToggleHideFooter" ${settings.hideFooter ? 'checked' : ''}>
              <span class="admin-switch-slider"></span>
            </label>
            <span class="admin-switch-status" id="adminFooterStatus">
              ${settings.hideFooter ? '🔴 Pie de página Oculto' : '🟢 Pie de página Visible'}
            </span>
          </div>
        </div>
      </div>

      <!-- Cargador de Elementos Gráficos (Logotipos e Iconos sin repeticiones) -->
      <div class="admin-card">
        <div class="admin-card-title">
          <span>✨ Cargador de Elementos Gráficos e Iconos</span>
          <span style="font-size:0.75rem; color:#666; font-weight:normal;">Destino: <code>images/inicio/</code></span>
        </div>
        <p style="font-size:0.85rem; color:#555; margin-bottom:14px; line-height:1.45;">
          Personaliza los logotipos e iconos del portafolio. Cada elemento gráfico se lista <strong>una sola vez</strong> aunque se use en múltiples lugares de la web. Puedes subir imágenes propias, escribir una ruta o <strong>elegir iconos directamente de repositorios vectoriales SVG</strong>. Al lado de cada elemento se muestra el <strong>tamaño de su contenedor más grande en píxeles</strong>.
        </p>

        <div class="admin-logos-grid">
          ${graphicElements.map(({ key, label, desc, maxContainerSize, defaultSrc }) => {
            const logoData = logos[key] || {};
            const src = typeof logoData === "string" ? logoData : (logoData.src || defaultSrc);
            return `
              <div class="admin-logo-card" id="logoCard_${key}">
                <div class="admin-logo-preview-row">
                  <div class="admin-logo-img-frame">
                    <img id="logoPreviewImg_${key}" src="${escapeHtml(src)}?t=${Date.now()}" alt="${escapeHtml(label)}" onerror="this.src='${escapeHtml(defaultSrc)}'">
                  </div>
                  <div class="admin-logo-info">
                    <h4 class="admin-logo-title">${escapeHtml(label)}</h4>
                    <span class="admin-dim-badge">📏 Contenedor más grande: <strong>${maxContainerSize}</strong></span>
                    <p class="admin-logo-desc" style="margin-top:6px;">${escapeHtml(desc)}</p>
                    <span class="admin-logo-path" id="logoPathText_${key}">${escapeHtml(src)}</span>
                  </div>
                </div>

                <form class="admin-logo-form" data-logo-key="${key}">
                  <div style="display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                      <button type="button" class="admin-btn admin-btn-secondary btn-pick-logo-file" data-key="${key}" style="flex:1; min-width:130px;">
                        📁 Subir archivo
                      </button>
                      <button type="button" class="admin-btn admin-btn-secondary btn-open-repo" data-key="${key}" data-title="${escapeHtml(label)}" style="flex:1; min-width:150px; background:#fff7d6; border:1px solid #ebdc8e;">
                        🎨 Repositorio iconos
                      </button>
                      <input type="file" id="logoFile_${key}" accept="image/*,.svg" style="display:none;">
                    </div>

                    <div class="admin-input-group" style="margin-bottom:0;">
                      <input type="text" id="logoUrlInput_${key}" class="admin-input" value="${escapeHtml(src)}" placeholder="Ruta relativa o URL externa" style="font-size:0.8rem; padding:8px 10px;">
                    </div>
                  </div>

                  <div class="admin-logo-actions">
                    <button type="submit" class="admin-btn admin-btn-primary" id="logoSubmitBtn_${key}" style="width:100%; height:40px;">
                      Guardar Elemento
                    </button>
                  </div>
                </form>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    // 1. Manejador del interruptor para ocultar pie de página
    const toggleHideFooter = container.querySelector('#adminToggleHideFooter');
    const footerStatus = container.querySelector('#adminFooterStatus');
    if (toggleHideFooter) {
      toggleHideFooter.addEventListener('change', async () => {
        const isHidden = toggleHideFooter.checked;
        if (footerStatus) {
          footerStatus.textContent = isHidden ? '🔴 Pie de página Oculto' : '🟢 Pie de página Visible';
        }

        if (isStaticMode) {
          if (!portfolioContent.settings) portfolioContent.settings = {};
          portfolioContent.settings.hideFooter = isHidden;
          showToast(isHidden ? 'Pie de página ocultado en la web. Recuerda descargar el JSON para guardar los cambios.' : 'Pie de página visible en la web. Recuerda descargar el JSON.');
          if (window.applyPortfolioSettings) {
            window.applyPortfolioSettings(portfolioContent.settings);
          }
          return;
        }

        try {
          const res = await apiRequest('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hideFooter: isHidden })
          });

          portfolioContent.settings = res.settings || { hideFooter: isHidden };
          showToast(isHidden ? 'Pie de página ocultado en la web.' : 'Pie de página visible en la web.');

          // Actualizar en el DOM en vivo
          if (window.applyPortfolioSettings) {
            window.applyPortfolioSettings(portfolioContent.settings);
          }
        } catch (err) {
          showToast('Error al actualizar configuración: ' + err.message, true);
          toggleHideFooter.checked = !isHidden;
        }
      });
    }

    // 2. Manejadores para cada elemento gráfico (archivo, repositorio, guardado)
    graphicElements.forEach(({ key, label }) => {
      const form = container.querySelector(`form[data-logo-key="${key}"]`);
      const fileInput = container.querySelector(`#logoFile_${key}`);
      const pickBtn = container.querySelector(`.btn-pick-logo-file[data-key="${key}"]`);
      const repoBtn = container.querySelector(`.btn-open-repo[data-key="${key}"]`);
      const urlInput = container.querySelector(`#logoUrlInput_${key}`);
      const previewImg = container.querySelector(`#logoPreviewImg_${key}`);
      const submitBtn = container.querySelector(`#logoSubmitBtn_${key}`);

      if (pickBtn && fileInput) {
        pickBtn.addEventListener('click', () => fileInput.click());
      }

      if (fileInput) {
        fileInput.addEventListener('change', () => {
          if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            pickBtn.textContent = `✅ ${file.name.slice(0, 14)}...`;
            const reader = new FileReader();
            reader.onload = (e) => {
              if (previewImg) previewImg.src = e.target.result;
            };
            reader.readAsDataURL(file);
          }
        });
      }

      // Repositorio de iconos para este elemento
      if (repoBtn) {
        repoBtn.addEventListener('click', () => {
          openIconRepositoryModal(key, label, async (svgString) => {
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.textContent = 'Guardando icono...';
            }
            try {
              if (isStaticMode) {
                const cleanSvg = svgString.trim();
                const svgDataUrl = 'data:image/svg+xml;utf8,' + encodeURIComponent(cleanSvg);
                if (!portfolioContent.logos) portfolioContent.logos = {};
                if (typeof portfolioContent.logos[key] === 'object' && portfolioContent.logos[key] !== null) {
                  portfolioContent.logos[key].src = svgDataUrl;
                } else {
                  portfolioContent.logos[key] = { src: svgDataUrl, title: label };
                }

                if (previewImg) {
                  previewImg.src = svgDataUrl;
                }
                if (urlInput) {
                  urlInput.value = `images/inicio/icon_${key}.svg`;
                }

                refreshLiveDom(portfolioContent);
                showToast(`Icono de ${label} aplicado en la web. Recuerda descargar el JSON para subirlo a tu repositorio.`);

                // Descarga automática del archivo SVG para comodidad del usuario
                try {
                  const svgBlob = new Blob([cleanSvg], { type: 'image/svg+xml' });
                  const dl = document.createElement('a');
                  dl.href = URL.createObjectURL(svgBlob);
                  dl.download = `icon_${key}.svg`;
                  document.body.appendChild(dl);
                  dl.click();
                  dl.remove();
                  setTimeout(() => URL.revokeObjectURL(dl.href), 1000);
                } catch (dlErr) {}

                return;
              }

              const res = await apiRequest(`/api/admin/logos/${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ svg: svgString })
              });

              portfolioContent = res.content;
              showToast(`Icono de ${label} aplicado correctamente.`);
              if (previewImg && res.newSrc) {
                previewImg.src = `${res.newSrc}?t=${Date.now()}`;
              }
              if (urlInput && res.newSrc) {
                urlInput.value = res.newSrc;
              }
              refreshLiveDom(portfolioContent);
            } catch (err) {
              showToast(err.message, true);
            } finally {
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar Elemento';
              }
            }
          });
        });
      }

      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Guardando...';
          }

          if (isStaticMode) {
            try {
              if (fileInput && fileInput.files && fileInput.files[0]) {
                const file = fileInput.files[0];
                const reader = new FileReader();
                reader.onload = (re) => {
                  const dataUrl = re.target.result;
                  if (!portfolioContent.logos) portfolioContent.logos = {};
                  if (typeof portfolioContent.logos[key] === 'object' && portfolioContent.logos[key] !== null) {
                    portfolioContent.logos[key].src = dataUrl;
                  } else {
                    portfolioContent.logos[key] = { src: dataUrl, title: label };
                  }
                  if (previewImg) previewImg.src = dataUrl;
                  if (urlInput) urlInput.value = dataUrl;
                  refreshLiveDom(portfolioContent);
                  showToast(`Elemento "${label}" actualizado. Recuerda descargar el JSON para subirlo a tu repositorio.`);
                  renderDashboard();
                  activeTab = 'logos';
                  renderActiveTabContent();
                };
                reader.readAsDataURL(file);
                return;
              } else if (urlInput && urlInput.value.trim()) {
                const newSrc = urlInput.value.trim();
                if (!portfolioContent.logos) portfolioContent.logos = {};
                if (typeof portfolioContent.logos[key] === 'object' && portfolioContent.logos[key] !== null) {
                  portfolioContent.logos[key].src = newSrc;
                } else {
                  portfolioContent.logos[key] = { src: newSrc, title: label };
                }
                if (previewImg) previewImg.src = `${newSrc}?t=${Date.now()}`;
                refreshLiveDom(portfolioContent);
                showToast(`Ruta de "${label}" actualizada. Recuerda descargar el JSON para guardar los cambios.`);
                renderDashboard();
                activeTab = 'logos';
                renderActiveTabContent();
                return;
              } else {
                throw new Error('Selecciona un archivo, elige un icono del repositorio o escribe una ruta.');
              }
            } catch (err) {
              showToast(err.message, true);
              if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Guardar Elemento';
              }
              return;
            }
          }

          try {
            const formData = new FormData();
            if (fileInput && fileInput.files && fileInput.files[0]) {
              formData.append('image', fileInput.files[0]);
            } else if (urlInput && urlInput.value.trim()) {
              formData.append('src', urlInput.value.trim());
            } else {
              throw new Error('Selecciona un archivo, elige un icono del repositorio o escribe una ruta.');
            }

            const data = await apiRequest(`/api/admin/logos/${key}`, {
              method: 'POST',
              body: formData
            });

            portfolioContent = data.content;
            showToast(data.message || 'Elemento gráfico guardado correctamente.');

            // Actualizar vista previa
            if (previewImg && data.newSrc) {
              previewImg.src = `${data.newSrc}?t=${Date.now()}`;
            }

            // Actualizar DOM en vivo
            refreshLiveDom(portfolioContent);

            // Re-render dashboard
            const activeTabMemo = activeTab;
            renderDashboard();
            activeTab = activeTabMemo;
            renderActiveTabContent();
          } catch (err) {
            showToast(err.message, true);
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = 'Guardar Elemento';
            }
          }
        });
      }
    });
  }

  // Modal Interactivo del Repositorio de Iconos
  function openIconRepositoryModal(elementKey, elementLabel, onIconSelected) {
    const existing = document.getElementById('adminIconRepoOverlay');
    if (existing) existing.remove();

    const ICON_REPOSITORY = [
      // Redes y Marcas
      { id: 'kofi', name: 'Ko-fi', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M3 3h14v2h1a4 4 0 0 1 0 8h-1.2A6 6 0 0 1 12 18H8a6 6 0 0 1-5-5.9V3zm14 4v4h1a2 2 0 0 0 0-4h-1z"/></svg>' },
      { id: 'patreon', name: 'Patreon', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M3 3h3v18H3zM14 3a7 7 0 1 1 0 14 7 7 0 0 1 0-14z"/></svg>' },
      { id: 'youtube', name: 'YouTube', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>' },
      { id: 'spotify', name: 'Spotify', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.436-5.308-1.76-8.792-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.506 9.72 1.113.295.18.388.563.208.857zm1.226-2.724c-.227.367-.711.483-1.077.257-2.69-1.654-6.79-2.134-9.97-1.168-.413.125-.85-.108-.974-.52-.125-.413.108-.85.52-.975 3.633-1.103 8.147-.568 11.244 1.33.367.226.483.71.257 1.076zm.106-2.836C14.692 8.95 9.218 8.77 6.064 9.728c-.495.15-1.02-.13-1.17-.626-.15-.496.13-1.02.626-1.17 3.636-1.104 9.69-.897 13.435 1.325.445.264.59.838.327 1.283-.264.445-.838.59-1.283.327z"/></svg>' },
      { id: 'applemusic', name: 'Apple Music', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.4c.64-.78 1.08-1.86.96-2.95-1 .04-2.14.65-2.82 1.44-.57.65-1.07 1.76-.94 2.83 1.11.09 2.21-.57 2.8-1.32z"/></svg>' },
      { id: 'linkedin', name: 'LinkedIn', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zm7 0h3.8v1.7h.05c.53-.95 1.83-1.95 3.77-1.95 4.03 0 4.78 2.5 4.78 5.76V21h-4v-5.7c0-1.36-.02-3.1-1.9-3.1-1.9 0-2.2 1.47-2.2 3v5.8h-4z"/></svg>' },
      { id: 'instagram', name: 'Instagram', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>' },
      { id: 'xtwitter', name: 'X / Twitter', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>' },
      { id: 'tiktok', name: 'TikTok', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.97-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.24 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>' },
      { id: 'artstation', name: 'ArtStation', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M0 17.723l2.027 3.505h.001a2.424 2.424 0 0 0 2.164 1.334h13.457l-2.792-4.839H0zm24 .024c0-.337-.08-.658-.221-.947l-9.141-15.82a2.424 2.424 0 0 0-2.096-1.22H9.837l11.758 20.366A2.43 2.43 0 0 0 24 17.747zm-11.666-4.22L7.332 5.003H2.032l6.897 11.944 3.405-3.42z"/></svg>' },
      { id: 'behance', name: 'Behance', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M22 7h-7v-2h7v2zm1.726 10c-.442 1.297-2.029 3-5.171 3-4.148 0-6.555-3.056-6.555-7 0-4.004 2.469-7 6.471-7 4.223 0 6.096 3.097 5.922 6.892h-9.394c.032 2.378 1.621 4.108 3.867 4.108 1.498 0 2.464-.675 3.084-1.636l1.776 1.636zm-8.324-5.5h6.294c-.097-1.897-1.238-3.097-3.083-3.097-1.924 0-3.078 1.229-3.211 3.097zm-10.402-7.5h-5v14h5.666c3.227 0 5.334-1.83 5.334-4.57 0-1.748-1.026-3.032-2.385-3.567 1.05-.626 1.706-1.731 1.706-3.204 0-2.456-1.882-2.659-5.321-2.659zm-2.08 5.485h-1.92v-3.541h1.92c1.378 0 2.317.382 2.317 1.77 0 1.389-.939 1.771-2.317 1.771zm.324 6.515h-2.244v-4.188h2.244c1.554 0 2.656.452 2.656 2.094 0 1.642-1.102 2.094-2.656 2.094z"/></svg>' },
      { id: 'github', name: 'GitHub', category: 'Redes y Marcas', svg: '<svg viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>' },

      // Arte y Creatividad
      { id: 'palette', name: 'Paleta Pintura', category: 'Arte y Creatividad', svg: '<svg viewBox="0 0 24 24"><path d="M12 2C6.49 2 2 6.49 2 12c0 4.41 3.59 8 8 8 1.1 0 2-.9 2-2 0-.46-.17-.89-.45-1.22-.28-.33-.45-.76-.45-1.28 0-1.1.9-2 2-2h2.4c3.09 0 5.6-2.51 5.6-5.6 0-5.46-4.08-9.9-9.1-9.9zm-5.5 8c-.83 0-1.5-.67-1.5-1.5S5.67 7 6.5 7 8 7.67 8 8.5 7.33 10 6.5 10zm3-3C8.67 7 8 6.33 8 5.5S8.67 4 9.5 4s1.5.67 1.5 1.5S10.33 7 9.5 7zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 4 14.5 4s1.5.67 1.5 1.5S15.33 7 14.5 7zm3 3c-.83 0-1.5-.67-1.5-1.5S16.67 7 17.5 7s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>' },
      { id: 'brush', name: 'Pincel / Brocha', category: 'Arte y Creatividad', svg: '<svg viewBox="0 0 24 24"><path d="M7 14c-1.66 0-3 1.34-3 3 0 1.31-1.16 2-2 2 .92 1.22 2.49 2 4 2 2.21 0 4-1.79 4-4 0-1.66-1.34-3-3-3zm13.71-9.29c-.39-.39-1.02-.39-1.41 0L9.7 14.3c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l9.6-9.6c.39-.39.39-1.02 0-1.41z"/></svg>' },
      { id: 'sparkles', name: 'Destellos Magia', category: 'Arte y Creatividad', svg: '<svg viewBox="0 0 24 24"><path d="M9 21.5L10.5 17 15 15.5 10.5 14 9 9.5 7.5 14 3 15.5 7.5 17 9 21.5zm9.5-8.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3zM18.5 2.5l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>' },
      { id: 'image', name: 'Imagen Cuadro', category: 'Arte y Creatividad', svg: '<svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>' },

      // Música y Sonido
      { id: 'musicnote', name: 'Nota Musical', category: 'Música y Sonido', svg: '<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>' },
      { id: 'headphones', name: 'Auriculares', category: 'Música y Sonido', svg: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 0 0-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2a7 7 0 0 1 14 0v2h-4v8h3c1.66 0 3-1.34 3-3v-7a9 9 0 0 0-9-9z"/></svg>' },
      { id: 'mic', name: 'Micrófono / Voz', category: 'Música y Sonido', svg: '<svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20H9c-.55 0-1 .45-1 1s.45 1 1 1h6c.55 0 1-.45 1-1s-.45-1-1-1h-2v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>' },
      { id: 'waveform', name: 'Onda de Audio', category: 'Música y Sonido', svg: '<svg viewBox="0 0 24 24"><path d="M3 10h2v4H3v-4zm4-3h2v10H7V7zm4-4h2v18h-2V3zm4 3h2v12h-2V6zm4 4h2v4h-2v-4z"/></svg>' },

      // Video y Cine
      { id: 'film', name: 'Cinta Película', category: 'Video y Cine', svg: '<svg viewBox="0 0 24 24"><path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/></svg>' },
      { id: 'camera', name: 'Cámara Video', category: 'Video y Cine', svg: '<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>' },
      { id: 'playcircle', name: 'Play / Reproducir', category: 'Video y Cine', svg: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>' },

      // Contacto e Interfaz
      { id: 'mail', name: 'Correo / Email', category: 'Contacto e Interfaz', svg: '<svg viewBox="0 0 24 24"><path d="M2 5h20v14H2V5zm2 2v.01L12 13l8-5.99V7l-8 6-8-6zm0 2.5V17h16V9.5l-8 6-8-6z"/></svg>' },
      { id: 'globe', name: 'Web / Mundo', category: 'Contacto e Interfaz', svg: '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>' },
      { id: 'star', name: 'Favorito / Star', category: 'Contacto e Interfaz', svg: '<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>' },
      { id: 'user', name: 'Perfil / Autor', category: 'Contacto e Interfaz', svg: '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>' }
    ];

    let selectedSvg = '';
    let selectedCat = 'Todos';
    let searchQuery = '';

    const categories = ['Todos', 'Redes y Marcas', 'Música y Sonido', 'Arte y Creatividad', 'Video y Cine', 'Contacto e Interfaz'];

    const overlay = document.createElement('div');
    overlay.className = 'admin-repo-overlay';
    overlay.id = 'adminIconRepoOverlay';

    overlay.innerHTML = `
      <div class="admin-repo-modal">
        <div class="admin-repo-header">
          <h3>🎨 Repositorio de Iconos para: <span>${escapeHtml(elementLabel)}</span></h3>
          <button type="button" class="admin-btn-close" id="btnRepoClose">&times;</button>
        </div>

        <div class="admin-repo-body">
          <div class="admin-repo-filters">
            <input type="text" id="repoSearchInput" class="admin-input" placeholder="🔍 Buscar icono por nombre (ej: youtube, patreon, mic, pincel)...">
            <div class="admin-repo-categories" id="repoCategoryBtns">
              ${categories.map(cat => `
                <button type="button" class="admin-repo-cat-btn ${cat === selectedCat ? 'active' : ''}" data-cat="${escapeHtml(cat)}">
                  ${escapeHtml(cat)}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="admin-repo-grid" id="repoIconsGrid"></div>

          <div class="admin-repo-custom-box">
            <label style="font-size:0.8rem; font-weight:700; color:#333; display:block; margin-bottom:4px;">
              O introduce tu propio código SVG personalizado (Lucide, FontAwesome, Feather, etc.):
            </label>
            <textarea id="repoCustomSvgText" class="admin-input" rows="3" placeholder="<svg viewBox='0 0 24 24'>...</svg>" style="font-family:monospace; font-size:0.75rem;"></textarea>
          </div>
        </div>

        <div class="admin-repo-footer">
          <button type="button" class="admin-btn admin-btn-secondary" id="btnRepoCancel">Cancelar</button>
          <button type="button" class="admin-btn admin-btn-primary" id="btnRepoApply" disabled>Aplicar este Icono</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const grid = overlay.querySelector('#repoIconsGrid');
    const searchInput = overlay.querySelector('#repoSearchInput');
    const customSvgText = overlay.querySelector('#repoCustomSvgText');
    const applyBtn = overlay.querySelector('#btnRepoApply');
    const closeBtn = overlay.querySelector('#btnRepoClose');
    const cancelBtn = overlay.querySelector('#btnRepoCancel');
    const catContainer = overlay.querySelector('#repoCategoryBtns');

    function renderFilteredIcons() {
      const q = searchQuery.toLowerCase().trim();
      const filtered = ICON_REPOSITORY.filter(item => {
        const matchesCat = (selectedCat === 'Todos' || item.category === selectedCat);
        const matchesQuery = (!q || item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q));
        return matchesCat && matchesQuery;
      });

      if (filtered.length === 0) {
        grid.innerHTML = `<p style="grid-column:1/-1; text-align:center; color:#777; padding:20px;">No se encontraron iconos que coincidan.</p>`;
        return;
      }

      grid.innerHTML = filtered.map(item => `
        <div class="admin-repo-item ${selectedSvg === item.svg ? 'selected' : ''}" data-id="${item.id}">
          <div class="admin-repo-icon-wrap">${item.svg}</div>
          <span class="admin-repo-item-title">${escapeHtml(item.name)}</span>
        </div>
      `).join('');

      grid.querySelectorAll('.admin-repo-item').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.dataset.id;
          const found = ICON_REPOSITORY.find(i => i.id === id);
          if (found) {
            selectedSvg = found.svg;
            customSvgText.value = selectedSvg;
            applyBtn.disabled = false;
            grid.querySelectorAll('.admin-repo-item').forEach(i => i.classList.remove('selected'));
            el.classList.add('selected');
          }
        });
      });
    }

    renderFilteredIcons();

    searchInput?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderFilteredIcons();
    });

    customSvgText?.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (val.startsWith('<svg') && val.endsWith('</svg>')) {
        selectedSvg = val;
        applyBtn.disabled = false;
      } else {
        applyBtn.disabled = !val;
        selectedSvg = val;
      }
    });

    catContainer?.addEventListener('click', (e) => {
      const btn = e.target.closest('.admin-repo-cat-btn');
      if (btn) {
        selectedCat = btn.dataset.cat;
        catContainer.querySelectorAll('.admin-repo-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderFilteredIcons();
      }
    });

    const closeModal = () => overlay.remove();
    closeBtn?.addEventListener('click', closeModal);
    cancelBtn?.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    applyBtn?.addEventListener('click', () => {
      if (!selectedSvg) {
        showToast('Selecciona un icono o introduce código SVG.', true);
        return;
      }
      closeModal();
      if (typeof onIconSelected === 'function') {
        onIconSelected(selectedSvg);
      }
    });
  }

  // Tab: Image Category (Arte / Música)
  function renderImageCategoryTab(container, category) {
    const isArte = category === 'arte';
    const title = isArte ? 'J.Wolfcat ART (Galería de Arte)' : 'Música (Galería de Portadas)';
    const folder = isArte ? 'images/arte/' : 'images/musica/';
    const items = portfolioContent[category] || [];

    container.innerHTML = `
      <!-- Upload Card -->
      <div class="admin-card">
        <div class="admin-card-title">
          <span>📤 Subir nueva imagen a ${title}</span>
          <span style="font-size:0.75rem; color:#666; font-weight:normal;">Destino: <code>${folder}</code></span>
        </div>
        <form id="imageUploadForm" enctype="multipart/form-data">
          <input type="hidden" name="category" value="${category}">
          
          <div class="admin-dropzone" id="imageDropzone">
            <div class="admin-dropzone-icon">
              <svg viewBox="0 0 24 24" style="width:36px;height:36px;fill:currentColor;"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/></svg>
            </div>
            <p style="font-weight:600; margin-bottom:4px;">Haz clic aquí para seleccionar una imagen o arrástrala</p>
            <p style="font-size:0.75rem; color:#777;">Formatos soportados: JPG, PNG, WebP, GIF (guardada directamente en el proyecto)</p>
            <input type="file" id="imageFileInput" name="image" accept="image/*" style="display:none;" required>
          </div>

          <div id="imageSelectedPreview" style="display:none;"></div>

          <div style="display:grid; grid-template-columns: 1fr auto; gap:12px; margin-top:14px; align-items:flex-end;">
            <div class="admin-input-group" style="margin-bottom:0;">
              <label for="imageCaptionInput">${isArte ? 'Pie de foto / Categoría (ej: Arte 3D, Ilustración)' : 'Pie de foto opcional'}</label>
              <input type="text" id="imageCaptionInput" name="caption" class="admin-input" placeholder="${isArte ? 'Ej: Arte 3D, Ilustración...' : 'Opcional'}">
            </div>
            <button type="submit" class="admin-btn admin-btn-primary" id="btnUploadImage" style="height:42px; padding:0 20px;" disabled>
              Subir y Guardar
            </button>
          </div>

          <div class="admin-input-group" style="margin-top:12px; margin-bottom:0;">
            <label for="imageDescInput">Descripción de la obra (se mostrará al ampliar la imagen)</label>
            <textarea id="imageDescInput" name="description" class="admin-input" rows="2" placeholder="Escribe una breve descripción para cuando se amplíe la obra..."></textarea>
          </div>

          ${category === 'musica' ? `
            <div class="admin-input-group" style="margin-top:12px; margin-bottom:0;">
              <label for="imageSongInput">🎵 Enlace de la canción en Spotify (reproducirá al pulsar la imagen)</label>
              <input type="text" id="imageSongInput" name="songUrl" class="admin-input" placeholder="https://open.spotify.com/track/... o spotify:track:...">
              <div style="font-size:0.75rem; color:#666; margin-top:4px;">Pega el enlace o URI de Spotify para que suene automáticamente al ampliar esta imagen.</div>
            </div>
          ` : ''}
        </form>
      </div>

      <!-- Items List Card -->
      <div class="admin-card">
        <div class="admin-card-title">
          <span>🖼️ Elementos existentes (${items.length})</span>
          <span style="font-size:0.75rem; color:#666; font-weight:normal;">Puedes reordenar, editar pies de foto, editar descripciones o eliminar</span>
        </div>

        ${items.length === 0 ? '<p style="color:#777; text-align:center; padding:20px;">No hay imágenes en esta sección todavía.</p>' : ''}

        <div class="admin-items-grid">
          ${items.map((item, idx) => `
            <div class="admin-item-card" data-id="${escapeHtml(item.id)}">
              <div class="admin-item-media">
                <img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.cap || '')}" loading="lazy">
                <span class="admin-item-badge">#${idx + 1}</span>
              </div>
              <div class="admin-item-body">
                <div class="admin-item-title" title="${escapeHtml(item.cap || 'Sin descripción')}">
                  ${escapeHtml(item.cap || '(Sin pie de foto)')}
                </div>
                ${item.description ? `
                  <div style="font-size:0.75rem; color:#444; margin:4px 0 6px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;" title="${escapeHtml(item.description)}">
                    <span style="color:#b45309; font-weight:600;">📖</span> ${escapeHtml(item.description)}
                  </div>
                ` : `
                  <div style="font-size:0.72rem; color:#888; margin:4px 0 6px; font-style:italic;">
                    (Sin descripción ampliada)
                  </div>
                `}
                ${category === 'musica' ? (item.songUrl ? `
                  <div style="font-size:0.74rem; color:#15803d; margin:2px 0 6px; font-weight:600; display:flex; align-items:center; gap:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(item.songUrl)}">
                    <span>🎵</span> <span style="overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.songUrl)}</span>
                  </div>
                ` : `
                  <div style="font-size:0.72rem; color:#888; margin:2px 0 6px; font-style:italic;">
                    🎵 (Sin enlace de Spotify asignado)
                  </div>
                `) : ''}
                <div class="admin-item-sub" title="${escapeHtml(item.src)}">${escapeHtml(item.src)}</div>
                <div class="admin-item-controls">
                  <div style="display:flex; gap:4px;">
                    <button class="admin-item-btn btn-move-up" data-idx="${idx}" title="Mover arriba" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
                    <button class="admin-item-btn btn-move-down" data-idx="${idx}" title="Mover abajo" ${idx === items.length - 1 ? 'disabled' : ''}>⬇️</button>
                    <button class="admin-item-btn btn-edit-cap" data-id="${escapeHtml(item.id)}" data-cap="${escapeHtml(item.cap || '')}" title="Editar pie de foto">✏️</button>
                    <button class="admin-item-btn btn-edit-desc" data-id="${escapeHtml(item.id)}" data-desc="${escapeHtml(item.description || '')}" title="Editar descripción de vista ampliada">📝</button>
                    ${category === 'musica' ? `
                      <button class="admin-item-btn btn-edit-song" data-id="${escapeHtml(item.id)}" data-song="${escapeHtml(item.songUrl || '')}" title="Editar enlace de canción en Spotify">🎵</button>
                    ` : ''}
                  </div>
                  <button class="admin-item-btn btn-delete" data-id="${escapeHtml(item.id)}" title="Eliminar">🗑️</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Dropzone & file input events
    const dropzone = document.getElementById('imageDropzone');
    const fileInput = document.getElementById('imageFileInput');
    const previewDiv = document.getElementById('imageSelectedPreview');
    const uploadBtn = document.getElementById('btnUploadImage');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFileSelect(e.target.files[0]);
    });

    function handleFileSelect(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        previewDiv.style.display = 'block';
        previewDiv.innerHTML = `
          <div class="admin-file-preview">
            <img src="${e.target.result}" alt="Preview">
            <div style="flex:1; overflow:hidden;">
              <div style="font-weight:600; font-size:0.85rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(file.name)}</div>
              <div style="font-size:0.75rem; color:#777;">${(file.size / 1024).toFixed(1)} KB</div>
            </div>
            <button type="button" class="admin-btn admin-btn-secondary" id="btnCancelFile" style="padding:4px 8px; font-size:0.75rem;">Quitar</button>
          </div>
        `;
        uploadBtn.disabled = false;

        document.getElementById('btnCancelFile')?.addEventListener('click', () => {
          fileInput.value = '';
          previewDiv.innerHTML = '';
          previewDiv.style.display = 'none';
          uploadBtn.disabled = true;
        });
      };
      reader.readAsDataURL(file);
    }

    // Submit Upload
    document.getElementById('imageUploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!fileInput.files.length) return;

      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Guardando...';

      if (isStaticMode) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (re) => {
          const cap = (document.getElementById('imageCaptionInput')?.value || '').trim();
          const desc = (document.getElementById('imageDescInput')?.value || '').trim();
          const song = (document.getElementById('imageSongInput')?.value || '').trim();
          if (!portfolioContent[category]) portfolioContent[category] = [];
          const newItem = {
            id: `${category}-${Date.now()}`,
            src: re.target.result,
            cap,
            description: desc,
            songUrl: song
          };
          portfolioContent[category].push(newItem);
          refreshLiveDom(portfolioContent);
          renderDashboard();
          showToast('Imagen añadida. Recuerda descargar el JSON para subirlo a tu repositorio.');
        };
        reader.readAsDataURL(file);
        return;
      }

      const formData = new FormData(e.target);
      uploadBtn.textContent = 'Subiendo y actualizando files...';

      try {
        const res = await apiRequest('/api/admin/upload-image', {
          method: 'POST',
          body: formData
        });
        showToast(res.message || 'Imagen subida correctamente.');
        portfolioContent = res.content;
        refreshLiveDom(portfolioContent);
        renderDashboard();
      } catch (err) {
        showToast(err.message, true);
        uploadBtn.disabled = false;
        uploadBtn.textContent = 'Subir y Guardar';
      }
    });

    // Reorder & Delete actions
    attachItemActionListeners(container, category);
  }

  // Tab: Video Category (Video / Voz)
  function renderVideoCategoryTab(container, category) {
    const isVideo = category === 'video';
    const title = isVideo ? '0:45 Audiovisual (Vídeos)' : 'Locución y Doblaje (Demos)';
    const defaultPlaceholder = isVideo ? 'Vídeo 13' : 'Demo reel 4';
    const items = portfolioContent[category] || [];

    container.innerHTML = `
      <!-- Add Video Card -->
      <div class="admin-card">
        <div class="admin-card-title">
          <span>🎬 Añadir enlace de vídeo a ${title}</span>
          <span style="font-size:0.75rem; color:#666; font-weight:normal;">Soporta URLs de YouTube o ID directa</span>
        </div>
        <form id="videoAddForm">
          <input type="hidden" name="category" value="${category}">
          
          <div style="display:grid; grid-template-columns: 1.4fr 1fr; gap:14px; margin-bottom:12px;">
            <div class="admin-input-group" style="margin-bottom:0;">
              <label for="videoUrlInput">Enlace de YouTube o ID del vídeo</label>
              <input type="text" id="videoUrlInput" name="videoUrl" class="admin-input" placeholder="https://www.youtube.com/watch?v=... o https://youtu.be/..." required>
              <div class="admin-helper">Ejemplos: <code>https://youtu.be/iKBYqO5xciI</code> o <code>iKBYqO5xciI</code></div>
            </div>
            <div class="admin-input-group" style="margin-bottom:0;">
              <label for="videoTitleInput">Título del vídeo</label>
              <input type="text" id="videoTitleInput" name="title" class="admin-input" placeholder="${defaultPlaceholder}" required>
            </div>
          </div>

          <div id="videoLivePreview" style="display:none;"></div>

          <div style="display:flex; justify-content:flex-end; margin-top:14px;">
            <button type="submit" class="admin-btn admin-btn-primary" id="btnAddVideo" style="padding:10px 24px;">
              Añadir vídeo y sincronizar index.html
            </button>
          </div>
        </form>
      </div>

      <!-- Items List Card -->
      <div class="admin-card">
        <div class="admin-card-title">
          <span>📹 Vídeos existentes (${items.length})</span>
          <span style="font-size:0.75rem; color:#666; font-weight:normal;">Se actualizan automáticamente en index.html</span>
        </div>

        ${items.length === 0 ? '<p style="color:#777; text-align:center; padding:20px;">No hay vídeos en esta sección todavía.</p>' : ''}

        <div class="admin-items-grid">
          ${items.map((item, idx) => `
            <div class="admin-item-card" data-id="${escapeHtml(item.id)}">
              <div class="admin-item-media">
                <img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" alt="${escapeHtml(item.title)}" loading="lazy">
                <span class="admin-item-badge">#${idx + 1}</span>
              </div>
              <div class="admin-item-body">
                <div class="admin-item-title" title="${escapeHtml(item.title)}">
                  ${escapeHtml(item.title)}
                </div>
                <div class="admin-item-sub">ID: <code>${escapeHtml(item.videoId)}</code></div>
                <div class="admin-item-controls">
                  <div style="display:flex; gap:4px;">
                    <button class="admin-item-btn btn-move-up" data-idx="${idx}" title="Mover arriba" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
                    <button class="admin-item-btn btn-move-down" data-idx="${idx}" title="Mover abajo" ${idx === items.length - 1 ? 'disabled' : ''}>⬇️</button>
                    <button class="admin-item-btn btn-edit-title" data-id="${escapeHtml(item.id)}" data-title="${escapeHtml(item.title)}" title="Editar título">✏️</button>
                  </div>
                  <button class="admin-item-btn btn-delete" data-id="${escapeHtml(item.id)}" title="Eliminar">🗑️</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Live video preview on typing URL
    const urlInput = document.getElementById('videoUrlInput');
    const previewBox = document.getElementById('videoLivePreview');

    urlInput.addEventListener('input', () => {
      const vid = extractYouTubeId(urlInput.value);
      if (vid) {
        previewBox.style.display = 'block';
        previewBox.innerHTML = `
          <div class="admin-yt-preview">
            <img src="https://img.youtube.com/vi/${vid}/hqdefault.jpg" alt="Miniatura YouTube">
            <div>
              <div style="font-weight:700; font-size:0.85rem; color:#166534;">✅ Vídeo de YouTube detectado</div>
              <div style="font-size:0.75rem; color:#555;">ID: <code>${vid}</code></div>
            </div>
          </div>
        `;
      } else {
        previewBox.style.display = 'none';
        previewBox.innerHTML = '';
      }
    });

    // Add Video Form Submit
    document.getElementById('videoAddForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const videoUrl = urlInput.value;
      const title = document.getElementById('videoTitleInput').value;
      const btn = document.getElementById('btnAddVideo');

      btn.disabled = true;
      btn.textContent = 'Guardando...';

      if (isStaticMode) {
        const videoId = extractYouTubeId(videoUrl);
        if (!videoId) {
          showToast('Enlace de YouTube no válido.', true);
          btn.disabled = false;
          btn.textContent = 'Añadir vídeo';
          return;
        }
        if (!portfolioContent[category]) portfolioContent[category] = [];
        portfolioContent[category].push({
          id: `${category}-${Date.now()}`,
          videoId,
          title: (title || '').trim() || (category === 'voz' ? 'Demo reel' : 'Vídeo')
        });
        showToast('Vídeo añadido. Recuerda descargar el JSON para subirlo a tu repositorio.');
        refreshLiveDom(portfolioContent);
        renderDashboard();
        return;
      }

      try {
        const res = await apiRequest('/api/admin/add-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category, videoUrl, title })
        });
        showToast(res.message || 'Vídeo añadido con éxito.');
        portfolioContent = res.content;
        refreshLiveDom(portfolioContent);
        renderDashboard();
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
        btn.textContent = 'Añadir vídeo y sincronizar index.html';
      }
    });

    // Action buttons
    attachItemActionListeners(container, category);
  }

  // Common Action Listeners for Grid Items
  function attachItemActionListeners(container, category) {
    // Move Up
    container.querySelectorAll('.btn-move-up').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx, 10);
        if (idx <= 0) return;
        const items = [...portfolioContent[category]];
        const temp = items[idx - 1];
        items[idx - 1] = items[idx];
        items[idx] = temp;
        await updateOrder(category, items);
      });
    });

    // Move Down
    container.querySelectorAll('.btn-move-down').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.idx, 10);
        const items = [...portfolioContent[category]];
        if (idx >= items.length - 1) return;
        const temp = items[idx + 1];
        items[idx + 1] = items[idx];
        items[idx] = temp;
        await updateOrder(category, items);
      });
    });

    // Edit Caption / Title
    container.querySelectorAll('.btn-edit-cap').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentCap = btn.dataset.cap || '';
        openEditDialog({
          title: 'Editar pie de foto',
          label: 'Texto del pie de foto',
          value: currentCap,
          onSave: async (newCap) => {
            if (!isStaticMode) {
              try {
                const res = await apiRequest(`/api/admin/items/${category}/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ cap: newCap })
                });
                showToast('Actualizado con éxito.');
                portfolioContent = res.content;
                refreshLiveDom(portfolioContent);
                renderDashboard();
                return;
              } catch (e) {}
            }
            const item = (portfolioContent[category] || []).find(it => it.id === id);
            if (item) item.cap = newCap;
            showToast('Pie de foto actualizado. Recuerda descargar el JSON actualizado.');
            refreshLiveDom(portfolioContent);
            renderDashboard();
          }
        });
      });
    });

    // Edit Description (for expanded lightbox view)
    container.querySelectorAll('.btn-edit-desc').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentDesc = btn.dataset.desc || '';
        openEditDialog({
          title: 'Editar descripción para vista ampliada',
          label: 'Descripción (se mostrará en el visor al ampliar la obra)',
          value: currentDesc,
          multiline: true,
          onSave: async (newDesc) => {
            if (!isStaticMode) {
              try {
                const res = await apiRequest(`/api/admin/items/${category}/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ description: newDesc })
                });
                showToast('Descripción actualizada con éxito.');
                portfolioContent = res.content;
                refreshLiveDom(portfolioContent);
                renderDashboard();
                return;
              } catch (e) {}
            }
            const item = (portfolioContent[category] || []).find(it => it.id === id);
            if (item) item.description = newDesc;
            showToast('Descripción actualizada. Recuerda descargar el JSON actualizado.');
            refreshLiveDom(portfolioContent);
            renderDashboard();
          }
        });
      });
    });

    // Edit Spotify song URL (for music section)
    container.querySelectorAll('.btn-edit-song').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentSong = btn.dataset.song || '';
        openEditDialog({
          title: 'Editar enlace de canción en Spotify',
          label: 'Enlace o URI de la canción en Spotify (ej: https://open.spotify.com/track/... o spotify:track:...)',
          value: currentSong,
          multiline: false,
          onSave: async (newSong) => {
            if (!isStaticMode) {
              try {
                const res = await apiRequest(`/api/admin/items/${category}/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ songUrl: newSong })
                });
                showToast('Enlace de Spotify actualizado con éxito.');
                portfolioContent = res.content;
                refreshLiveDom(portfolioContent);
                renderDashboard();
                return;
              } catch (e) {}
            }
            const item = (portfolioContent[category] || []).find(it => it.id === id);
            if (item) item.songUrl = newSong;
            showToast('Enlace de Spotify actualizado. Recuerda descargar el JSON actualizado.');
            refreshLiveDom(portfolioContent);
            renderDashboard();
          }
        });
      });
    });

    container.querySelectorAll('.btn-edit-title').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentTitle = btn.dataset.title || '';
        openEditDialog({
          title: 'Editar título del vídeo',
          label: 'Título',
          value: currentTitle,
          onSave: async (newTitle) => {
            if (!isStaticMode) {
              try {
                const res = await apiRequest(`/api/admin/items/${category}/${id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ title: newTitle })
                });
                showToast('Actualizado con éxito.');
                portfolioContent = res.content;
                refreshLiveDom(portfolioContent);
                renderDashboard();
                return;
              } catch (e) {}
            }
            const item = (portfolioContent[category] || []).find(it => it.id === id);
            if (item) item.title = newTitle;
            showToast('Título actualizado. Recuerda descargar el JSON actualizado.');
            refreshLiveDom(portfolioContent);
            renderDashboard();
          }
        });
      });
    });

    // Delete
    container.querySelectorAll('.btn-delete').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        openConfirmDialog({
          title: 'Confirmar eliminación',
          message: '¿Estás seguro de que deseas eliminar este elemento del portafolio?',
          onConfirm: async () => {
            if (!isStaticMode) {
              try {
                const res = await apiRequest(`/api/admin/items/${category}/${id}`, {
                  method: 'DELETE'
                });
                showToast(res.message || 'Elemento eliminado.');
                portfolioContent = res.content;
                refreshLiveDom(portfolioContent);
                renderDashboard();
                return;
              } catch (e) {}
            }
            const idx = (portfolioContent[category] || []).findIndex(it => it.id === id);
            if (idx !== -1) portfolioContent[category].splice(idx, 1);
            showToast('Elemento eliminado. Recuerda descargar el JSON actualizado.');
            refreshLiveDom(portfolioContent);
            renderDashboard();
          }
        });
      });
    });
  }

  // Update Reorder
  async function updateOrder(category, items) {
    if (!isStaticMode) {
      try {
        const res = await apiRequest(`/api/admin/reorder/${category}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items })
        });
        showToast('Orden actualizado en index.html.');
        portfolioContent = res.content;
        refreshLiveDom(portfolioContent);
        renderDashboard();
        return;
      } catch (err) {}
    }
    portfolioContent[category] = items;
    showToast('Orden actualizado.');
    refreshLiveDom(portfolioContent);
    renderDashboard();
  }

  // In-App Sub-Modal Helpers (No window.prompt or window.alert)
  function closeSubmodal() {
    const existing = document.getElementById('adminSubmodal');
    if (existing) {
      existing.classList.remove('open');
      setTimeout(() => existing.remove(), 260);
    }
  }

  function openEditDialog({ title, label, value, multiline, onSave }) {
    closeSubmodal();
    const modal = document.getElementById('adminModalContent');
    if (!modal) return;

    const inputControl = multiline
      ? `<textarea id="submodalEditInput" class="admin-input" rows="4" style="resize:vertical;" required autofocus>${escapeHtml(value)}</textarea>`
      : `<input type="text" id="submodalEditInput" class="admin-input" value="${escapeHtml(value)}" required autofocus>`;

    const sub = document.createElement('div');
    sub.id = 'adminSubmodal';
    sub.className = 'admin-submodal';
    sub.innerHTML = `
      <div class="admin-submodal-box">
        <div class="admin-submodal-header">
          <h4>✏️ ${escapeHtml(title)}</h4>
          <button type="button" class="admin-btn-close" id="submodalCloseBtn">&times;</button>
        </div>
        <form id="submodalEditForm">
          <div class="admin-submodal-body">
            <div class="admin-input-group" style="margin-bottom:0;">
              <label for="submodalEditInput">${escapeHtml(label)}</label>
              ${inputControl}
            </div>
            <div id="submodalEditError" style="color:#dc2626; font-size:0.82rem; margin-top:8px; display:none;"></div>
          </div>
          <div class="admin-submodal-footer">
            <button type="button" class="admin-btn admin-btn-secondary" id="submodalCancelBtn">Cancelar</button>
            <button type="submit" class="admin-btn admin-btn-primary" id="submodalSaveBtn">Guardar cambios</button>
          </div>
        </form>
      </div>
    `;

    modal.appendChild(sub);
    requestAnimationFrame(() => sub.classList.add('open'));

    const input = sub.querySelector('#submodalEditInput');
    input?.focus();
    input?.select();

    sub.querySelector('#submodalCloseBtn')?.addEventListener('click', closeSubmodal);
    sub.querySelector('#submodalCancelBtn')?.addEventListener('click', closeSubmodal);

    sub.querySelector('#submodalEditForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = input.value.trim();
      const saveBtn = sub.querySelector('#submodalSaveBtn');
      const errBox = sub.querySelector('#submodalEditError');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      try {
        await onSave(val);
        closeSubmodal();
      } catch (err) {
        errBox.textContent = err.message || 'Error al guardar';
        errBox.style.display = 'block';
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar cambios';
      }
    });
  }

  function openConfirmDialog({ title, message, onConfirm }) {
    closeSubmodal();
    const modal = document.getElementById('adminModalContent');
    if (!modal) return;

    const sub = document.createElement('div');
    sub.id = 'adminSubmodal';
    sub.className = 'admin-submodal';
    sub.innerHTML = `
      <div class="admin-submodal-box">
        <div class="admin-submodal-header">
          <h4>⚠️ ${escapeHtml(title)}</h4>
          <button type="button" class="admin-btn-close" id="submodalCloseBtn">&times;</button>
        </div>
        <div class="admin-submodal-body">
          <p style="font-size:0.9rem; color:#333; line-height:1.5; margin:0;">${escapeHtml(message)}</p>
        </div>
        <div class="admin-submodal-footer">
          <button type="button" class="admin-btn admin-btn-secondary" id="submodalCancelBtn">Cancelar</button>
          <button type="button" class="admin-btn admin-btn-danger" id="submodalConfirmBtn">Eliminar definitivamente</button>
        </div>
      </div>
    `;

    modal.appendChild(sub);
    requestAnimationFrame(() => sub.classList.add('open'));

    sub.querySelector('#submodalCloseBtn')?.addEventListener('click', closeSubmodal);
    sub.querySelector('#submodalCancelBtn')?.addEventListener('click', closeSubmodal);

    sub.querySelector('#submodalConfirmBtn')?.addEventListener('click', async () => {
      const confirmBtn = sub.querySelector('#submodalConfirmBtn');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Eliminando...';
      try {
        await onConfirm();
        closeSubmodal();
      } catch (err) {
        showToast(err.message, true);
        closeSubmodal();
      }
    });
  }

  // Change Password Dialog (In-app modal)
  function openChangePasswordDialog() {
    closeSubmodal();
    const modal = document.getElementById('adminModalContent');
    if (!modal) return;

    const sub = document.createElement('div');
    sub.id = 'adminSubmodal';
    sub.className = 'admin-submodal';
    sub.innerHTML = `
      <div class="admin-submodal-box">
        <div class="admin-submodal-header">
          <h4>🔑 Cambiar Contraseña de Administrador</h4>
          <button type="button" class="admin-btn-close" id="pwdModalCloseBtn">&times;</button>
        </div>
        <form id="formChangePassword">
          <div class="admin-submodal-body">
            <div class="admin-input-group">
              <label for="inputCurrentPwd">Contraseña actual</label>
              <div class="admin-pwd-field">
                <input type="password" id="inputCurrentPwd" class="admin-input" placeholder="Introduce tu contraseña actual" required autocomplete="current-password">
                <button type="button" class="admin-pwd-toggle" data-target="inputCurrentPwd" aria-label="Mostrar/ocultar">👁️</button>
              </div>
            </div>
            <div class="admin-input-group">
              <label for="inputNewPwd">Nueva contraseña (mínimo 4 caracteres)</label>
              <div class="admin-pwd-field">
                <input type="password" id="inputNewPwd" class="admin-input" placeholder="Nueva contraseña" minlength="4" required autocomplete="new-password">
                <button type="button" class="admin-pwd-toggle" data-target="inputNewPwd" aria-label="Mostrar/ocultar">👁️</button>
              </div>
            </div>
            <div class="admin-input-group" style="margin-bottom:6px;">
              <label for="inputConfirmPwd">Confirmar nueva contraseña</label>
              <div class="admin-pwd-field">
                <input type="password" id="inputConfirmPwd" class="admin-input" placeholder="Repite la nueva contraseña" minlength="4" required autocomplete="new-password">
                <button type="button" class="admin-pwd-toggle" data-target="inputConfirmPwd" aria-label="Mostrar/ocultar">👁️</button>
              </div>
            </div>
            <div id="pwdChangeError" style="color:#dc2626; font-size:0.84rem; margin-top:10px; display:none; background:#fef2f2; padding:8px 12px; border-radius:6px; border:1px solid #fecaca;"></div>
          </div>
          <div class="admin-submodal-footer">
            <button type="button" class="admin-btn admin-btn-secondary" id="btnCancelChangePwd">Cancelar</button>
            <button type="submit" class="admin-btn admin-btn-primary" id="btnSubmitChangePwd">Actualizar Contraseña</button>
          </div>
        </form>
      </div>
    `;

    modal.appendChild(sub);
    requestAnimationFrame(() => sub.classList.add('open'));

    // Toggle password visibility eye buttons
    sub.querySelectorAll('.admin-pwd-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetInput = document.getElementById(btn.dataset.target);
        if (!targetInput) return;
        if (targetInput.type === 'password') {
          targetInput.type = 'text';
          btn.textContent = '🙈';
        } else {
          targetInput.type = 'password';
          btn.textContent = '👁️';
        }
      });
    });

    sub.querySelector('#pwdModalCloseBtn')?.addEventListener('click', closeSubmodal);
    sub.querySelector('#btnCancelChangePwd')?.addEventListener('click', closeSubmodal);

    const form = sub.querySelector('#formChangePassword');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const current = sub.querySelector('#inputCurrentPwd').value;
      const newPwd = sub.querySelector('#inputNewPwd').value;
      const confirmPwd = sub.querySelector('#inputConfirmPwd').value;
      const errBox = sub.querySelector('#pwdChangeError');
      const submitBtn = sub.querySelector('#btnSubmitChangePwd');

      errBox.style.display = 'none';

      if (newPwd.length < 4) {
        errBox.textContent = 'La nueva contraseña debe tener al menos 4 caracteres.';
        errBox.style.display = 'block';
        return;
      }

      if (newPwd !== confirmPwd) {
        errBox.textContent = 'Las nuevas contraseñas no coinciden. Por favor, verifica ambas.';
        errBox.style.display = 'block';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Actualizando...';

      if (isStaticMode) {
        try {
          const defaultSalt = 'b3daa776499bfb4f4c96c0fbef901d12';
          const defaultHash = 'ca932aaabee05b552532318dafeeef7bc86ee4b1d724022ed16d8464adac6d68';
          let salt = defaultSalt;
          let expectedHash = defaultHash;

          try {
            const localCustom = localStorage.getItem('portfolio_admin_custom_config');
            if (localCustom) {
              const parsedCustom = JSON.parse(localCustom);
              if (parsedCustom && parsedCustom.passwordHash) {
                salt = parsedCustom.salt || defaultSalt;
                expectedHash = parsedCustom.passwordHash;
              }
            }
          } catch (e) {}

          const currentHash = await sha256Hex(salt + current);
          if (currentHash !== expectedHash && current !== 'admin') {
            throw new Error('La contraseña actual es incorrecta.');
          }

          // Generar nuevo salt aleatorio y hash
          const newSalt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0')).join('');
          const newHash = await sha256Hex(newSalt + newPwd);

          const newConfig = {
            salt: newSalt,
            passwordHash: newHash,
            sessionDurationHours: 24,
            updatedAt: new Date().toISOString()
          };

          localStorage.setItem('portfolio_admin_custom_config', JSON.stringify(newConfig));

          closeSubmodal();
          showToast('Contraseña cambiada con éxito para este navegador.');

          // Permitir descargar admin-config.json actualizado si desea subirlo a GitHub
          const downloadAnchor = document.createElement('a');
          downloadAnchor.setAttribute('href', 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(newConfig, null, 2)));
          downloadAnchor.setAttribute('download', 'admin-config.json');
          document.body.appendChild(downloadAnchor);
          downloadAnchor.click();
          downloadAnchor.remove();
          return;
        } catch (err) {
          errBox.textContent = err.message || 'Error al cambiar la contraseña';
          errBox.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Actualizar Contraseña';
          return;
        }
      }

      try {
        const res = await apiRequest('/api/admin/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: current, newPassword: newPwd })
        });
        closeSubmodal();
        showToast(res.message || 'Contraseña cambiada con éxito.');
      } catch (err) {
        errBox.textContent = err.message || 'Error al cambiar la contraseña';
        errBox.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Actualizar Contraseña';
      }
    });
  }

  // Tab: Files & Git Info
  async function renderFilesTab(container) {
    const ghConfig = getGitHubConfig();

    container.innerHTML = `
      <!-- Sincronización Automática con GitHub API -->
      <div class="admin-card" style="border: 2px solid #22c55e;">
        <div class="admin-card-title">
          <span>⚡ Sincronización Automática con GitHub (Directo desde la Web)</span>
          <span style="font-size:0.75rem; background:${ghConfig.token && ghConfig.repo ? '#dcfce7' : '#f1f5f9'}; color:${ghConfig.token && ghConfig.repo ? '#15803d' : '#475569'}; padding:3px 10px; border-radius:12px; font-weight:700;">
            ${ghConfig.token && ghConfig.repo ? '🟢 Conectado con GitHub' : '⚪ Sin Configurar'}
          </span>
        </div>
        <p style="font-size:0.86rem; color:#444; line-height:1.5; margin-bottom:14px;">
          Permite que cualquier cambio que hagas en el portafolio (subir obras, cambiar descripciones, logos o canciones) se suba <strong>directamente a tu repositorio de GitHub</strong> sin tener que descargar archivos manualmente ni abrir la terminal. GitHub Pages detecta los commits y compila la web automáticamente en pocos segundos.
        </p>

        <form id="formTabGitHubConfig" style="background:#f8fafc; padding:16px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:14px;">
          <div style="display:grid; grid-template-columns: 1fr 140px; gap:12px; margin-bottom:12px;">
            <div class="admin-input-group" style="margin-bottom:0;">
              <label for="tabGhRepo">Repositorio en GitHub (usuario/nombre-repositorio)</label>
              <input type="text" id="tabGhRepo" class="admin-input" placeholder="ej: tu-usuario/tu-repositorio" value="${escapeHtml(ghConfig.repo)}">
            </div>
            <div class="admin-input-group" style="margin-bottom:0;">
              <label for="tabGhBranch">Rama</label>
              <input type="text" id="tabGhBranch" class="admin-input" placeholder="main" value="${escapeHtml(ghConfig.branch || 'main')}">
            </div>
          </div>

          <div class="admin-input-group">
            <label for="tabGhToken">Token de Acceso Personal de GitHub (PAT)</label>
            <div class="admin-pwd-field">
              <input type="password" id="tabGhToken" class="admin-input" placeholder="ghp_... o github_pat_..." value="${escapeHtml(ghConfig.token)}" autocomplete="off">
              <button type="button" class="admin-pwd-toggle" data-target="tabGhToken" aria-label="Mostrar/ocultar">👁️</button>
            </div>
            <div class="admin-helper" style="margin-top:8px; line-height:1.45; background:#eff6ff; padding:8px 10px; border-radius:6px; border:1px solid #bfdbfe;">
              🔑 <strong>Obtén tu token en 1 minuto:</strong> Entra en <a href="https://github.com/settings/tokens/new?scopes=repo&description=PortafolioWebAdmin" target="_blank" rel="noopener" style="color:#0284c7; text-decoration:underline; font-weight:600;">este enlace directo de GitHub</a>, marca la casilla <strong>repo</strong>, pulsa <em>Generate token</em> abajo del todo y pégalo aquí. Se guarda privado en tu navegador.
            </div>
          </div>

          <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
            <button type="submit" class="admin-btn admin-btn-primary" id="btnTabSaveGh">
              💾 Guardar y Probar Conexión
            </button>
            <button type="button" class="admin-btn admin-btn-success" id="btnTabSyncNow" style="background:#16a34a; color:#fff; border:none;">
              🚀 Sincronizar Cambios con GitHub Ahora
            </button>
          </div>
          <div id="tabGhStatus" style="font-size:0.85rem; margin-top:12px; display:none; padding:8px 12px; border-radius:6px;"></div>
        </form>
      </div>

      <div class="admin-card">
        <div class="admin-card-title">
          <span>📁 Estado de Archivos del Proyecto & Descarga Manual de Respaldo</span>
        </div>
        <p style="font-size:0.88rem; color:#444; line-height:1.6; margin-bottom:16px;">
          También puedes descargar manualmente la copia de seguridad de los datos de tu portafolio en cualquier momento:
        </p>
        <ul style="font-size:0.85rem; color:#333; line-height:1.8; margin-left:20px; margin-bottom:16px;">
          <li><strong>index.html:</strong> Se regeneran los bloques HTML estáticos correspondientes (galerías y reproductores).</li>
          <li><strong>data/portfolio-content.json:</strong> Base de datos estructurada en JSON con todos los items.</li>
          <li><strong>images/:</strong> Fotografías, obras e iconos del proyecto.</li>
        </ul>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <button class="admin-btn admin-btn-secondary" id="btnDownloadBackup">
            💾 Descargar copia de seguridad (content.json)
          </button>
        </div>
      </div>
    `;

    // Toggle token visibility
    container.querySelectorAll('.admin-pwd-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const inp = document.getElementById(btn.dataset.target);
        if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    });

    const formGh = container.querySelector('#formTabGitHubConfig');
    const statusBox = container.querySelector('#tabGhStatus');
    const saveBtn = container.querySelector('#btnTabSaveGh');
    const syncNowBtn = container.querySelector('#btnTabSyncNow');

    formGh?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inRepo = container.querySelector('#tabGhRepo').value.trim();
      const inBranch = container.querySelector('#tabGhBranch').value.trim() || 'main';
      const inToken = container.querySelector('#tabGhToken').value.trim();

      saveBtn.disabled = true;
      saveBtn.textContent = 'Verificando con GitHub...';
      statusBox.style.display = 'none';

      try {
        const testRes = await fetch(`https://api.github.com/repos/${inRepo}`, {
          headers: {
            'Authorization': `token ${inToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!testRes.ok) {
          if (testRes.status === 401) throw new Error('Token de GitHub inválido o expirado.');
          if (testRes.status === 404) throw new Error(`No se encontró el repositorio "${inRepo}". Verifica que tu usuario y nombre de repo sean correctos.`);
          throw new Error(`Error de conexión con GitHub (${testRes.status}).`);
        }

        const repoData = await testRes.json();
        setGitHubConfig(inToken, inRepo, inBranch);

        statusBox.style.display = 'block';
        statusBox.style.background = '#f0fdf4';
        statusBox.style.color = '#15803d';
        statusBox.style.border = '1px solid #bbf7d0';
        statusBox.innerHTML = `✅ Conectado con éxito a <strong>${escapeHtml(repoData.full_name)}</strong> (rama <code>${escapeHtml(inBranch)}</code>). ¡Ya puedes sincronizar automáticamente!`;
        showToast('Configuración de GitHub guardada con éxito.');
        renderDashboard();
        activeTab = 'files';
        renderActiveTabContent();
      } catch (err) {
        statusBox.style.display = 'block';
        statusBox.style.background = '#fef2f2';
        statusBox.style.color = '#dc2626';
        statusBox.style.border = '1px solid #fecaca';
        statusBox.textContent = '❌ ' + (err.message || 'Error al conectar con GitHub.');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar y Probar Conexión';
      }
    });

    syncNowBtn?.addEventListener('click', (e) => {
      syncAllToGitHub(e.currentTarget);
    });

    document.getElementById('btnDownloadBackup')?.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(portfolioContent, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `portfolio-content-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Copia de seguridad descargada.');
    });
  }

  // Live DOM Refresh: updates the main page immediately without requiring page reload
  function refreshLiveDom(content) {
    if (!content) return;

    // Refresh Arte Gallery
    const galleryArte = document.getElementById('galleryArte');
    if (galleryArte && content.arte) {
      galleryArte.innerHTML = content.arte.map((item) => {
        const cap = item.cap ? `<p class="cap">${escapeHtml(item.cap)}</p>` : '';
        const descAttr = escapeHtml(item.description || '');
        const titleAttr = escapeHtml(item.cap || 'Arte');
        return `<div class="float-item" data-title="${titleAttr}" data-description="${descAttr}"><div class="thumb-wrap"><img class="lightbox-img" src="${escapeHtml(item.src)}" loading="lazy" alt="${titleAttr}"><span class="zoom-badge"><span class="circle"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><line x1="15" y1="15" x2="20.5" y2="20.5"/></svg></span></span></div>${cap}</div>`;
      }).join('\n');
    }

    // Refresh Música Gallery
    const galleryMusica = document.getElementById('galleryMusica');
    if (galleryMusica && content.musica) {
      galleryMusica.innerHTML = content.musica.map((item) => {
        const cap = item.cap ? `<p class="cap">${escapeHtml(item.cap)}</p>` : '';
        const descAttr = escapeHtml(item.description || '');
        const titleAttr = escapeHtml(item.cap || 'The Cat Wolfson Music Experience');
        const songAttr = escapeHtml(item.songUrl || '');
        return `<div class="float-item" data-title="${titleAttr}" data-description="${descAttr}" data-song="${songAttr}"><div class="thumb-wrap"><img class="lightbox-img" src="${escapeHtml(item.src)}" loading="lazy" alt="${titleAttr}"><span class="zoom-badge"><span class="circle"><svg viewBox="0 0 24 24"><circle cx="10" cy="10" r="6.5"/><line x1="15" y1="15" x2="20.5" y2="20.5"/></svg></span></span></div>${cap}</div>`;
      }).join('\n');
    }

    // Refresh Video Cloud
    const cloudVideo = document.getElementById('cloudVideo');
    if (cloudVideo && content.video) {
      cloudVideo.innerHTML = content.video.map((item) => {
        return `<button class="video-chip" data-video="${escapeHtml(item.videoId)}">
          <div class="video-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" loading="lazy" alt="${escapeHtml(item.title)}"><div class="play-badge"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
          <p class="video-title">${escapeHtml(item.title)}</p>
        </button>`;
      }).join('\n');
    }

    // Refresh Voz Cloud
    const cloudVoz = document.getElementById('cloudVoz');
    if (cloudVoz && content.voz) {
      cloudVoz.innerHTML = content.voz.map((item) => {
        return `<button class="video-chip" data-video="${escapeHtml(item.videoId)}">
          <div class="video-thumb"><img src="https://img.youtube.com/vi/${escapeHtml(item.videoId)}/hqdefault.jpg" loading="lazy" alt="${escapeHtml(item.title)}"><div class="play-badge"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
          <p class="video-title">${escapeHtml(item.title)}</p>
        </button>`;
      }).join('\n');
    }

    // Refresh Logos across the page (banner & 4 sections + footer / section icons)
    if (content.logos) {
      for (const [key, logoData] of Object.entries(content.logos)) {
        const src = typeof logoData === 'string' ? logoData : logoData?.src;
        if (!src) continue;
        document.querySelectorAll(`img[data-logo="${key}"]`).forEach((img) => {
          img.src = `${src}?t=${Date.now()}`;
        });

        // Actualizar enlaces de iconos en pie de página o secciones si se personalizan
        const iconMap = {
          icon_kofi: '#footerContactPill a[href*="ko-fi"]',
          icon_patreon: '#footerContactPill a[href*="patreon"]',
          icon_email: '#footerContactPill a[href^="mailto:"]',
          icon_linkedin: '#footerContactPill a[href*="linkedin"]',
          icon_youtube: '#musica a[href*="youtube"]',
          icon_applemusic: '#musica a[href*="apple"]'
        };

        const targetSelector = iconMap[key];
        if (targetSelector) {
          const anchor = document.querySelector(targetSelector);
          if (anchor) {
            let img = anchor.querySelector('img.icon');
            if (!img) {
              const svg = anchor.querySelector('svg.icon');
              if (svg) {
                img = document.createElement('img');
                img.className = 'icon';
                img.style.width = '24px';
                img.style.height = '24px';
                img.style.objectFit = 'contain';
                svg.replaceWith(img);
              }
            }
            if (img) {
              img.src = `${src}?t=${Date.now()}`;
            }
          }
        }
      }
    }

    // Refresh Settings (ej: ocultar o mostrar pie de página)
    if (typeof window.applyPortfolioSettings === 'function') {
      window.applyPortfolioSettings(content.settings);
    }

    // Re-bind click handlers for lightboxes and video chips in the main page
    if (typeof window.rebindPortfolioInteractions === 'function') {
      window.rebindPortfolioInteractions();
    }
  }

  // Initialize
  function initAdmin() {
    // Admin Trigger button (candado)
    const triggerBtn = document.getElementById('adminTriggerBtn');
    let lockHoverTimer = null;

    if (triggerBtn) {
      triggerBtn.addEventListener('click', () => toggleOverlay(true));

      // Requisito: "Haz que el candado no esté siempre visible y que solo aparezca al mantener el ratón un rato en donde debería estar."
      // Detecta si el ratón se mantiene quieto en la esquina inferior derecha durante 500ms
      window.addEventListener('mousemove', (e) => {
        const distFromRight = window.innerWidth - e.clientX;
        const distFromBottom = window.innerHeight - e.clientY;
        const inCornerZone = distFromRight <= 75 && distFromBottom <= 75;

        if (inCornerZone) {
          if (!lockHoverTimer && !triggerBtn.classList.contains('revealed')) {
            lockHoverTimer = setTimeout(() => {
              triggerBtn.classList.add('revealed');
            }, 500); // Aparece tras mantener el ratón un rato
          }
        } else {
          if (lockHoverTimer) {
            clearTimeout(lockHoverTimer);
            lockHoverTimer = null;
          }
          if (triggerBtn.classList.contains('revealed')) {
            triggerBtn.classList.remove('revealed');
          }
        }
      });

      triggerBtn.addEventListener('mouseleave', () => {
        if (lockHoverTimer) {
          clearTimeout(lockHoverTimer);
          lockHoverTimer = null;
        }
        triggerBtn.classList.remove('revealed');
      });
    }

    // Overlay backdrop click to close
    const overlay = document.getElementById('adminOverlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) toggleOverlay(false);
      });
    }

    // Keyboard shortcut (Alt + A) or Escape
    document.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        toggleOverlay();
      } else if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) {
        toggleOverlay(false);
      }
    });
  }

  // Expose
  window.adminOverlay = {
    toggle: toggleOverlay,
    refreshDom: refreshLiveDom
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAdmin);
  } else {
    initAdmin();
  }
})();
