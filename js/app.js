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

// ===== Parallax suave para las galerías flotantes (arte y música) =====
const floatItems = document.querySelectorAll('.float-item');
function parallax() {
  floatItems.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const center = rect.top + rect.height / 2 - window.innerHeight / 2;
    const speed = (i % 3 === 0) ? 0.01 : (i % 3 === 1 ? -0.008 : 0.006);
    el.style.transform = `translateY(${center * speed}px)`;
  });
  requestAnimationFrame(parallax);
}
if (floatItems.length) requestAnimationFrame(parallax);

// ===== Lightbox: vídeos (audiovisual y voz) e imágenes (arte y música) =====
const lightbox = document.getElementById('lightbox');
const lightboxInner = document.getElementById('lightboxInner');

function openVideoLightbox(id) {
  lightbox.classList.remove('img-mode');
  lightboxInner.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  lightbox.classList.add('open');
}

function openImageLightbox(src) {
  lightbox.classList.add('img-mode');
  lightboxInner.innerHTML = `<img src="${src}" alt="">`;
  lightbox.classList.add('open');
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightboxInner.innerHTML = '';
}

document.querySelectorAll('.video-chip').forEach(btn => {
  btn.addEventListener('click', () => openVideoLightbox(btn.dataset.video));
});

document.querySelectorAll('.lightbox-img').forEach(img => {
  img.closest('.float-item').addEventListener('click', () => openImageLightbox(img.getAttribute('src')));
});

document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

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
