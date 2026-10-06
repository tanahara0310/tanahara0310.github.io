// ポートフォリオエディタ。作品のデータを編集し、保存すると tools/editor.py がページを作り直す
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const GRADE_KEYS = ['y1', 'y2', 'y3', 'y4'];
let GRADES = { y1: '1年生', y2: '2年生', y3: '3年生', y4: '4年生' };

const state = {
  works: [],
  saved: '',
  sel: 0,
  pvPage: 'work',
  pvSize: 'pc',
};
let nextId = 1;

// ===== 小物 =====
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(text, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind ? `is-${kind}` : ''}`;
  el.textContent = text;
  $('[data-toasts]').appendChild(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2800);
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  let data = {};
  try {
    data = await res.json();
  } catch {
    // 中身が JSON でないときは下でエラーにする
  }
  if (!res.ok || data.error) throw new Error(data.error || `${res.status} ${res.statusText}`);
  return data;
}

const postJson = (path, obj) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) });

function smPath(src) {
  return src ? src.replace(/\.webp$/, '-sm.webp') : '';
}

function imgUrl(img, small = true) {
  if (!img || !img.src) return '';
  return `/${small ? smPath(img.src) : img.src}`;
}

function youtubeId(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const m = t.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(t) ? t : null;
}

function cur() {
  return state.works[state.sel];
}

function strip(works) {
  return works.map(({ _id, ...w }) => w);
}

function serialize() {
  return JSON.stringify(strip(state.works));
}

function isMain(w) {
  return w.kind === 'main';
}

function isWip(w) {
  return !isMain(w) && !(w.body && w.body.length);
}

function titleOf(w) {
  return w.title || '（作品名）';
}

function cardMeta(w) {
  if (isMain(w)) return w.meta || '';
  const g = GRADES[w.cat] || '';
  if (isWip(w)) return [g, '準備中'].filter(Boolean).join(' ・ ');
  return [g, w.envNote || w.env, w.people, w.period].filter(Boolean).join(' ・ ');
}

// ===== 保存の状態 =====
let savedById = new Map();

function remember() {
  state.saved = serialize();
  savedById = new Map(state.works.map((w) => [w._id, JSON.stringify(strip([w]))]));
}

function dirty() {
  return serialize() !== state.saved;
}

function workDirty(w) {
  return savedById.get(w._id) !== JSON.stringify(strip([w]));
}

function updateState() {
  const d = dirty();
  const el = $('[data-state]');
  el.classList.toggle('is-dirty', d);
  el.textContent = d ? '保存していない変更があります' : 'すべて保存済み';
  $('[data-save]').disabled = !d;
  document.title = `${d ? '● ' : ''}ポートフォリオエディタ`;
}

// ===== 変更のたびに =====
let previewTimer = 0;

function changed({ list = true } = {}) {
  updateState();
  if (list) renderList();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 450);
}

// ===== 左：作品の一覧 =====
let dragFrom = -1;

function renderList() {
  const ul = $('[data-list]');
  ul.replaceChildren(...state.works.map((w, i) => {
    const li = document.createElement('li');
    li.className = `item${i === state.sel ? ' is-active' : ''}`;
    li.draggable = true;
    const img = (w.thumb && w.thumb.src) ? w.thumb : w.main;
    const kind = isMain(w) ? '<span class="dot is-main"></span>就活作品' : `<span class="dot${isWip(w) ? ' is-wip' : ''}"></span>${esc(GRADES[w.cat] || '')}${isWip(w) ? '・準備中' : ''}`;
    li.innerHTML = `<span class="item-thumb" style="background-image:url('${esc(imgUrl(img))}')"></span>
      <span><span class="item-title">${esc(titleOf(w))}</span>
      <span class="item-meta">${kind}${workDirty(w) ? '<span class="item-dirty">・未保存</span>' : ''}</span></span>`;
    li.addEventListener('click', () => select(i));
    li.addEventListener('dragstart', (e) => {
      dragFrom = i;
      li.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    li.addEventListener('dragend', () => {
      dragFrom = -1;
      $$('.item').forEach((x) => x.classList.remove('is-dragging', 'is-drop-before', 'is-drop-after'));
    });
    li.addEventListener('dragover', (e) => {
      if (dragFrom < 0) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      const after = e.clientY > r.top + r.height / 2;
      li.classList.toggle('is-drop-before', !after);
      li.classList.toggle('is-drop-after', after);
    });
    li.addEventListener('dragleave', () => li.classList.remove('is-drop-before', 'is-drop-after'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom < 0) return;
      const r = li.getBoundingClientRect();
      let to = i + (e.clientY > r.top + r.height / 2 ? 1 : 0);
      const selected = cur();
      const [moved] = state.works.splice(dragFrom, 1);
      if (dragFrom < to) to--;
      state.works.splice(to, 0, moved);
      state.sel = state.works.indexOf(selected);
      changed();
    });
    return li;
  }));
}

function select(i) {
  state.sel = Math.max(0, Math.min(state.works.length - 1, i));
  renderList();
  renderForm();
  refreshPreview();
}

$('[data-add]').addEventListener('click', () => {
  let n = 1;
  while (state.works.some((w) => w.slug === `new-work-${n}`)) n++;
  const w = {
    _id: nextId++, slug: `new-work-${n}`, cat: 'y2', team: true, title: '', youtube: '', video: '',
    main: { caption: 'Title' }, shots: [], thumb: null, env: '', envNote: '', people: '', period: '', summary: '', body: [], gallery: [],
  };
  const mainIdx = state.works.findIndex(isMain);
  state.works.splice(mainIdx + 1, 0, w);
  state.sel = mainIdx + 1;
  changed();
  renderForm();
  refreshPreview();
  setTimeout(() => $('[data-k="title"]')?.focus(), 50);
});

// ===== 真ん中：入力欄 =====
function field(label, key, { placeholder = '', hint = '', type = 'text', list = '' } = {}) {
  const w = cur();
  return `<label class="field"><span>${label}</span>
    <input type="${type}" data-k="${key}" value="${esc(w[key] || '')}" placeholder="${esc(placeholder)}"${list ? ` list="${list}"` : ''}>
    ${hint ? `<p class="field-hint">${hint}</p>` : ''}</label>`;
}

function seg(key, options, value) {
  return `<div class="seg" role="group" data-seg="${key}">${options.map(([v, label]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(value)}">${label}</button>`).join('')}</div>`;
}

function dropBox(slot, img, { label = '', small = false } = {}) {
  const has = img && img.src;
  return `<div class="drop${has ? ' has-image' : ''}${small ? ' is-small' : ''}" tabindex="0" data-drop="${slot}" style="${has ? `background-image:url('${esc(imgUrl(img))}')` : ''}">
    ${label ? `<span class="drop-label">${label}</span>` : ''}
    <span class="drop-empty"><b>＋</b>画像をドロップ<br>クリックで選ぶ・Ctrl+V で貼る</span>
    <span class="drop-tools"><button type="button" data-act="replace">差し替え</button><button type="button" data-act="clear">外す</button></span>
  </div>`;
}

function renderForm() {
  const w = cur();
  const box = $('[data-form]');
  if (!w) {
    box.innerHTML = '';
    return;
  }
  if (isMain(w)) {
    box.innerHTML = `
      <h2 class="form-title">${esc(w.title)} <small>works/${esc(w.slug)}.html</small></h2>
      <p class="notice">就活作品のページは専用の作りなので、ここではトップの作品一覧に出るカードだけを編集できます。</p>
      <div class="card"><h3>一覧のカード</h3>
        ${field('タイトル', 'title')}
        ${field('上の小さい行', 'meta', { placeholder: '就活作品 ・ 1人 ・ 約1年半' })}
        <label class="field"><span>一言紹介 <small class="count" data-count></small></span><textarea rows="3" data-k="summary">${esc(w.summary)}</textarea></label>
        <div class="media-head">サムネイル</div>
        ${dropBox('thumb', w.thumb)}
      </div>`;
    bindForm(box);
    return;
  }
  const yt = w.youtube ? `<div class="yt-preview"><img src="https://i.ytimg.com/vi/${esc(w.youtube)}/mqdefault.jpg" alt=""><span>動画 ID <b>${esc(w.youtube)}</b><br><a href="https://www.youtube.com/watch?v=${esc(w.youtube)}" target="_blank" rel="noopener">YouTube で確かめる ↗</a></span></div>` : '';
  const videoName = w.video ? w.video.split('/').pop() : '';
  box.innerHTML = `
    <h2 class="form-title">${esc(titleOf(w))} <small>works/${esc(w.slug)}.html</small></h2>

    <div class="card"><h3>基本</h3>
      ${field('作品名', 'title', { placeholder: '例：レプリズム' })}
      <div class="field seg-row">
        <div><span class="label">学年</span>${seg('cat', GRADE_KEYS.map((k) => [k, GRADES[k]]), w.cat)}</div>
        <div><span class="label">制作</span>${seg('team', [['true', 'チーム'], ['false', '個人']], String(w.team !== false))}</div>
      </div>
      <label class="field"><span>ページの名前（URL）</span>
        <div class="prefix"><i>works/</i><input type="text" data-k="slug" value="${esc(w.slug)}" spellcheck="false"><i>.html&nbsp;&nbsp;</i></div>
        <p class="field-hint" data-slug-hint>英小文字・数字・ハイフンだけ。変えると作品ページの URL が変わります</p>
      </label>
    </div>

    <div class="card"><h3>動画</h3>
      <label class="field"><span>YouTube の URL</span>
        <input type="url" data-yt-input value="${w.youtube ? `https://youtu.be/${esc(w.youtube)}` : ''}" placeholder="https://www.youtube.com/watch?v=...">
        <p class="field-hint" data-yt-hint>貼り付けると「動画を見る」ボタンが出ます</p>
      </label>
      ${yt}
      <p class="or">または 動画ファイル（mp4 / webm・95MB まで）</p>
      <div class="video-file${w.video ? ' has-file' : ''}" tabindex="0" data-video-drop>
        <span>${w.video ? `🎬 ${esc(videoName)}` : 'ここに動画ファイルをドロップ・クリックで選ぶ'}</span>
        ${w.video ? '<button class="btn is-small is-ghost" type="button" data-video-clear>外す</button>' : ''}
      </div>
      <p class="field-hint">YouTube と動画ファイルの両方があるときは YouTube を使います。</p>
    </div>

    <div class="card"><h3>画像</h3>
      <div class="media-head"><span>メイン画像</span>${seg('caption', [['Title', 'Title'], ['Game', 'Game']], (w.main && w.main.caption) || 'Title')}</div>
      ${dropBox('main', w.main)}
      <div class="media-head">ゲーム画面</div>
      <div class="media-row">
        ${dropBox('shot0', (w.shots || [])[0], { label: '1', small: true })}
        ${dropBox('shot1', (w.shots || [])[1], { label: '2', small: true })}
      </div>
      <div class="media-head"><span>その他の画面 <small>（文章の下に並ぶ・何枚でも）</small></span></div>
      <div class="gallery">
        ${(w.gallery || []).map((g, i) => `<div class="drop has-image" style="background-image:url('${esc(imgUrl(g))}')" data-gal="${i}">
          <span class="gal-tools"><button type="button" data-gal-move="-1" title="前へ">←</button><button type="button" data-gal-del title="外す">外す</button><button type="button" data-gal-move="1" title="後ろへ">→</button></span></div>`).join('')}
        <div class="drop" tabindex="0" data-drop="gallery"><span class="drop-empty"><b>＋</b>追加</span></div>
      </div>
      <div class="media-head"><span>一覧のサムネイル <small>（空ならメイン画像）</small></span></div>
      <div class="media-row">${dropBox('thumb', w.thumb, { small: true })}<div></div></div>
    </div>

    <div class="card"><h3>開発概要</h3>
      <div class="row">
        ${field('開発環境', 'env', { placeholder: 'DirectX12', list: 'env-list' })}
        ${field('補足 <small>（// の後ろに出る）</small>', 'envNote', { placeholder: 'CoreEngine' })}
      </div>
      <div class="row">
        ${field('開発人数', 'people', { placeholder: '3人' })}
        ${field('制作期間', 'period', { placeholder: '1ヶ月' })}
      </div>
      <datalist id="env-list"><option value="DirectX12"><option value="学内製エンジン"><option value="Unity"><option value="Unreal Engine"></datalist>
    </div>

    <div class="card"><h3>作品紹介・こだわりポイント</h3>
      <p class="card-note">Enter で段落、Shift+Enter で段落の中の改行。強調したい所を選んで「強調」（もう一度押すと外れます）。</p>
      <div class="rte-tools"><button class="hl-btn" type="button" data-hl>強調</button><button type="button" data-clear-fmt>強調をすべて外す</button></div>
      <div class="rte" contenteditable="true" spellcheck="false" data-rte data-placeholder="どんなゲームか、担当したところ、こだわったところ…"></div>
    </div>

    <div class="card"><h3>トップの一覧のカード</h3>
      <label class="field"><span>一言紹介 <small class="count" data-count></small></span><textarea rows="2" data-k="summary" placeholder="例：自作エンジンで作った初めての完全 2D ゲーム">${esc(w.summary)}</textarea></label>
      <p class="field-hint">カードの上の行：<b data-card-meta>${esc(cardMeta(w))}</b>（学年・開発環境・人数・期間から自動。文章が空のあいだは「準備中」）</p>
    </div>

    <div class="card"><h3>この作品を消す</h3>
      <div class="danger-zone"><p>保存するとページも消えます（コミットするまでは git で戻せます）</p><button class="btn is-danger is-small" type="button" data-delete>削除</button></div>
    </div>`;
  bindForm(box);
  setupRte($('[data-rte]', box), w);
}

function bindForm(box) {
  const w = cur();
  $$('[data-k]', box).forEach((input) => {
    input.addEventListener('input', () => {
      const k = input.dataset.k;
      let v = input.value;
      if (k === 'slug') {
        v = v.toLowerCase();
        const ok = /^[a-z0-9][a-z0-9-]*$/.test(v) && !state.works.some((x) => x !== w && x.slug === v);
        input.classList.toggle('is-bad', !ok);
        const hint = $('[data-slug-hint]', box);
        hint.classList.toggle('is-bad', !ok);
        hint.textContent = ok ? '英小文字・数字・ハイフンだけ。変えると作品ページの URL が変わります' : (v ? 'ほかの作品と重なっているか、使えない文字があります' : '空にはできません');
        if (!ok) return;
      }
      w[k] = v;
      if (k === 'title' || k === 'slug') {
        const t = $('.form-title', box);
        if (t) t.innerHTML = `${esc(isMain(w) ? w.title : titleOf(w))} <small>works/${esc(w.slug)}.html</small>`;
      }
      updateCount(box);
      const meta = $('[data-card-meta]', box);
      if (meta) meta.textContent = cardMeta(w);
      changed();
    });
  });
  updateCount(box);

  $$('[data-seg]', box).forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$('button', g).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const k = g.dataset.seg;
    if (k === 'cat') w.cat = b.dataset.v;
    if (k === 'team') w.team = b.dataset.v === 'true';
    if (k === 'caption') w.main = { ...(w.main || {}), caption: b.dataset.v };
    const meta = $('[data-card-meta]', box);
    if (meta) meta.textContent = cardMeta(w);
    changed();
  }));

  const ytInput = $('[data-yt-input]', box);
  if (ytInput) {
    ytInput.addEventListener('change', () => {
      const id = youtubeId(ytInput.value);
      const hint = $('[data-yt-hint]', box);
      if (id === null) {
        hint.classList.add('is-bad');
        hint.textContent = 'YouTube の URL として読めませんでした';
        return;
      }
      w.youtube = id;
      changed();
      renderForm();
    });
  }

  const vdrop = $('[data-video-drop]', box);
  if (vdrop) {
    vdrop.addEventListener('click', (e) => {
      if (e.target.closest('[data-video-clear]')) {
        w.video = '';
        changed();
        renderForm();
        return;
      }
      pickFile('video/mp4,video/webm,video/quicktime', false, (files) => uploadMany(files, 'video', vdrop));
    });
    dropTarget(vdrop, (files) => uploadMany(files, 'video', vdrop));
  }

  $$('[data-drop]', box).forEach((d) => {
    const slot = d.dataset.drop;
    const multi = slot === 'gallery';
    d.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'clear') {
        setImage(slot, null);
        return;
      }
      pickFile('image/*', multi, (files) => uploadMany(files, slot, d));
    });
    dropTarget(d, (files) => uploadMany(files, slot, d));
  });

  $$('[data-gal]', box).forEach((g) => {
    const i = Number(g.dataset.gal);
    g.addEventListener('click', (e) => {
      if (e.target.closest('[data-gal-del]')) {
        w.gallery.splice(i, 1);
      } else if (e.target.closest('[data-gal-move]')) {
        const to = i + Number(e.target.closest('[data-gal-move]').dataset.galMove);
        if (to < 0 || to >= w.gallery.length) return;
        [w.gallery[i], w.gallery[to]] = [w.gallery[to], w.gallery[i]];
      } else {
        return;
      }
      changed();
      renderForm();
    });
  });

  const del = $('[data-delete]', box);
  if (del) {
    del.addEventListener('click', () => {
      if (!del.classList.contains('is-armed')) {
        del.classList.add('is-armed');
        del.textContent = 'もう一度押すと削除';
        setTimeout(() => {
          del.classList.remove('is-armed');
          del.textContent = '削除';
        }, 3000);
        return;
      }
      state.works.splice(state.sel, 1);
      toast(`「${titleOf(w)}」を一覧から外しました（保存で確定）`);
      changed();
      select(Math.min(state.sel, state.works.length - 1));
    });
  }
}

function updateCount(box) {
  const ta = $('textarea[data-k="summary"]', box);
  const c = $('[data-count]', box);
  if (ta && c) c.textContent = `${ta.value.length} 文字`;
}

// ===== 画像と動画の取り込み =====
const filePicker = $('[data-file]');

function pickFile(accept, multiple, done) {
  filePicker.accept = accept;
  filePicker.multiple = multiple;
  filePicker.value = '';
  filePicker.onchange = () => {
    if (filePicker.files.length) done([...filePicker.files]);
  };
  filePicker.click();
}

function dropTarget(el, done) {
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    el.classList.add('is-over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('is-over'));
  el.addEventListener('drop', (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    el.classList.remove('is-over');
    done([...e.dataTransfer.files]);
  });
}

const SLOT_NAME = { main: 'title', shot0: 'game1', shot1: 'game2', thumb: 'thumb', gallery: 'shot', video: 'video' };

async function upload(file, slot, el) {
  const w = cur();
  el.classList.add('is-busy');
  try {
    const res = await api(`/api/upload?slug=${encodeURIComponent(w.slug)}&slot=${SLOT_NAME[slot] || 'image'}`, {
      method: 'POST',
      headers: { 'X-Filename': encodeURIComponent(file.name || 'image.png') },
      body: file,
    });
    if (slot === 'video') {
      if (!res.video) throw new Error('動画ファイルを選んでください');
      w.video = res.video.src;
      toast(`動画を取り込みました（${(res.video.size / 1024 / 1024).toFixed(1)}MB）`, 'ok');
    } else {
      if (!res.image) throw new Error('画像ファイルを選んでください');
      setImage(slot, res.image, false);
    }
    return true;
  } catch (e) {
    toast(e.message, 'error');
    return false;
  } finally {
    el.classList.remove('is-busy');
  }
}

async function uploadMany(files, slot, el) {
  const list = slot === 'gallery' ? files : files.slice(0, 1);
  for (const f of list) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await upload(f, slot, el))) break;
  }
  changed();
  renderForm();
}

function setImage(slot, img, rerender = true) {
  const w = cur();
  if (slot === 'main') w.main = img ? { ...img, caption: (w.main && w.main.caption) || 'Title' } : { caption: (w.main && w.main.caption) || 'Title' };
  else if (slot === 'thumb') w.thumb = img;
  else if (slot === 'gallery') {
    if (img) (w.gallery = w.gallery || []).push(img);
  } else if (slot.startsWith('shot')) {
    const i = Number(slot.slice(4));
    const shots = [...(w.shots || [])];
    while (shots.length < i) shots.push({});
    shots[i] = img || {};
    while (shots.length && !(shots[shots.length - 1] && shots[shots.length - 1].src)) shots.pop();
    w.shots = shots;
  }
  if (rerender) {
    changed();
    renderForm();
  }
}

// Ctrl+V で、選んでいる画像の枠へ貼る
document.addEventListener('paste', (e) => {
  const target = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-drop]');
  if (!target) return;
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  uploadMany(files, target.dataset.drop, target);
});
// 枠の外に落としたファイルでブラウザが画像を開いてしまわないように
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ===== 文章（強調と改行だけ使える） =====
const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'UL', 'OL', 'BLOCKQUOTE', 'PRE']);
const EMPH = new Set(['EM', 'B', 'STRONG', 'MARK']);

function inlineHtml(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) out += esc(n.textContent.replace(/ /g, ' '));
    else if (n.nodeType === Node.ELEMENT_NODE) {
      if (n.tagName === 'BR') out += '<br>';
      else if (EMPH.has(n.tagName)) {
        const inner = inlineHtml(n);
        if (inner.replace(/<br>/g, '').trim()) out += `<em class="hl">${inner}</em>`;
        else out += inner;
      } else if (BLOCKS.has(n.tagName)) out += `${inlineHtml(n)}<br>`;
      else out += inlineHtml(n);
    }
  });
  return out;
}

function rteParagraphs(el) {
  const paras = [];
  let buf = '';
  const flush = () => {
    const t = buf.replace(/^(?:<br>|\s)+|(?:<br>|\s)+$/g, '').replace(/<em class="hl">\s*<\/em>/g, '');
    if (t) paras.push(t);
    buf = '';
  };
  el.childNodes.forEach((n) => {
    if (n.nodeType === Node.ELEMENT_NODE && BLOCKS.has(n.tagName)) {
      flush();
      buf = inlineHtml(n);
      flush();
    } else if (n.nodeType === Node.ELEMENT_NODE && n.tagName === 'BR') {
      buf += '<br>';
    } else {
      const wrap = document.createElement('span');
      wrap.appendChild(n.cloneNode(true));
      buf += inlineHtml(wrap);
    }
  });
  flush();
  return paras;
}

function setupRte(el, w) {
  document.execCommand('defaultParagraphSeparator', false, 'p');
  el.innerHTML = (w.body || []).map((p) => `<p>${p}</p>`).join('') || '<p><br></p>';
  const sync = () => {
    w.body = rteParagraphs(el);
    el.classList.toggle('is-empty', !el.textContent.trim());
    const meta = $('[data-card-meta]');
    if (meta) meta.textContent = cardMeta(w);
    changed();
  };
  el.classList.toggle('is-empty', !el.textContent.trim());
  el.addEventListener('input', sync);
  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });
  el.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleHighlight(el);
      sync();
    }
  });
  $('[data-hl]').addEventListener('mousedown', (e) => {
    e.preventDefault();
    toggleHighlight(el);
    sync();
  });
  $('[data-clear-fmt]').addEventListener('click', () => {
    $$('em, b, strong, mark', el).forEach(unwrap);
    sync();
  });
}

function unwrap(node) {
  const parent = node.parentNode;
  while (node.firstChild) parent.insertBefore(node.firstChild, node);
  parent.removeChild(node);
  parent.normalize();
}

function closestEmph(node, root) {
  for (let n = node; n && n !== root; n = n.parentNode) {
    if (n.nodeType === Node.ELEMENT_NODE && EMPH.has(n.tagName)) return n;
  }
  return null;
}

function toggleHighlight(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  const em = closestEmph(range.startContainer, root) || closestEmph(range.endContainer, root);
  if (em) {
    unwrap(em);
    return;
  }
  if (range.collapsed) {
    toast('強調したい文字を選んでから押してください');
    return;
  }
  const frag = range.extractContents();
  frag.querySelectorAll('em, b, strong, mark').forEach(unwrap);
  const wrap = document.createElement('em');
  wrap.className = 'hl';
  wrap.appendChild(frag);
  range.insertNode(wrap);
  sel.removeAllRanges();
  const r = document.createRange();
  r.selectNodeContents(wrap);
  sel.addRange(r);
}

// ===== 右：プレビュー =====
const frame = $('[data-frame]');
const stage = $('[data-stage]');
let pvScroll = { key: '', y: 0 };

function previewUrl() {
  const w = cur();
  if (state.pvPage === 'index') return '/__preview-index.html?edit';
  if (!w) return 'about:blank';
  if (isMain(w)) return `/works/${w.slug}.html?edit`;
  return `/works/__preview-${w.slug}.html?edit`;
}

async function refreshPreview() {
  try {
    await postJson('/api/preview', { works: strip(state.works) });
  } catch (e) {
    toast(`プレビューを作れませんでした：${e.message}`, 'error');
    return;
  }
  const url = previewUrl();
  try {
    const win = frame.contentWindow;
    if (win && win.location.pathname !== 'blank') pvScroll = { key: win.location.pathname, y: win.scrollY };
  } catch {
    // 読み込み前
  }
  frame.dataset.url = url;
  frame.src = url;
}

frame.addEventListener('load', () => {
  try {
    const win = frame.contentWindow;
    if (win.location.pathname === pvScroll.key) win.scrollTo({ top: pvScroll.y, behavior: 'instant' });
    else if (state.pvPage === 'index') {
      const target = win.document.getElementById('works');
      if (target) win.scrollTo({ top: target.getBoundingClientRect().top + win.scrollY - 70, behavior: 'instant' });
    }
  } catch {
    // 別のページへ移ったとき
  }
});

function layoutPreview() {
  const W = stage.clientWidth;
  const H = stage.clientHeight;
  if (state.pvSize === 'sp') {
    const fw = 390;
    const fh = Math.min(844, H - 32);
    stage.classList.add('is-sp');
    frame.style.width = `${fw}px`;
    frame.style.height = `${fh}px`;
    frame.style.transform = 'translateX(-50%)';
    return;
  }
  stage.classList.remove('is-sp');
  const fw = Math.max(1280, W);
  const s = W / fw;
  frame.style.width = `${fw}px`;
  frame.style.height = `${H / s}px`;
  frame.style.transform = `scale(${s})`;
}
new ResizeObserver(layoutPreview).observe(stage);

$$('[data-pv-page]').forEach((b) => b.addEventListener('click', () => {
  state.pvPage = b.dataset.pvPage;
  $$('[data-pv-page]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  refreshPreview();
}));
$$('[data-pv-size]').forEach((b) => b.addEventListener('click', () => {
  state.pvSize = b.dataset.pvSize;
  $$('[data-pv-size]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  layoutPreview();
}));
$('[data-pv-reload]').addEventListener('click', refreshPreview);

// ===== 保存 =====
async function save() {
  if (!dirty()) return true;
  const btn = $('[data-save]');
  btn.disabled = true;
  try {
    const selSlug = cur() && cur().slug;
    const res = await postJson('/api/save', { works: strip(state.works) });
    load(res.works, selSlug);
    const n = res.changed.length;
    toast(n ? `保存しました（${n} ファイルを作り直し）` : '保存しました', 'ok');
    refreshGitBadge();
    return true;
  } catch (e) {
    toast(`保存できませんでした：${e.message}`, 'error');
    updateState();
    return false;
  }
}

$('[data-save]').addEventListener('click', save);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    save();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (dirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

function load(works, selSlug) {
  state.works = works.map((w) => ({ ...w, _id: nextId++ }));
  remember();
  const i = state.works.findIndex((w) => w.slug === selSlug);
  state.sel = i >= 0 ? i : Math.min(state.sel, state.works.length - 1);
  updateState();
  renderList();
  renderForm();
  refreshPreview();
}

// ===== git =====
const drawer = $('[data-git]');
const gitLog = $('[data-git-log]');

function showLog(text, error = false) {
  gitLog.hidden = !text;
  gitLog.textContent = text || '';
  gitLog.classList.toggle('is-error', error);
}

function busy(on) {
  $$('.drawer button').forEach((b) => { b.disabled = on && !b.matches('[data-close-git]'); });
}

async function refreshGitBadge() {
  try {
    const st = await api('/api/git/status');
    const n = st.files.length + st.ahead;
    const badge = $('[data-git-badge]');
    badge.hidden = !n;
    badge.textContent = String(n);
    return st;
  } catch {
    return null;
  }
}

function fileLabel(path) {
  const m = path.match(/^works\/([a-z0-9-]+)\.html$/);
  if (m) {
    const w = state.works.find((x) => x.slug === m[1]);
    if (w) return `${esc(titleOf(w))} のページ <code>${esc(path)}</code>`;
  }
  if (path === 'index.html') return `トップ <code>${esc(path)}</code>`;
  if (path === 'content/works.json') return `作品のデータ <code>${esc(path)}</code>`;
  if (path.startsWith('assets/')) return `画像・動画 <code>${esc(path)}</code>`;
  return `<code>${esc(path)}</code>`;
}

async function renderGit({ keepMsg = false } = {}) {
  const st = await refreshGitBadge();
  if (!st) {
    $('[data-git-branch]').textContent = 'git の状態を読めませんでした';
    return;
  }
  const parts = [`ブランチ <b>${esc(st.branch)}</b>`];
  parts.push(st.ahead ? `<b style="color:var(--warn)">未公開のコミット ${st.ahead} 件</b>` : '未公開のコミットなし');
  if (st.behind) parts.push(`<b style="color:var(--danger)">GitHub 側に新しいコミット ${st.behind} 件（取り込んでください）</b>`);
  $('[data-git-branch]').innerHTML = parts.join(' ・ ');
  $('[data-git-files]').innerHTML = st.files.length
    ? st.files.map((f) => `<li><span class="tag${f.label === '削除' ? ' is-del' : ''}${f.label === '新規' ? ' is-new' : ''}">${esc(f.label)}</span><span>${fileLabel(f.path)}</span></li>`).join('')
    : '<li class="empty">変更はありません</li>';
  $('[data-git-commits]').innerHTML = st.commits.map((c) => `<li><code>${esc(c.date)}</code><span>${esc(c.subject)}</span></li>`).join('');
  const msg = $('[data-git-msg]');
  if (!keepMsg || !msg.value) msg.value = st.message;
  return st;
}

$('[data-open-git]').addEventListener('click', async () => {
  drawer.hidden = false;
  showLog('');
  await renderGit();
});
$$('[data-close-git]').forEach((b) => b.addEventListener('click', () => { drawer.hidden = true; }));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !drawer.hidden) drawer.hidden = true;
});

async function ensureSaved() {
  if (!dirty()) return true;
  toast('先に保存します');
  return save();
}

async function doCommit() {
  const message = $('[data-git-msg]').value.trim();
  if (!message) {
    toast('コミットの説明を書いてください', 'error');
    return false;
  }
  const res = await postJson('/api/git/commit', { message });
  showLog(res.output);
  return true;
}

async function doPush() {
  const res = await postJson('/api/git/push', {});
  showLog(`${gitLog.textContent ? `${gitLog.textContent}\n\n` : ''}${res.output}`);
  watchPages();
}

async function gitAction(fn) {
  busy(true);
  try {
    await fn();
  } catch (e) {
    showLog(e.message, true);
    toast('git の操作に失敗しました（下の出力を見てください）', 'error');
  } finally {
    busy(false);
    await renderGit({ keepMsg: true });
  }
}

$('[data-git-commit]').addEventListener('click', () => gitAction(async () => {
  if (!(await ensureSaved())) return;
  if (await doCommit()) toast('コミットしました', 'ok');
}));
$('[data-git-publish]').addEventListener('click', () => gitAction(async () => {
  if (!(await ensureSaved())) return;
  const st = await api('/api/git/status');
  if (st.files.length && !(await doCommit())) return;
  await doPush();
  toast('GitHub に送りました。1〜2 分で公開されます', 'ok');
}));
$('[data-git-push]').addEventListener('click', () => gitAction(async () => {
  await doPush();
  toast('GitHub に送りました', 'ok');
}));
$('[data-git-pull]').addEventListener('click', () => gitAction(async () => {
  if (dirty()) {
    toast('保存していない変更があります。先に保存してください', 'error');
    return;
  }
  const res = await postJson('/api/git/pull', {});
  showLog(res.output);
  load(res.works, cur() && cur().slug);
  toast('最新を取り込みました', 'ok');
}));
$('[data-git-fetch]').addEventListener('click', () => gitAction(async () => {
  await postJson('/api/git/fetch', {});
  toast('GitHub の状態を確かめました');
}));

let pagesTimer = 0;

function watchPages() {
  const box = $('[data-git-pages]');
  const started = Date.now();
  clearTimeout(pagesTimer);
  box.hidden = false;
  box.classList.remove('is-done');
  box.textContent = '公開を待っています…';
  const tick = async () => {
    try {
      const st = await api('/api/git/pages');
      if (st.status === 'unknown') {
        box.innerHTML = '1〜2 分で <a href="https://tanahara0310.github.io/" target="_blank" rel="noopener">公開サイト</a> に反映されます';
        return;
      }
      const head = (await api('/api/git/status')).commits[0];
      const mine = head && st.commit && head.hash.startsWith(st.commit.slice(0, 7));
      if (mine && st.status === 'built') {
        box.classList.add('is-done');
        box.innerHTML = '公開されました ✓ <a href="https://tanahara0310.github.io/" target="_blank" rel="noopener">公開サイトを開く ↗</a>（古いままなら再読み込み）';
        return;
      }
      box.textContent = `公開の準備中…（${Math.round((Date.now() - started) / 1000)} 秒）`;
    } catch {
      box.textContent = '公開の状態を確かめられませんでした';
      return;
    }
    if (Date.now() - started < 5 * 60 * 1000) pagesTimer = setTimeout(tick, 6000);
  };
  pagesTimer = setTimeout(tick, 4000);
}

// ===== はじめ =====
(async () => {
  try {
    const data = await api('/api/data');
    GRADES = { ...GRADES, ...data.grades };
    load(data.works);
    refreshGitBadge();
  } catch (e) {
    $('[data-state]').textContent = `読み込めませんでした：${e.message}（tools/editor.py から開いてください）`;
  }
})();
