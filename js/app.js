// ===== Smooth scroll con easing propio para todos los enlaces internos =====
function smoothScrollTo(targetY, duration = 700) {
  const startY = window.scrollY;
  const diff = targetY - startY;
  let start;
  function step(timestamp) {
    if (!start) start = timestamp;
    const t = Math.min((timestamp - start) / duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
    window.scrollTo(0, startY + diff * ease);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const target = document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  const y = target.getBoundingClientRect().top + window.scrollY - 24;
  smoothScrollTo(y);
});

// ===== Nav flotante: aparece al salir de "inicio", indicador de sección activa =====
const floatNav = document.getElementById('floatNav');
const floatNavText = document.getElementById('floatNavText');
const inicio = document.getElementById('inicio');
const navLinks = document.querySelectorAll('.nav-icons a');
const allFloatLinks = document.querySelectorAll('.nav-home, .nav-icons a');
const sectionMap = {};
navLinks.forEach(a => sectionMap[a.getAttribute('href').slice(1)] = a);

function updateFloatNavText() {
  if (!floatNavText) return;
  const hoveredLink = document.querySelector('.nav-home:hover, .nav-icons a:hover');
  if (hoveredLink) {
    floatNavText.textContent = hoveredLink.getAttribute('data-tip') || '';
    floatNavText.classList.add('visible');
  } else {
    floatNavText.classList.remove('visible');
  }
}

allFloatLinks.forEach(link => {
  link.addEventListener('mouseenter', updateFloatNavText);
  link.addEventListener('mouseleave', updateFloatNavText);
});

const heroObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    floatNav.classList.toggle('visible', !entry.isIntersecting);
  });
}, { threshold: 0.15 });
heroObserver.observe(inicio);

const sections = document.querySelectorAll('.op-section');
const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const link = sectionMap[entry.target.id];
    if (!link) return;
    if (entry.isIntersecting) {
      navLinks.forEach(a => a.classList.remove('active'));
      link.classList.add('active');
      updateFloatNavText();
    }
  });
}, { rootMargin: '-40% 0px -50% 0px' });
sections.forEach(s => sectionObserver.observe(s));

// ===== Lightbox: vídeos (audiovisual y voz) e imágenes (arte y música) =====
const lightbox = document.getElementById('lightbox');
const lightboxInner = document.getElementById('lightboxInner');
const lightboxDescToggle = document.getElementById('lightboxDescToggle');
const lightboxDescDrawer = document.getElementById('lightboxDescDrawer');
const lightboxDescTitle = document.getElementById('lightboxDescTitle');
const lightboxDescText = document.getElementById('lightboxDescText');
const lightboxDescCategory = document.getElementById('lightboxDescCategory');
const lightboxDescClose = document.getElementById('lightboxDescClose');
const lightboxDescHideBtn = document.getElementById('lightboxDescHideBtn');
const lightboxNavWrap = document.getElementById('lightboxNavWrap');
const lightboxNavCluster = document.getElementById('lightboxNavCluster');
const lightboxNavPrev = document.getElementById('lightboxNavPrev');
const lightboxNavNext = document.getElementById('lightboxNavNext');

let currentGalleryItems = [];
let currentImageIndex = -1;
let navPeekTimer = null;

function toggleDescriptionDrawer(forceOpen) {
  if (!lightboxDescDrawer) return;
  const willOpen = (typeof forceOpen === 'boolean')
    ? forceOpen
    : !lightboxDescDrawer.classList.contains('open');

  if (willOpen) {
    lightboxDescDrawer.classList.add('open');
    lightboxDescDrawer.setAttribute('aria-hidden', 'false');
    if (lightbox) lightbox.classList.add('desc-open');
    if (lightboxDescToggle) lightboxDescToggle.classList.add('active');
  } else {
    lightboxDescDrawer.classList.remove('open');
    lightboxDescDrawer.setAttribute('aria-hidden', 'true');
    if (lightbox) lightbox.classList.remove('desc-open');
    if (lightboxDescToggle) lightboxDescToggle.classList.remove('active');
  }
}

function updateImageDisplay() {
  if (currentImageIndex < 0 || currentImageIndex >= currentGalleryItems.length) return;
  const item = currentGalleryItems[currentImageIndex];
  const imgEl = item.querySelector('.lightbox-img');
  if (!imgEl) return;

  const src = imgEl.getAttribute('src');
  const title = item.dataset.title || item.querySelector('.cap')?.textContent.trim() || 'Obra';
  const desc = item.dataset.description || '';
  const section = item.closest('section');
  const category = (section && section.id === 'musica') ? 'Música' : 'Arte';

  // Actualiza la imagen en el visor
  lightboxInner.innerHTML = `<img src="${src}" alt="${title}">`;

  // Actualiza los textos del panel de descripción
  if (lightboxDescTitle) lightboxDescTitle.textContent = title;
  if (lightboxDescText) lightboxDescText.textContent = desc || 'Obra visual de Julio Panojo.';
  if (lightboxDescCategory) lightboxDescCategory.textContent = category;
}

function navigateLightbox(dir) {
  if (!currentGalleryItems.length) return;
  currentImageIndex = (currentImageIndex + dir + currentGalleryItems.length) % currentGalleryItems.length;
  updateImageDisplay();
}

function openVideoLightbox(id) {
  if (!lightbox || !lightboxInner) return;
  currentGalleryItems = [];
  currentImageIndex = -1;
  toggleDescriptionDrawer(false);
  if (lightboxDescToggle) lightboxDescToggle.style.display = 'none';
  if (lightboxNavWrap) lightboxNavWrap.style.display = 'none';

  lightbox.classList.remove('img-mode');
  lightboxInner.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openImageLightboxFromItem(floatItem) {
  if (!lightbox || !lightboxInner) return;

  // Colección de imágenes del contexto actual (categoría activa)
  const gallery = floatItem.closest('.float-gallery') || floatItem.closest('section');
  if (gallery) {
    currentGalleryItems = Array.from(gallery.querySelectorAll('.float-item'));
  } else {
    currentGalleryItems = Array.from(document.querySelectorAll('.float-item'));
  }

  currentImageIndex = currentGalleryItems.indexOf(floatItem);
  if (currentImageIndex === -1) currentImageIndex = 0;

  // Requisito: Oculta por defecto
  toggleDescriptionDrawer(false);

  if (lightboxDescToggle) {
    lightboxDescToggle.style.display = 'inline-flex';
    lightboxDescToggle.classList.remove('active');
  }

  // Muestra los botones de navegación si hay más de una imagen
  if (lightboxNavWrap) {
    lightboxNavWrap.style.display = (currentGalleryItems.length > 1) ? 'flex' : 'none';
    lightboxNavWrap.classList.remove('mouse-near');

    // Muestra sutilmente al abrir durante 1.6s y luego se oculta automáticamente
    // a menos que el usuario acerque o deslice el ratón sobre la zona
    lightboxNavWrap.classList.add('mouse-near');
    clearTimeout(navPeekTimer);
    navPeekTimer = setTimeout(() => {
      if (lightboxNavWrap) lightboxNavWrap.classList.remove('mouse-near');
    }, 1600);
  }

  lightbox.classList.add('img-mode');
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
  updateImageDisplay();
}

function closeLightbox() {
  if (!lightbox) return;
  toggleDescriptionDrawer(false);
  clearTimeout(navPeekTimer);
  if (lightboxNavWrap) {
    lightboxNavWrap.style.display = 'none';
    lightboxNavWrap.classList.remove('mouse-near');
  }
  lightbox.classList.remove('open');
  lightbox.classList.remove('img-mode');
  lightbox.classList.remove('desc-open');
  if (lightboxInner) lightboxInner.innerHTML = '';
  document.body.style.overflow = '';
  currentGalleryItems = [];
  currentImageIndex = -1;
}

// Detección del ratón para mostrar/ocultar navegación en lightbox
if (lightbox) {
  lightbox.addEventListener('mousemove', (e) => {
    if (!lightbox.classList.contains('open') || !lightbox.classList.contains('img-mode') || !lightboxNavWrap) return;
    const distFromBottom = window.innerHeight - e.clientY;
    // Si el ratón está en los últimos 95px de la pantalla, mostrar botones; de lo contrario ocultar
    if (distFromBottom <= 95) {
      lightboxNavWrap.classList.add('mouse-near');
    } else {
      lightboxNavWrap.classList.remove('mouse-near');
    }
  });

  lightbox.addEventListener('mouseleave', () => {
    if (lightboxNavWrap) lightboxNavWrap.classList.remove('mouse-near');
  });
}

if (lightboxDescToggle) {
  lightboxDescToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDescriptionDrawer();
  });
}

if (lightboxDescClose) {
  lightboxDescClose.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDescriptionDrawer(false);
  });
}

if (lightboxDescHideBtn) {
  lightboxDescHideBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDescriptionDrawer(false);
  });
}

if (lightboxNavPrev) {
  lightboxNavPrev.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
  });
}

if (lightboxNavNext) {
  lightboxNavNext.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(1);
  });
}

// Delegated click listeners so dynamically added items immediately work
document.addEventListener('click', (e) => {
  const videoChip = e.target.closest('.video-chip');
  if (videoChip && videoChip.dataset.video) {
    e.preventDefault();
    openVideoLightbox(videoChip.dataset.video);
    return;
  }

  const floatItem = e.target.closest('.float-item');
  if (floatItem) {
    const img = floatItem.querySelector('.lightbox-img');
    if (img) {
      e.preventDefault();
      openImageLightboxFromItem(floatItem);
      return;
    }
  }
});

window.rebindPortfolioInteractions = function() {
  // Delegación de eventos activa para cualquier nuevo elemento añadido dinámicamente
};

const lightboxCloseBtn = document.getElementById('lightboxClose');
if (lightboxCloseBtn) {
  lightboxCloseBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeLightbox();
  });
}

if (lightbox) {
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox || e.target === lightboxInner) {
      closeLightbox();
    }
  });
}

// Aplicar configuración de interfaz en vivo (ej. ocultar pie de página)
window.applyPortfolioSettings = function(settings) {
  const footerPill = document.getElementById('footerContactPill');
  if (footerPill) {
    if (settings && settings.hideFooter) {
      footerPill.classList.add('hidden-footer');
      footerPill.style.display = 'none';
    } else {
      footerPill.classList.remove('hidden-footer');
      footerPill.style.display = '';
    }
  }
};

// Cargar configuración al iniciar
try {
  fetch('data/portfolio-content.json')
    .then(r => r.json())
    .then(data => {
      if (data && data.settings) {
        window.applyPortfolioSettings(data.settings);
      }
    })
    .catch(() => {});
} catch (e) {}

// Navegación con teclado: flechas izquierda/derecha y tecla Escape
document.addEventListener('keydown', (e) => {
  if (!lightbox || !lightbox.classList.contains('open')) return;

  if (e.key === 'Escape') {
    closeLightbox();
    return;
  }

  if (lightbox.classList.contains('img-mode')) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateLightbox(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateLightbox(1);
    }
  }
});

// ===== Spotify: embed vía iFrame API + mini-reproductor (solo visible reproduciendo) =====
let spotifyController = null;
const spotifyMini = document.getElementById('spotifyMini');
const spotifyMiniBtn = document.getElementById('spotifyMiniBtn');

window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById('spotifyEmbed');
  if (!element) return;
  const options = { uri: 'spotify:artist:0kUWxwltgihXYUb3eQmES5', width: '100%', height: '352' };
  IFrameAPI.createController(element, options, (EmbedController) => {
    spotifyController = EmbedController;
    EmbedController.addListener('playback_update', (e) => {
      const isPaused = !!(e.data && e.data.isPaused);
      spotifyMini.classList.toggle('show', !isPaused);
    });
  });
};

// Spotify a veces fuerza un scrollIntoView de su iframe al cambiar de pista;
// si detectamos un salto de scroll no iniciado por el usuario hacia el iframe, lo revertimos.
let userIsScrolling = false;
let userScrollTimeout;
window.addEventListener('wheel', () => {
  userIsScrolling = true;
  clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => userIsScrolling = false, 600);
}, { passive: true });
window.addEventListener('touchmove', () => {
  userIsScrolling = true;
  clearTimeout(userScrollTimeout);
  userScrollTimeout = setTimeout(() => userIsScrolling = false, 600);
}, { passive: true });

let lastKnownScroll = window.scrollY;
window.addEventListener('scroll', () => {
  const spotifyEmbedEl = document.getElementById('spotifyEmbed');
  if (!spotifyEmbedEl) { lastKnownScroll = window.scrollY; return; }
  const rect = spotifyEmbedEl.getBoundingClientRect();
  const jumpedToPlayer = Math.abs(rect.top) < 4 || (rect.top >= 0 && rect.top < window.innerHeight * 0.15 && Math.abs(window.scrollY - lastKnownScroll) > 200);
  if (!userIsScrolling && jumpedToPlayer && Math.abs(window.scrollY - lastKnownScroll) > 150) {
    window.scrollTo(0, lastKnownScroll);
  } else {
    lastKnownScroll = window.scrollY;
  }
}, { passive: true });

if (spotifyMiniBtn) {
  spotifyMiniBtn.addEventListener('click', () => {
    if (spotifyController) spotifyController.togglePlay();
  });
}
