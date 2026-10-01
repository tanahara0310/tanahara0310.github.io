import { createOcean } from './ocean.js';

const root = document.documentElement;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// ?still を付けると波の時間を止める（見た目を同じ条件で比べる用）
const still = new URLSearchParams(window.location.search).has('still');
const calm = reducedMotion || still;

// スクロール量を水深に（範囲はページごとに body の data-depth="浅い,深い"）
const [DEPTH_TOP, DEPTH_BOTTOM] = (document.body.dataset.depth || '1.2,48').split(',').map(Number);

function scrollProgress() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  return Math.min(1, Math.max(0, window.scrollY / max));
}

function depthAt(p) {
  return DEPTH_TOP * Math.pow(DEPTH_BOTTOM / DEPTH_TOP, Math.pow(p, 0.7));
}

function lightAt(depth) {
  return 1 - 0.5 * Math.min(1, Math.log(depth / 1.2) / Math.log(40));
}

// 背景の海
const canvas = document.getElementById('ocean');
let ocean = null;
try {
  const depth = depthAt(scrollProgress());
  ocean = createOcean(canvas, { reducedMotion: calm, getScroll: () => window.scrollY, depth, light: lightAt(depth) });
} catch (e) {
  console.warn('[ocean]', e);
}
if (!ocean) root.classList.add('no-webgl');

const viewer = document.getElementById('viewer');

function tapRipple(x, y) {
  const el = document.createElement('span');
  el.className = 'tap-ripple';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  document.body.appendChild(el);
}

document.addEventListener('pointerdown', (e) => {
  if (viewer.open) return;
  if (ocean && !root.classList.contains('no-webgl')) {
    ocean.drop(e.clientX, e.clientY, e.pointerType === 'touch' ? 36 : 30, 2.0);
  } else {
    tapRipple(e.clientX, e.clientY);
  }
}, { passive: true });

// マウスを動かすと細い航跡を残す
let lastTrail = null;
document.addEventListener('pointermove', (e) => {
  if (!ocean || e.pointerType !== 'mouse' || calm || viewer.open) return;
  if (lastTrail && Math.hypot(e.clientX - lastTrail.x, e.clientY - lastTrail.y) < 18) return;
  lastTrail = { x: e.clientX, y: e.clientY };
  ocean.drop(e.clientX, e.clientY, 11, 0.07);
}, { passive: true });

// ときどき水面に何かが落ちる
if (ocean && !calm) {
  const idle = () => {
    if (!document.hidden && !viewer.open) {
      ocean.drop(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 14 + Math.random() * 10, 0.35 + Math.random() * 0.3);
    }
    setTimeout(idle, 2600 + Math.random() * 4200);
  };
  setTimeout(idle, 3200);
  setTimeout(() => ocean.drop(window.innerWidth * 0.5, window.innerHeight * 0.42, 40, 1.4), 700);
}

// 水深計とヘッダー
const header = document.querySelector('.site-header');
const depthEl = document.querySelector('.depth');
const depthValue = document.querySelector('.depth-value b');
let scrollQueued = false;

function onScroll() {
  scrollQueued = false;
  const p = scrollProgress();
  const depth = depthAt(p);
  if (ocean) {
    ocean.setDepth(depth);
    ocean.setLight(lightAt(depth));
  }
  depthEl.style.setProperty('--p', p.toFixed(4));
  depthValue.textContent = depth.toFixed(1);
  header.classList.toggle('is-scrolled', window.scrollY > window.innerHeight * 0.6);
}
window.addEventListener('scroll', () => {
  if (!scrollQueued) { scrollQueued = true; requestAnimationFrame(onScroll); }
}, { passive: true });

let resizeQueued = false;
window.addEventListener('resize', () => {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    if (ocean) ocean.resize();
    onScroll();
  });
});
onScroll();

// 画面に入ったら出す
const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('is-visible');
        io.unobserve(en.target);
      }
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  reveals.forEach((el) => io.observe(el));
} else {
  reveals.forEach((el) => el.classList.add('is-visible'));
}

// 拡大表示と動画
const viewerBody = viewer.querySelector('.viewer-body');
const viewerCaption = viewer.querySelector('.viewer-caption');

function openViewer(node, caption) {
  viewerBody.replaceChildren(node);
  viewerCaption.textContent = caption || '';
  viewer.showModal();
}

function largeSrc(img) {
  const src = img.currentSrc || img.src;
  return src.replace(/-sm\.webp$/, '.webp');
}

document.addEventListener('click', (e) => {
  const zoomImg = e.target.closest('img[data-zoom]');
  if (zoomImg) {
    const img = new Image();
    img.src = largeSrc(zoomImg);
    img.alt = zoomImg.alt;
    openViewer(img, zoomImg.alt);
    return;
  }
  const yt = e.target.closest('[data-yt]');
  if (yt && yt.dataset.yt) {
    const frame = document.createElement('iframe');
    frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.dataset.yt)}?autoplay=1&rel=0&playsinline=1`;
    frame.title = yt.dataset.title || 'YouTube';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    frame.allowFullscreen = true;
    const link = document.createElement('a');
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(yt.dataset.yt)}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'YouTube で開く';
    openViewer(frame, '');
    viewerCaption.replaceChildren(document.createTextNode(`${yt.dataset.title || ''}　`), link);
  }
});

function clearViewer() {
  viewerBody.replaceChildren();
  viewerCaption.textContent = '';
}

function closeViewer() {
  clearViewer();
  if (viewer.open) viewer.close();
}

viewer.querySelector('.viewer-close').addEventListener('click', closeViewer);
viewer.addEventListener('click', (e) => {
  if (e.target === viewer) closeViewer();
});
viewer.addEventListener('cancel', (e) => {
  e.preventDefault();
  closeViewer();
});
viewer.addEventListener('close', clearViewer);

// 時刻のスライダー
document.querySelectorAll('.timeslide').forEach((box) => {
  const range = box.querySelector('input[type=range]');
  const imgs = box.querySelectorAll('.timeslide-view img');
  const ticks = box.querySelectorAll('.timeslide-ticks button');
  let anim = 0;

  const apply = (v) => {
    imgs[1].style.opacity = Math.min(1, Math.max(0, v));
    imgs[2].style.opacity = Math.min(1, Math.max(0, v - 1));
    ticks.forEach((b) => b.classList.toggle('is-active', Math.abs(Number(b.dataset.t) - v) < 0.5));
  };
  range.addEventListener('input', () => {
    cancelAnimationFrame(anim);
    apply(Number(range.value));
  });
  ticks.forEach((b) => b.addEventListener('click', () => {
    const from = Number(range.value);
    const to = Number(b.dataset.t);
    if (reducedMotion) { range.value = to; apply(to); return; }
    const start = performance.now();
    cancelAnimationFrame(anim);
    const step = (now) => {
      const k = Math.min(1, (now - start) / 700);
      const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
      range.value = v;
      apply(v);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }));
  apply(0);
});
