"""作品のデータ（content/works.json）から、チーム作品のページと、トップの作品一覧を作り直す。

使い方: python tools/pages.py
エディタ（tools/editor.py）も保存のたびにこれを使う。
"""
import html
import json
import os
import re
from html.parser import HTMLParser

import inline

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_PATH = os.path.join(ROOT, "content", "works.json")
SITE_URL = "https://tanahara0310.github.io"

GRADES = {"y1": "1年生", "y2": "2年生", "y3": "3年生", "y4": "4年生"}
FILTER_ORDER = ["main", "y4", "y3", "y2", "y1"]
FILTER_LABELS = {"main": "就活作品", "y4": "4年生", "y3": "3年生", "y2": "2年生", "y1": "1年生"}
UNTITLED = "（作品名）"


def esc(s):
    return html.escape(str(s or ""), quote=True)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_if_changed(path, text):
    """中身が変わったときだけ書く。書いたら True"""
    if os.path.exists(path) and read(path) == text:
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return True


def load():
    with open(DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def dump(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def version():
    m = re.search(r"style\.css\?v=([0-9]+)", read(os.path.join(ROOT, "index.html")))
    return m.group(1) if m else "0"


# ===== 文章の中で使ってよいタグ =====
class _Clean(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.open_em = 0

    def handle_starttag(self, tag, attrs):
        if tag == "br":
            self.out.append("<br>")
        elif tag in ("em", "b", "strong", "mark"):
            self.out.append('<em class="hl">')
            self.open_em += 1

    def handle_endtag(self, tag):
        if tag in ("em", "b", "strong", "mark") and self.open_em:
            self.out.append("</em>")
            self.open_em -= 1

    def handle_data(self, data):
        self.out.append(html.escape(data, quote=False))


def clean_inline(fragment):
    """段落 1 つ分の HTML から、強調（<em class="hl">）と改行（<br>）以外を外す"""
    p = _Clean()
    p.feed(fragment or "")
    p.close()
    out = "".join(p.out) + "</em>" * p.open_em
    out = re.sub(r'<em class="hl"></em>', "", out)
    out = re.sub(r"^(?:<br>|\s)+|(?:<br>|\s)+$", "", out)
    return out


def clean_work(w):
    """エディタから来たデータを整える"""
    w = dict(w)
    w["slug"] = re.sub(r"[^a-z0-9-]", "", str(w.get("slug", "")).lower()).strip("-")
    for k in ("title", "summary", "env", "envNote", "people", "period", "youtube", "video", "meta"):
        if k in w:
            w[k] = str(w.get(k) or "").strip()
    if "body" in w:
        w["body"] = [p for p in (clean_inline(x) for x in w.get("body") or []) if p]
    return w


# ===== 画像 =====
def sm_path(src):
    return re.sub(r"\.webp$", "-sm.webp", src)


def sm_size(img):
    w, h = int(img.get("w") or 800), int(img.get("h") or 450)
    if w <= 800:
        return w, h
    return 800, round(h * 800 / w)


def title_of(w):
    return w.get("title") or UNTITLED


def grade(w):
    return GRADES.get(w.get("cat"), "")


# ===== チーム作品のページ =====
def is_team_page(w):
    return w.get("kind") != "main"


def chain(works):
    """前後の作品の並び（就活作品 → 古い順のチーム作品）"""
    main = [w for w in works if w.get("kind") == "main"]
    team = [w for w in works if is_team_page(w)]
    return main[:1] + list(reversed(team))


def pager_html(w, works):
    order = chain(works)
    i = next(k for k, x in enumerate(order) if x["slug"] == w["slug"])
    prev = order[i - 1] if i > 0 else None
    nxt = order[i + 1] if i + 1 < len(order) else None
    if prev is None:
        left = '<a class="pager-prev" href="../index.html#works"><small>← もどる</small>作品一覧</a>'
    elif prev.get("kind") == "main":
        left = f'<a class="pager-prev" href="{esc(prev["slug"])}.html"><small>← 就活作品</small>{esc(main_name(prev))}</a>'
    else:
        left = f'<a class="pager-prev" href="{esc(prev["slug"])}.html"><small>← 前の作品</small>{esc(title_of(prev))}</a>'
    if nxt is None:
        right = '<a class="pager-next" href="../index.html"><small>トップ →</small>棚原 誇亜</a>'
    else:
        right = f'<a class="pager-next" href="{esc(nxt["slug"])}.html"><small>次の作品 →</small>{esc(title_of(nxt))}</a>'
    return f"""<nav class="pager" aria-label="作品の移動">
  {left}
  <a class="pager-list" href="../index.html#works">作品一覧</a>
  {right}
</nav>"""


def main_name(w):
    """就活作品の短い名前（「koaEngine（自作エンジン）」→「koaEngine」）"""
    return re.sub(r"（.*?）$", "", w.get("title") or "")


def video_button(w):
    t = esc(title_of(w))
    if w.get("youtube"):
        return (f'<button class="yt" type="button" data-yt="{esc(w["youtube"])}" data-title="{t}" aria-label="{t} の動画を見る（YouTube）">'
                '<span class="yt-bar">||</span> Youtube<span class="yt-play" aria-hidden="true"></span>動画を見る</button>')
    if w.get("video"):
        return (f'<button class="yt" type="button" data-video="../{esc(w["video"])}" data-title="{t}" aria-label="{t} の動画を見る">'
                '<span class="yt-play" aria-hidden="true"></span>動画を見る</button>')
    return ""


def main_figure(w):
    img = w.get("main") or {}
    cap = esc(img.get("caption") or "Title")
    if not img.get("src"):
        return f'<figure class="work-main"><figcaption>{cap}</figcaption><div class="img-todo">画像 準備中</div></figure>'
    t = title_of(w)
    alt = f"{t} のタイトル画面" if (img.get("caption") or "Title") == "Title" else f"{t} の画面"
    src = img["src"]
    return (f'<figure class="work-main"><figcaption>{cap}</figcaption><img src="../{esc(src)}" '
            f'srcset="../{esc(sm_path(src))} 800w, ../{esc(src)} 1600w" sizes="(min-width: 900px) 520px, 100vw" '
            f'width="{int(img.get("w") or 1600)}" height="{int(img.get("h") or 900)}" alt="{esc(alt)}" loading="lazy" decoding="async" data-zoom></figure>')


def small_img(img, alt, indent):
    sw, sh = sm_size(img)
    return f'{indent}<img src="../{esc(sm_path(img["src"]))}" width="{sw}" height="{sh}" alt="{esc(alt)}" loading="lazy" decoding="async" data-zoom>'


def shots_html(w):
    t = title_of(w)
    shots = list(w.get("shots") or [])[:2]
    rows = []
    for i in range(2):
        img = shots[i] if i < len(shots) else None
        if img and img.get("src"):
            rows.append(small_img(img, f"{t} のゲーム画面 {i + 1}", "          "))
        else:
            rows.append('          <div class="img-todo">ゲーム画面 準備中</div>')
    return "\n".join(rows)


def dev_row(label, value, note=""):
    if not value:
        return f'        <dd><span>{label}</span><i class="todo">準備中</i></dd>'
    extra = f' <em class="now">// {esc(note)}</em>' if note else ""
    return f"        <dd><span>{label}</span>{esc(value)}{extra}</dd>"


def body_html(w):
    paras = w.get("body") or []
    if not paras:
        return ('    <p class="todo">作品紹介は準備中です。</p>\n'
                '    <p class="todo">担当箇所とこだわりポイントは準備中です。</p>')
    return "\n".join(f"    <p>{p}</p>" for p in paras)


def gallery_html(w):
    imgs = [g for g in (w.get("gallery") or []) if g.get("src")]
    if not imgs:
        return ""
    t = title_of(w)
    rows = "\n".join(small_img(g, f"{t} の画面 {i + 1}", "    ") for i, g in enumerate(imgs))
    return f"""
  <div class="work-gallery">
    <p class="row-label">その他の画面</p>
    <div class="trio">
{rows}
    </div>
  </div>"""


def og_image(w):
    for img in (w.get("main"), w.get("thumb")):
        if img and img.get("src"):
            return f"{SITE_URL}/{img['src']}"
    return f"{SITE_URL}/assets/img/og.jpg"


def render_work(w, works, ver):
    t = title_of(w)
    g = grade(w)
    team = w.get("team", True)
    kind_en = "TEAM WORK" if team else "PERSONAL WORK"
    kind_ja = "チーム作品" if team else "個人作品"
    page_title = f"{t} | 棚原 誇亜 Portfolio"
    desc = f"{t}（{kind_ja}・{g}編）。棚原 誇亜のポートフォリオ。" if g else f"{t}（{kind_ja}）。棚原 誇亜のポートフォリオ。"
    title_cls = "door-title" if w.get("title") else "door-title todo-title"
    crumb_small = f" <small>/ {g}編</small>" if g else ""
    door_no = f"{kind_en} ─ {g}" if g else kind_en
    btn = video_button(w)
    btn_line = f"\n    {btn}" if btn else ""
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{esc(page_title)}</title>
<meta name="description" content="{esc(desc)}">
<meta name="theme-color" content="#050B10">
<meta property="og:type" content="website">
<meta property="og:title" content="{esc(page_title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE_URL}/works/{esc(w['slug'])}.html">
<meta property="og:image" content="{esc(og_image(w))}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=Outfit:wght@300;400;600&display=swap">
<link rel="stylesheet" href="../css/style.css?v={ver}">
<script>document.documentElement.classList.add('js');setTimeout(function(){{if(!window.koaReady)document.documentElement.classList.add('reveal-all');}},3000);</script>
</head>
<body data-depth="3,16" data-work="{esc(w['slug'])}">
<canvas id="ocean" aria-hidden="true"></canvas>
<div class="sea-fallback" aria-hidden="true"></div>

<header class="topbar">
  <a class="brand" href="../index.html">KOA TANAHARA</a>
  <nav class="topnav" aria-label="サイト内">
    <a href="../index.html#main">就活作品</a>
    <a href="../index.html#works" aria-current="page">作品一覧</a>
    <a href="../index.html#about">自己紹介</a>
  </nav>
  <a class="ach-chip" href="../index.html#achievements" title="実績"><span class="ach-chip-medal" aria-hidden="true"></span>実績 <b data-ach-count>0</b>/<span data-ach-total>14</span></a>
</header>

<aside class="gauge" aria-label="水深計">
  <p class="gauge-value"><b data-depth-value>1.2</b><small>m</small></p>
  <div class="gauge-track">
    <span class="gauge-mark"></span>
  </div>
</aside>

<nav class="dock" aria-label="サイト内">
  <a href="../index.html"><i class="dock-ico is-top"></i>海面</a>
  <a href="../index.html#main"><i class="dock-ico is-main"></i>就活作品</a>
  <a href="../index.html#works" aria-current="page"><i class="dock-ico is-works"></i>作品一覧</a>
  <a href="../index.html#about"><i class="dock-ico is-about"></i>自己紹介</a>
  <a href="../index.html#achievements"><i class="dock-ico is-ach"></i>実績</a>
</nav>

<div class="toasts" aria-live="polite"></div>

<main>

<section class="work-cover is-short">
  <p class="door-no">{esc(door_no)}</p>
  <h1 class="{title_cls}">{esc(t)}</h1>
</section>

<article data-float class="page work is-solo reveal">
  <div class="work-head">
    <p class="crumb"><span class="crumb-bar">|</span>{kind_ja}紹介{crumb_small}</p>{btn_line}
  </div>
  <div class="work-grid">
    {main_figure(w)}
    <div class="work-side">
      <figure class="work-sub"><figcaption>Game</figcaption>
        <div class="work-pair">
{shots_html(w)}
        </div>
      </figure>
      <dl class="dev">
        <dt>開発概要</dt>
{dev_row("開発環境", w.get("env"), w.get("envNote"))}
{dev_row("開発人数", w.get("people"))}
{dev_row("制作期間", w.get("period"))}
      </dl>
    </div>
  </div>
  <div class="work-text">
    <h4>作品紹介・こだわりポイント</h4>
{body_html(w)}
  </div>{gallery_html(w)}
</article>

{pager_html(w, works)}

</main>

<footer class="foot">
  <a class="btn" href="../index.html"><span aria-hidden="true">↑</span>海面へ浮上する</a>
  <p class="foot-name">棚原 誇亜 ／ KOA TANAHARA</p>
  <p class="foot-links"><a href="https://github.com/tanahara0310" target="_blank" rel="noopener">GitHub</a></p>
  <p class="foot-copy">© 2026 KOA TANAHARA</p>
</footer>

<dialog class="viewer" id="viewer" aria-label="拡大表示">
  <button class="viewer-close" type="button" aria-label="閉じる">×</button>
  <div class="viewer-body"></div>
  <p class="viewer-caption"></p>
</dialog>

<script type="module" src="../js/main.js?v={ver}"></script>
</body>
</html>
"""


# ===== トップの作品一覧 =====
def is_wip(w):
    return w.get("kind") != "main" and not w.get("body")


def card_meta(w):
    if w.get("kind") == "main":
        return w.get("meta") or ""
    if is_wip(w):
        return " ・ ".join(x for x in (grade(w), "準備中") if x)
    return " ・ ".join(x for x in (grade(w), w.get("envNote") or w.get("env"), w.get("people"), w.get("period")) if x)


def card_image(w):
    for img in (w.get("thumb"), w.get("main")):
        if img and img.get("src"):
            return img
    return None


def render_card(w):
    cls = "wcard"
    if w.get("kind") == "main":
        cls += " is-feature"
    elif is_wip(w):
        cls += " is-wip"
    cat = "main" if w.get("kind") == "main" else w.get("cat", "")
    img = card_image(w)
    if img:
        sw, sh = sm_size(img)
        alt = img.get("alt") or title_of(w)
        img_html = f'<img src="{esc(sm_path(img["src"]))}" width="{sw}" height="{sh}" alt="{esc(alt)}" loading="lazy" decoding="async">'
    else:
        img_html = ""
    text = "" if is_wip(w) or not w.get("summary") else f'\n            <span class="wcard-text">{esc(w["summary"])}</span>'
    return f"""      <li class="{cls}" data-float data-slug="{esc(w['slug'])}" data-cat="{esc(cat)}">
        <a href="works/{esc(w['slug'])}.html">
          <span class="wcard-img">{img_html}</span>
          <span class="wcard-body">
            <span class="wcard-meta">{esc(card_meta(w))}</span>
            <span class="wcard-title">{esc(title_of(w))}</span>{text}
          </span>
          <span class="wcard-seen">見た</span>
        </a>
      </li>"""


def render_filters(works):
    cats = {"main" if w.get("kind") == "main" else w.get("cat") for w in works}
    rows = ['      <button type="button" data-filter="all" aria-pressed="true">ぜんぶ</button>']
    for c in FILTER_ORDER:
        if c in cats:
            rows.append(f'      <button type="button" data-filter="{c}" aria-pressed="false">{FILTER_LABELS[c]}</button>')
    return "\n".join(rows)


def render_index(index_src, works):
    n = len(works)
    out = re.sub(r'(<ul class="works">\n).*?(\n    </ul>)',
                 lambda m: m.group(1) + "\n".join(render_card(w) for w in works) + m.group(2), index_src, count=1, flags=re.S)
    out = re.sub(r'(<div class="seg filters"[^>]*>\n).*?(\n    </div>)',
                 lambda m: m.group(1) + render_filters(works) + m.group(2), out, count=1, flags=re.S)
    out = re.sub(r'<b>[0-9]+</b><small>作品</small>', f"<b>{n}</b><small>作品</small>", out, count=1)
    out = re.sub(r'個人／チームで作った [0-9]+ 作品', f"個人／チームで作った {n} 作品", out, count=1)
    return out


def render_main_js(src, works):
    slugs = [w["slug"] for w in works]
    lines, line = [], "const ALL_WORKS = ["
    for i, s in enumerate(slugs):
        item = f"'{s}'" + ("," if i + 1 < len(slugs) else "];")
        if len(line) + len(item) + 1 > 110:
            lines.append(line.rstrip())
            line = "  "
        line += item + " "
    lines.append(line.rstrip())
    return re.sub(r"const ALL_WORKS = \[.*?\];", lambda m: "\n".join(lines), src, count=1, flags=re.S)


def render_main_page(src, works):
    """就活作品のページの「チーム作品 →」を、いちばん古いチーム作品へ向ける"""
    order = chain(works)
    first = order[1] if len(order) > 1 else None
    if not first:
        return src
    return re.sub(r'<a class="pager-next" href="[^"]*"><small>チーム作品 →</small>[^<]*</a>',
                  f'<a class="pager-next" href="{esc(first["slug"])}.html"><small>チーム作品 →</small>{esc(title_of(first))}</a>', src, count=1)


# ===== まとめて作り直す =====
def build(data, write=True):
    """作り直したファイルの中身を {相対パス: 中身} で返す。write なら変わったものだけ書く"""
    works = data["works"]
    ver = version()
    files = {}
    for w in works:
        if is_team_page(w):
            files[f"works/{w['slug']}.html"] = render_work(w, works, ver)
    files["index.html"] = render_index(inline.annotate(read(os.path.join(ROOT, "index.html"))), works)
    files["js/main.js"] = render_main_js(read(os.path.join(ROOT, "js", "main.js")), works)
    mains = [w for w in works if w.get("kind") == "main"]
    if mains:
        p = f"works/{mains[0]['slug']}.html"
        files[p] = render_main_page(inline.annotate(read(os.path.join(ROOT, p))), works)
    changed = []
    if write:
        for rel, text in files.items():
            if write_if_changed(os.path.join(ROOT, rel), text):
                changed.append(rel)
    return files, changed


def hand_pages(data):
    """手書きのページ（エディタではプレビューを直接書き換える）"""
    mains = [w for w in data["works"] if w.get("kind") == "main"]
    return ["index.html"] + [f"works/{w['slug']}.html" for w in mains[:1]]


def prefix_of(rel):
    """ページから見たサイトの根元"""
    return "../" * rel.count("/")


def referenced_images(data):
    """データが使っている画像・動画（相対パス）"""
    out = set()
    for w in data["works"]:
        for k in ("main", "thumb"):
            if w.get(k) and w[k].get("src"):
                out.add(w[k]["src"])
        for k in ("shots", "gallery"):
            for img in w.get(k) or []:
                if img.get("src"):
                    out.add(img["src"])
        if w.get("video"):
            out.add(w["video"])
    full = set(out)
    for p in out:
        if p.endswith(".webp"):
            full.add(sm_path(p))
    return full


if __name__ == "__main__":
    _, changed = build(load())
    print("\n".join(changed) if changed else "変更なし")
