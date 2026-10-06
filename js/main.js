import { createOcean, oceanError } from './ocean.js?v=202610070047';

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

// 水面に浮かぶ板（画面に見えているもの）の矩形を海へ渡す
const floaters = [...document.querySelectorAll('[data-float]')];

function floatRects() {
  const out = [];
  const h = window.innerHeight;
  for (const el of floaters) {
    if (out.length >= 120) break;
    if (!el.classList.contains('is-visible') && !el.classList.contains('is-emerging')) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < -200 || r.top > h + 200 || r.width === 0) continue;
    const a = Number(getComputedStyle(el).opacity);
    if (a < 0.02) continue;
    out.push(r.left, r.top, r.right, r.bottom, a * a);
  }
  return out;
}

// 背景の海
const canvas = document.getElementById('ocean');
let ocean = null;
try {
  const depth = depthAt(scrollProgress());
  ocean = createOcean(canvas, { reducedMotion: calm, getScroll: () => window.scrollY, getRects: floatRects, onScare: () => unlock('fish'), depth, light: lightAt(depth) });
} catch (e) {
  console.warn('[ocean]', e);
}
if (!ocean) root.classList.add('no-webgl');

// ?debug を付けると背景の海の状態を画面に出す
if (new URLSearchParams(window.location.search).has('debug')) {
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:8px 10px;max-width:calc(100vw - 16px);white-space:pre-wrap;font:11px/1.5 monospace;color:#fff;background:rgba(0,0,0,.75);border-radius:8px;pointer-events:none';
  document.body.appendChild(box);
  const show = () => {
    const st = ocean ? ocean.status() : null;
    box.textContent = st
      ? `海: ${st.level}${st.lost ? '（止まった）' : ''}
GPU: ${st.gpu}
描画: ${st.canvas}・品質 ${st.quality}・${st.frameMs}ms/フレーム${st.errors ? `
失敗: ${st.errors}` : ''}`
      : `海: 描けない（${oceanError || '理由不明'}）`;
  };
  show();
  setInterval(show, 1000);
}

const viewer = document.getElementById('viewer');

// ===== 記録（保存できない環境でもページは動く） =====
const store = {
  get(key, fallback) {
    try {
      const v = window.localStorage.getItem(`koa.${key}`);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(`koa.${key}`, JSON.stringify(value));
    } catch {
      // 保存できなくても続ける
    }
  },
};

const ALL_WORKS = ['koaengine', 'reprism', 'backlash', 'biripiyo', 'chainrope', 'gungagan', 'hatou',
  'chrono', 'kunaibu', 'mawarazaru', 'untitled-y1', 'nigeru', 'hansha'];

// ===== 実績 =====
const ACHIEVEMENTS = [
  { key: 'ripple', icon: '波', title: 'はじめての波紋', text: '水面にふれた', hint: '水面にふれてみよう' },
  { key: 'ripple30', icon: '紋', title: '波紋づくりの名人', text: '水面に 30 回ふれた', hint: '水面にたくさんふれる' },
  { key: 'shallow', icon: '浅', title: '浅瀬をぬけた', text: '水深 3m まで潜った', hint: '少し潜ってみよう' },
  { key: 'open', icon: '洋', title: '外洋へ', text: '水深 10m まで潜った', hint: 'もっと深く' },
  { key: 'deep', icon: '青', title: '深い青の中へ', text: '水深 22m まで潜った', hint: 'さらに深く' },
  { key: 'abyss', icon: '底', title: '海の底', text: 'ページのいちばん下まで潜った', hint: 'いちばん下まで' },
  { key: 'main', icon: '主', title: 'メインクエスト', text: '就活作品のページをひらいた', hint: 'いちばん大事な作品を見る' },
  { key: 'video', icon: '映', title: '上映会', text: '作品の動画を再生した', hint: '動画を見る' },
  { key: 'fish', icon: '魚', title: 'おどろく熱帯魚', text: '熱帯魚をおどかした', hint: '魚の近くの水面にふれる' },
  { key: 'flip', icon: '比', title: '見比べ', text: '写真と自作エンジンのカードをめくった', hint: 'カードをめくる' },
  { key: 'sunset', icon: '夕', title: '日が暮れるまで', text: '空の時刻を夜まで動かした', hint: '空の時刻を動かす' },
  { key: 'zoom', icon: '拡', title: 'じっくり見る', text: '画像を拡大した', hint: '画像を押してみる' },
  { key: 'seen5', icon: '巡', title: '作品めぐり', text: '5 作品のページを見た', hint: '作品のページをいくつか見る' },
  { key: 'complete', icon: '全', title: '全作品制覇', text: `${ALL_WORKS.length} 作品すべてのページを見た`, hint: 'すべての作品を見る' },
];
const ACH_BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.key, a]));

let unlocked = store.get('ach', {});
if (Array.isArray(unlocked)) unlocked = Object.fromEntries(unlocked.filter((k) => ACH_BY_KEY[k]).map((k) => [k, Date.now()]));
for (const k of Object.keys(unlocked)) if (!ACH_BY_KEY[k]) delete unlocked[k];

const toastBox = document.querySelector('.toasts');
const toastQueue = [];
let toastBusy = false;

function achRate() {
  return Object.keys(unlocked).length / ACHIEVEMENTS.length;
}

function formatDate(t) {
  const d = new Date(t);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function medal(a, locked) {
  const m = document.createElement('span');
  m.className = locked ? 'medal is-locked' : 'medal';
  m.textContent = locked ? '？' : a.icon;
  return m;
}

function renderAch(newKey) {
  const n = Object.keys(unlocked).length;
  const rate = achRate();
  document.querySelectorAll('[data-ach-count]').forEach((el) => { el.textContent = String(n); });
  document.querySelectorAll('[data-ach-total]').forEach((el) => { el.textContent = String(ACHIEVEMENTS.length); });
  document.querySelectorAll('[data-ach-rate]').forEach((el) => { el.textContent = String(Math.round(rate * 100)); });
  document.querySelectorAll('[data-ach-ring], .ach-bar').forEach((el) => el.style.setProperty('--rate', rate.toFixed(3)));
  const grid = document.querySelector('[data-ach-grid]');
  if (!grid) return;
  grid.replaceChildren(...ACHIEVEMENTS.map((a) => {
    const locked = !unlocked[a.key];
    const li = document.createElement('li');
    li.className = `ach-item${locked ? ' is-locked' : ''}${a.key === newKey ? ' is-new' : ''}`;
    const body = document.createElement('div');
    const title = document.createElement('b');
    title.textContent = locked ? '？？？' : a.title;
    const text = document.createElement('span');
    text.textContent = locked ? `ヒント：${a.hint}` : a.text;
    body.append(title, text);
    if (!locked) {
      const time = document.createElement('time');
      time.textContent = `${formatDate(unlocked[a.key])} 解除`;
      body.append(time);
    }
    li.append(medal(a, locked), body);
    return li;
  }));
}

function nextToast() {
  if (toastBusy || !toastQueue.length || !toastBox) return;
  toastBusy = true;
  const a = toastQueue.shift();
  const el = document.createElement('div');
  el.className = 'toast';
  const body = document.createElement('div');
  body.className = 'toast-text';
  const label = document.createElement('small');
  label.textContent = 'ACHIEVEMENT UNLOCKED';
  const title = document.createElement('b');
  title.textContent = `実績解除！ ${a.title}`;
  const text = document.createElement('span');
  text.textContent = a.text;
  const prog = document.createElement('div');
  prog.className = 'toast-progress';
  const bar = document.createElement('i');
  const count = document.createElement('span');
  count.textContent = `${Object.keys(unlocked).length} / ${ACHIEVEMENTS.length}`;
  prog.append(bar, count);
  body.append(label, title, text, prog);
  el.append(medal(a, false), body);
  el.style.setProperty('--rate', '0');
  toastBox.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.style.setProperty('--rate', achRate().toFixed(3))));
  document.querySelectorAll('.ach-chip').forEach((c) => {
    c.classList.remove('is-bump');
    void c.offsetWidth;
    c.classList.add('is-bump');
  });
  if (ocean && !calm) {
    const r = el.getBoundingClientRect();
    ocean.drop(r.left + 28, r.top + r.height / 2, 30, 1.2);
  }
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => {
      el.remove();
      toastBusy = false;
      nextToast();
    }, 450);
  }, 3600);
}

function unlock(key) {
  if (unlocked[key] || !ACH_BY_KEY[key]) return;
  unlocked[key] = Date.now();
  store.set('ach', unlocked);
  renderAch(key);
  toastQueue.push(ACH_BY_KEY[key]);
  nextToast();
}

const resetBtn = document.querySelector('[data-ach-reset]');
if (resetBtn) {
  resetBtn.addEventListener('click', () => {
    if (!resetBtn.classList.contains('is-armed')) {
      resetBtn.classList.add('is-armed');
      resetBtn.textContent = 'もう一度押すとリセット';
      setTimeout(() => {
        resetBtn.classList.remove('is-armed');
        resetBtn.textContent = '記録をリセット';
      }, 3000);
      return;
    }
    unlocked = {};
    store.set('ach', unlocked);
    store.set('ripples', 0);
    store.set('seen', []);
    ripples = 0;
    seen.clear();
    document.querySelectorAll('.wcard.is-seen').forEach((c) => c.classList.remove('is-seen'));
    resetBtn.classList.remove('is-armed');
    resetBtn.textContent = '記録をリセット';
    renderAch();
  });
}

// ===== 見た作品 =====
const seen = new Set(store.get('seen', []));
const work = document.body.dataset.work;
if (work && work !== 'new-work') {
  seen.add(work);
  store.set('seen', [...seen]);
}
document.querySelectorAll('.wcard[data-slug]').forEach((c) => c.classList.toggle('is-seen', seen.has(c.dataset.slug)));
renderAch();
setTimeout(() => {
  if (work === 'koaengine') unlock('main');
  const n = ALL_WORKS.filter((w) => seen.has(w)).length;
  if (n >= 5) unlock('seen5');
  if (n >= ALL_WORKS.length) unlock('complete');
}, 1200);

// ===== 水面にふれる =====
function tapRipple(x, y) {
  const el = document.createElement('span');
  el.className = 'tap-ripple';
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.addEventListener('animationend', () => el.remove());
  document.body.appendChild(el);
}

let ripples = store.get('ripples', 0);
document.addEventListener('pointerdown', (e) => {
  if (viewer.open) return;
  if (ocean && !root.classList.contains('no-webgl')) {
    ocean.drop(e.clientX, e.clientY, e.pointerType === 'touch' ? 36 : 30, 2.0);
  } else {
    tapRipple(e.clientX, e.clientY);
  }
  ripples++;
  store.set('ripples', ripples);
  unlock('ripple');
  if (ripples >= 30) unlock('ripple30');
}, { passive: true });

// マウスを動かすと細い航跡を残す
let lastTrail = null;
document.addEventListener('pointermove', (e) => {
  if (!ocean || e.pointerType !== 'mouse' || calm || viewer.open) return;
  if (lastTrail && Math.hypot(e.clientX - lastTrail.x, e.clientY - lastTrail.y) < 18) return;
  lastTrail = { x: e.clientX, y: e.clientY };
  ocean.drop(e.clientX, e.clientY, 11, 0.07);
}, { passive: true });

// カードに触れると、浮いている板の縁から波が立つ
document.querySelectorAll('.wcard a, .feature, .pager a, .tech a').forEach((el) => el.addEventListener('pointerenter', (e) => {
  if (!ocean || calm || e.pointerType !== 'mouse') return;
  const r = el.getBoundingClientRect();
  const pts = [
    [r.left + r.width * 0.25, r.bottom], [r.left + r.width * 0.75, r.bottom],
    [r.left, r.top + r.height * 0.6], [r.right, r.top + r.height * 0.6],
  ];
  pts.forEach(([x, y], i) => setTimeout(() => ocean.drop(x, y, 16, 0.35), i * 60));
}));

// ときどき水面に何かが落ちる
if (ocean && !calm) {
  const idle = () => {
    if (!document.hidden && !viewer.open) {
      ocean.drop(Math.random() * window.innerWidth, Math.random() * window.innerHeight, 14 + Math.random() * 10, 0.35 + Math.random() * 0.3);
    }
    setTimeout(idle, 2600 + Math.random() * 4200);
  };
  setTimeout(idle, 3200);
}

// ===== 海の中から浮き上がる =====
const emergers = document.querySelectorAll('[data-float], .reveal, .door-no, .door-title, .work-cover-sub, .sec-head, .hero-copy');

function surface(el, delay) {
  setTimeout(() => {
    if (!ocean || calm) return;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    const big = r.width > 500;
    const xs = big ? [0.15, 0.5, 0.85] : [0.5];
    xs.forEach((f, i) => setTimeout(() => ocean.drop(r.left + r.width * f, Math.max(8, r.top), big ? 34 : 24, big ? 0.9 : 0.6), i * 90));
  }, delay);
}

// 深い所から水面へ。海の色に溶けた、ぼやけて揺らぐ姿から、色が抜けて大きくはっきりしていく
const EMERGE_MS = 1000;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function emerge(el, order) {
  const float = el.hasAttribute('data-float');
  const dur = float ? EMERGE_MS : EMERGE_MS * 0.75;
  const delay = Math.min(order, 8) * 70;
  const phase = order * 1.7;
  el.classList.add('is-emerging');
  let start = 0;
  let surfaced = false;

  const step = (now) => {
    if (!start) start = now;
    const t = Math.min(1, (now - start) / dur);
    const p = easeOut(t);
    const k = 1 - p;
    const sec = now / 1000;
    const op = smooth(0, 0.3, t) * 0.5 + smooth(0.35, 0.85, t) * 0.5;
    const pop = Math.sin(smooth(0.78, 1, t) * Math.PI);
    const wob = k * k;
    const y = 52 * k - pop * 6;
    const sc = 0.82 + 0.18 * p + pop * 0.012;
    const sx = sc * (1 + Math.cos(sec * 1.9 + phase) * 0.018 * wob);
    const sy = sc * (1 + Math.sin(sec * 1.7 + phase) * 0.028 * wob);
    const skew = Math.sin(sec * 2.3 + phase) * 2.4 * wob;
    el.style.opacity = op.toFixed(3);
    el.style.transform = `translateY(${y.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)}) skewX(${skew.toFixed(2)}deg)`;
    el.style.filter = `blur(${(16 * Math.pow(k, 1.4)).toFixed(2)}px) saturate(${(1 + 0.4 * k).toFixed(2)})`;
    if (float) el.style.setProperty('--tint', (0.85 * Math.pow(k, 1.1)).toFixed(3));
    if (float && !surfaced && t > 0.8) {
      surfaced = true;
      surface(el, 0);
    }
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    el.classList.add('is-visible', 'is-settled');
    el.classList.remove('is-emerging');
    el.style.removeProperty('opacity');
    el.style.removeProperty('transform');
    el.style.removeProperty('filter');
    el.style.removeProperty('--tint');
  };
  setTimeout(() => requestAnimationFrame(step), delay);
}

if ('IntersectionObserver' in window && !reducedMotion) {
  const io = new IntersectionObserver((entries) => {
    let order = 0;
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      emerge(en.target, order++);
      io.unobserve(en.target);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  emergers.forEach((el) => io.observe(el));
} else {
  emergers.forEach((el) => el.classList.add('is-visible', 'is-settled'));
}
window.koaReady = true;

// 別のページへは、板が海へ沈んでから移る
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (a.target && a.target !== '_self') return;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return;
  if (reducedMotion) return;
  e.preventDefault();
  root.classList.add('is-leaving');
  if (ocean) {
    const r = a.getBoundingClientRect();
    ocean.drop(r.left + r.width / 2, r.top + r.height / 2, 46, 1.6);
  }
  setTimeout(() => { window.location.href = url.href; }, 480);
});
window.addEventListener('pageshow', (e) => {
  if (e.persisted) root.classList.remove('is-leaving');
});

// ===== 水深計 =====
const depthValue = document.querySelector('[data-depth-value]');
const gaugeTrack = document.querySelector('.gauge-track');
const ticks = [...document.querySelectorAll('[data-tick]')];

function placeTicks() {
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  ticks.forEach((t) => {
    const target = document.querySelector(t.dataset.tick);
    if (!target) return;
    const y = target.getBoundingClientRect().top + window.scrollY - 80;
    t.style.setProperty('--at', Math.min(1, Math.max(0, y / max)).toFixed(4));
  });
}

let scrollQueued = false;

// その水深の海の色（浅瀬のターコイズ → 外洋の青 → 深い紺）
function seaTint(depth) {
  const t = Math.min(1, Math.max(0, Math.log(depth / 1.2) / Math.log(40)));
  const stops = [[22, 172, 178], [14, 112, 165], [8, 46, 92]];
  const f = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const u = f - i;
  const c = stops[i].map((v, j) => Math.round(v + (stops[i + 1][j] - v) * u));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function onScroll() {
  scrollQueued = false;
  const p = scrollProgress();
  const depth = depthAt(p);
  if (ocean) {
    ocean.setDepth(depth);
    ocean.setLight(lightAt(depth));
  }
  if (depthValue) depthValue.textContent = depth.toFixed(1);
  root.style.setProperty('--sea-tint', seaTint(depth));
  if (gaugeTrack) gaugeTrack.style.setProperty('--p', p.toFixed(4));
  let here = null;
  ticks.forEach((t) => {
    if (p + 0.02 >= Number(t.style.getPropertyValue('--at') || 0)) here = t;
  });
  ticks.forEach((t) => t.classList.toggle('is-here', t === here));
  if (window.scrollY > 40) {
    if (depth >= 3) unlock('shallow');
    if (depth >= 10) unlock('open');
    if (depth >= 22) unlock('deep');
    if (p > 0.97 && document.documentElement.scrollHeight > window.innerHeight * 2) unlock('abyss');
  }
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
    placeTicks();
    onScroll();
  });
});
placeTicks();
window.addEventListener('load', () => { placeTicks(); onScroll(); });
onScroll();

// ===== 拡大表示と動画 =====
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
    unlock('zoom');
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
    unlock('video');
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

// ===== 時刻のスライダー =====
document.querySelectorAll('.timeslide').forEach((box) => {
  const range = box.querySelector('input[type=range]');
  const imgs = box.querySelectorAll('.timeslide-view img');
  const tickButtons = box.querySelectorAll('.timeslide-ticks button');
  let anim = 0;

  const apply = (v) => {
    imgs[1].style.opacity = Math.min(1, Math.max(0, v));
    imgs[2].style.opacity = Math.min(1, Math.max(0, v - 1));
    tickButtons.forEach((b) => b.classList.toggle('is-active', Math.abs(Number(b.dataset.t) - v) < 0.5));
    if (v >= 1.9) unlock('sunset');
  };
  range.addEventListener('input', () => {
    cancelAnimationFrame(anim);
    apply(Number(range.value));
  });
  tickButtons.forEach((b) => b.addEventListener('click', () => {
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

// ===== 作品一覧の絞り込み =====
const filterButtons = document.querySelectorAll('.filters [data-filter]');
filterButtons.forEach((btn) => btn.addEventListener('click', () => {
  const f = btn.dataset.filter;
  filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
  document.querySelectorAll('.wcard').forEach((c) => c.classList.toggle('is-hidden', f !== 'all' && c.dataset.cat !== f));
}));

// ===== 写真と自作エンジンのカードをめくる =====
const flipCards = document.querySelectorAll('.flip');
const flipButtons = document.querySelectorAll('[data-flip]');

function syncFlipButtons() {
  const all = [...flipCards].every((c) => c.classList.contains('is-flipped'));
  const none = [...flipCards].every((c) => !c.classList.contains('is-flipped'));
  flipButtons.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.flip === 'engine' && all) || (b.dataset.flip === 'photo' && none))));
  if ([...flipCards].some((c) => c.classList.contains('is-flipped'))) unlock('flip');
}

flipCards.forEach((c) => c.addEventListener('click', () => {
  c.classList.toggle('is-flipped');
  syncFlipButtons();
}));
flipButtons.forEach((b) => b.addEventListener('click', () => {
  flipCards.forEach((c) => c.classList.toggle('is-flipped', b.dataset.flip === 'engine'));
  syncFlipButtons();
}));
