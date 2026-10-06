"""手書きのページ（トップと就活作品）を、エディタのプレビューで直接書き換えるための処理。

- annotate(): 書き換えられる所に目印の属性を付ける（何度実行しても同じ所には付け直さない）
    data-edit="t1"       文字（中の <br> や <b> などはそのまま）
    data-edit-list="l1"  並び（タグやリスト。1 個ずつ書き換え・増やす・消す）
    data-edit-img="i1"   画像（差し替え）
    data-edit-yt="v1"    YouTube のボタン（動画 ID）
- apply(): エディタで直した中身を、目印を頼りにページのソースへ書き戻す
"""
import html
import re
from html.parser import HTMLParser

VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
RAW = {"script", "style"}
INLINE = {"br", "mark", "em", "b", "strong", "small", "span", "i", "code", "sup", "sub"}
# 中の文字を書き換えさせない所（サイト共通の枠・自動で作る所・動きのための所）
SKIP_TAGS = {"head", "header", "footer", "dialog", "aside", "script", "style", "select", "textarea", "svg", "canvas"}
SKIP_CLASSES = {"works", "filters", "seg", "ach", "toasts", "gauge", "topnav", "dock", "pager", "timeslide-ticks", "sea-fallback"}
LIST_CLASSES = {"tags", "libs"}
MARK_RE = re.compile(r'\sdata-edit(?:-list|-img|-yt)?="([a-z])([0-9]+)"')
TAG_RE = re.compile(r"<!--.*?-->|<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>", re.S)


class Node:
    __slots__ = ("tag", "attrs", "start", "open_end", "close_start", "end", "parent", "children")

    def __init__(self, tag, attrs, start, open_end, parent):
        self.tag, self.attrs, self.start, self.open_end, self.parent = tag, attrs, start, open_end, parent
        self.close_start = self.end = open_end
        self.children = []

    def attr(self, name):
        m = re.search(r'(?:^|\s)' + re.escape(name) + r'(?:="([^"]*)"|(?=[\s/>]|$))', self.attrs)
        if not m:
            return None
        return m.group(1) if m.group(1) is not None else ""

    def classes(self):
        return set((self.attr("class") or "").split())


def parse(src):
    """要素の木と、それぞれのソース上の位置（開始タグ・中身・終了タグ）"""
    root = Node("#root", "", 0, 0, None)
    stack = [root]
    pos = 0
    while True:
        m = TAG_RE.search(src, pos)
        if not m:
            break
        pos = m.end()
        if m.group(0).startswith("<!--"):
            continue
        closing, tag, attrs = m.group(1), m.group(2).lower(), m.group(3)
        if closing:
            for i in range(len(stack) - 1, 0, -1):
                if stack[i].tag == tag:
                    for n in stack[i:]:
                        n.close_start, n.end = m.start(), m.end()
                    del stack[i:]
                    break
            continue
        node = Node(tag, attrs, m.start(), m.end(), stack[-1])
        stack[-1].children.append(node)
        if tag in VOID or attrs.rstrip().endswith("/"):
            continue
        if tag in RAW:
            close = re.compile(rf"</{tag}\s*>", re.I).search(src, pos)
            if close:
                node.close_start, node.end = close.start(), close.end()
                pos = close.end()
            continue
        stack.append(node)
    return root


def walk(node):
    for c in node.children:
        yield c
        yield from walk(c)


def inline_only(node):
    return all(c.tag in INLINE and inline_only(c) for c in node.children)


def has_text(src, node):
    inner = src[node.open_end:node.close_start]
    return bool(re.sub(r"<[^>]*>|&nbsp;|\s", "", inner))


def skipped(node):
    if node.tag in SKIP_TAGS:
        return True
    if node.classes() & SKIP_CLASSES:
        return True
    return any(a.startswith("data-ach") for a in re.findall(r"(data-[a-z-]+)", node.attrs))


def is_list(src, node):
    if not (node.tag in ("ul", "ol") or node.classes() & LIST_CLASSES):
        return False
    return bool(node.children) and all(c.tag in ("li", "span") and inline_only(c) and has_text(src, c) for c in node.children)


def annotate(src):
    """書き換えられる所に目印を付けたソースを返す"""
    used = {}
    for kind, num in MARK_RE.findall(src):
        used[kind] = max(used.get(kind, 0), int(num))
    inserts = []

    def mark(node, attr, kind):
        if MARK_RE.search(" " + node.attrs):
            return
        used[kind] = used.get(kind, 0) + 1
        at = node.open_end - (2 if src[node.open_end - 2] == "/" else 1)
        inserts.append((at, f' {attr}="{kind}{used[kind]}"'))

    def visit(node, text_ok):
        if skipped(node):
            return
        if node.tag == "button":
            if node.attr("data-yt") is not None:
                mark(node, "data-edit-yt", "v")
            for c in node.children:
                visit(c, False)
            return
        if node.tag == "img":
            mark(node, "data-edit-img", "i")
            return
        if text_ok and is_list(src, node):
            mark(node, "data-edit-list", "l")
            return
        if text_ok and node.tag not in ("br", "body", "html", "main") and inline_only(node) and has_text(src, node):
            mark(node, "data-edit", "t")
            return
        for c in node.children:
            visit(c, text_ok)

    for n in parse(src).children:
        visit(n, True)
    for at, text in sorted(inserts, reverse=True):
        src = src[:at] + text + src[at:]
    return src


# ===== 書き戻すときに通すタグ =====
ALLOWED = {"br", "mark", "em", "b", "strong", "small", "span", "i", "code", "sup", "sub", "li"}


class _Clean(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out = []
        self.open = []

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED:
            return
        cls = " ".join(c for c in (dict(attrs).get("class") or "").split() if re.fullmatch(r"[a-z0-9-]+", c) and not c.startswith(("is-visible", "is-settled", "is-emerging")))
        self.out.append(f'<{tag} class="{cls}">' if cls else f"<{tag}>")
        if tag != "br":
            self.open.append(tag)

    def handle_startendtag(self, tag, attrs):
        if tag == "br":
            self.out.append("<br>")

    def handle_endtag(self, tag):
        if tag in self.open:
            while self.open:
                t = self.open.pop()
                self.out.append(f"</{t}>")
                if t == tag:
                    break

    def handle_data(self, data):
        self.out.append(html.escape(data, quote=False))


def clean(fragment):
    p = _Clean()
    p.feed(fragment or "")
    p.close()
    return "".join(p.out) + "".join(f"</{t}>" for t in reversed(p.open))


def sm_path(src):
    return re.sub(r"\.webp$", "-sm.webp", src)


def set_attr(tag_src, name, value):
    """開始タグの属性を書き換える（無ければ足す）"""
    pat = re.compile(r'(\s' + re.escape(name) + r')="[^"]*"')
    if pat.search(tag_src):
        return pat.sub(lambda m: f'{m.group(1)}="{html.escape(str(value), quote=True)}"', tag_src, count=1)
    end = len(tag_src) - 1
    return tag_src[:end] + f' {name}="{html.escape(str(value), quote=True)}"' + tag_src[end:]


def apply(src, edits, prefix=""):
    """edits = {"html": {key: 中身}, "imgs": {key: {src, w, h}}, "yts": {key: 動画 ID}}。prefix はページから見た根元（works/ なら ../）"""
    edits = edits or {}
    texts, imgs, yts = edits.get("html") or {}, edits.get("imgs") or {}, edits.get("yts") or {}
    changes = []
    for node in walk(parse(src)):
        m = MARK_RE.search(" " + node.attrs)
        if not m:
            continue
        key = m.group(1) + m.group(2)
        if key in texts and node.tag not in VOID:
            changes.append((node.open_end, node.close_start, clean(texts[key])))
        elif key in imgs and node.tag == "img":
            img = imgs[key]
            tag = src[node.start:node.open_end]
            small = (node.attr("src") or "").endswith("-sm.webp")
            w, h = int(img["w"]), int(img["h"])
            sw, sh = (w, h) if w <= 800 else (800, round(h * 800 / w))
            tag = set_attr(tag, "src", prefix + (sm_path(img["src"]) if small else img["src"]))
            if node.attr("srcset") is not None:
                tag = set_attr(tag, "srcset", f"{prefix}{sm_path(img['src'])} 800w, {prefix}{img['src']} 1600w")
            tag = set_attr(tag, "width", sw if small else w)
            tag = set_attr(tag, "height", sh if small else h)
            changes.append((node.start, node.open_end, tag))
        elif key in yts and node.tag == "button":
            changes.append((node.start, node.open_end, set_attr(src[node.start:node.open_end], "data-yt", yts[key])))
    for a, b, text in sorted(changes, reverse=True):
        src = src[:a] + text + src[b:]
    return src


def referenced(src):
    """ページが使っている画像・動画の相対パス（../ を外したもの）"""
    out = set()
    for m in re.finditer(r'(?:src|srcset|href)="([^"]+)"', src):
        for part in m.group(1).split(","):
            p = part.strip().split(" ")[0]
            p = re.sub(r"^(\.\./)+", "", p)
            out.add(p)
            # 拡大表示は小さい版の名前から大きい版を読むので、大小を組で使っているとみなす
            if p.endswith("-sm.webp"):
                out.add(p[:-len("-sm.webp")] + ".webp")
            elif p.endswith(".webp"):
                out.add(sm_path(p))
    return out
