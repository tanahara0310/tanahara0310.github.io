"""ポートフォリオのエディタ。作品の文章・画像・動画を書き換え、git でコミットと公開までできる。

使い方: python tools/editor.py   （tools/editor.bat をダブルクリックしても起動する）
ブラウザで http://localhost:8790/tools/editor/ が開く。止めるときは黒い窓を閉じる。
"""
import hashlib
import http.server
import io
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pages as portfolio  # noqa: E402  tools/pages.py

ROOT = portfolio.ROOT
WORKS_IMG = "assets/img/works"
VIDEO_DIR = "assets/video"
MAX_VIDEO = 95 * 1024 * 1024  # GitHub は 100MB を超えるファイルを受け付けない
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXT = {".mp4", ".webm", ".mov"}

lock = threading.Lock()
drafts = {"works": None}

try:
    from PIL import Image
except ImportError:  # Pillow が無いと画像を変換できない
    Image = None


# ===== 画像と動画 =====
def save_image(data, slug, slot):
    """画像を幅 1600 と 800 の webp にして保存し、データ用の {src, w, h} を返す"""
    if Image is None:
        raise RuntimeError("画像の変換に Pillow が要ります（pip install pillow）")
    digest = hashlib.sha1(data).hexdigest()[:6]
    name = f"{slug}-{slot}-{digest}"
    big = f"{WORKS_IMG}/{name}.webp"
    with Image.open(io.BytesIO(data)) as im:
        im.load()
        if getattr(im, "is_animated", False):
            im.seek(0)
        im = im.convert("RGBA") if im.mode in ("RGBA", "LA", "P") else im.convert("RGB")
        if im.mode == "RGBA" and im.getextrema()[3][0] == 255:
            im = im.convert("RGB")
        w, h = im.size
        large = im if w <= 1600 else im.resize((1600, round(h * 1600 / w)), Image.LANCZOS)
        small = im if w <= 800 else im.resize((800, round(h * 800 / w)), Image.LANCZOS)
        os.makedirs(os.path.join(ROOT, WORKS_IMG), exist_ok=True)
        large.save(os.path.join(ROOT, big), "WEBP", quality=86, method=6)
        small.save(os.path.join(ROOT, portfolio.sm_path(big)), "WEBP", quality=82, method=6)
        return {"src": big, "w": large.size[0], "h": large.size[1]}


def save_video(data, slug, ext):
    if len(data) > MAX_VIDEO:
        raise RuntimeError(f"動画が大きすぎます（{len(data) // (1024 * 1024)}MB）。95MB 以下にするか、YouTube に上げて URL を入れてください")
    digest = hashlib.sha1(data).hexdigest()[:6]
    rel = f"{VIDEO_DIR}/{slug}-{digest}{ext}"
    os.makedirs(os.path.join(ROOT, VIDEO_DIR), exist_ok=True)
    with open(os.path.join(ROOT, rel), "wb") as f:
        f.write(data)
    return {"src": rel, "size": len(data)}


def remove_orphans(data):
    """作品の画像・動画の置き場から、どの作品も使っていないファイルを消す"""
    used = portfolio.referenced_images(data)
    removed = []
    for d in (WORKS_IMG, VIDEO_DIR):
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            continue
        for name in os.listdir(full):
            rel = f"{d}/{name}"
            if rel not in used and os.path.isfile(os.path.join(full, name)):
                os.remove(os.path.join(full, name))
                removed.append(rel)
    return removed


# ===== 保存 =====
def save_all(works):
    works = [portfolio.clean_work(w) for w in works]
    slugs = [w["slug"] for w in works]
    if any(not s for s in slugs):
        raise RuntimeError("ページの名前（英字）が空の作品があります")
    if len(set(slugs)) != len(slugs):
        raise RuntimeError("ページの名前（英字）が重なっている作品があります")
    old = portfolio.load()
    data = {"works": works}
    old_pages = {w["slug"] for w in old["works"] if portfolio.is_team_page(w)}
    new_pages = {w["slug"] for w in works if portfolio.is_team_page(w)}
    with open(portfolio.DATA_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(portfolio.dump(data))
    _, changed = portfolio.build(data)
    for slug in old_pages - new_pages:
        p = os.path.join(ROOT, "works", f"{slug}.html")
        if os.path.exists(p):
            os.remove(p)
            changed.append(f"works/{slug}.html（削除）")
    removed = remove_orphans(data)
    return {"changed": changed, "removed": removed}


# ===== git =====
def git(*args, timeout=120, stdout_only=False):
    r = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=timeout)
    if stdout_only and r.returncode == 0:
        return 0, r.stdout.rstrip()
    return r.returncode, (r.stdout + r.stderr).strip()


STATUS_LABEL = {"M": "変更", "A": "追加", "D": "削除", "R": "名前変更", "?": "新規", "U": "衝突"}


def git_status():
    code, out = git("-c", "core.quotepath=false", "status", "--porcelain=v1", "-b", "-uall", stdout_only=True)
    if code:
        raise RuntimeError(out)
    lines = out.splitlines()
    head = lines[0][3:] if lines and lines[0].startswith("## ") else ""
    branch = head.split("...")[0]
    ahead = int(m.group(1)) if (m := re.search(r"ahead ([0-9]+)", head)) else 0
    behind = int(m.group(1)) if (m := re.search(r"behind ([0-9]+)", head)) else 0
    files = []
    for ln in lines[1:]:
        code2 = ln[:2]
        path = ln[3:].strip().strip('"')
        key = "?" if code2 == "??" else (code2.strip() or "M")[0]
        files.append({"path": path, "label": STATUS_LABEL.get(key, "変更")})
    _, log = git("log", "-6", "--pretty=format:%h\t%ad\t%s", "--date=format:%m/%d %H:%M", stdout_only=True)
    commits = [dict(zip(("hash", "date", "subject"), ln.split("\t", 2))) for ln in log.splitlines() if ln]
    return {"branch": branch, "ahead": ahead, "behind": behind, "files": files, "commits": commits}


def suggest_message(files):
    data = portfolio.load()
    names = {w["slug"]: portfolio.title_of(w) for w in data["works"]}
    touched = []
    for f in files:
        m = re.match(r"works/([a-z0-9-]+)\.html", f["path"])
        if m and m.group(1) in names and names[m.group(1)] not in touched:
            touched.append(names[m.group(1)])
    if touched:
        head = "・".join(touched[:3]) + (" ほか" if len(touched) > 3 else "")
        return f"docs: {head} の作品ページを更新"
    return "docs: ポートフォリオを更新"


def git_commit(message):
    st = git_status()
    if not st["files"]:
        return "コミットするものがありません"
    if any(f["path"].startswith(("css/", "js/")) for f in st["files"]):
        subprocess.run([sys.executable, os.path.join(ROOT, "tools", "bump.py")], cwd=ROOT, check=True, capture_output=True)
        portfolio.build(portfolio.load())
    code, out = git("add", "-A")
    if code:
        raise RuntimeError(out)
    code, out = git("commit", "-m", message)
    if code:
        raise RuntimeError(out)
    return out


def pages_status():
    """GitHub Pages の最新の公開の状態（gh が使えるときだけ）"""
    if not shutil.which("gh"):
        return {"status": "unknown"}
    code, url = git("remote", "get-url", "origin")
    m = re.search(r"github\.com[:/]([^/]+/[^/]+?)(?:\.git)?/?$", url.strip())
    if code or not m:
        return {"status": "unknown"}
    r = subprocess.run(["gh", "api", f"repos/{m.group(1)}/pages/builds/latest", "--jq", ".status + \"\\t\" + .commit"],
                       capture_output=True, text=True, timeout=30)
    if r.returncode:
        return {"status": "unknown"}
    status, _, commit = r.stdout.strip().partition("\t")
    return {"status": status, "commit": commit[:7]}


# ===== HTTP =====
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, fmt, *args):
        if self.command != "GET":
            sys.stderr.write("%s %s\n" % (self.command, self.path))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, text):
        body = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def same_origin(self):
        origin = self.headers.get("Origin")
        host = self.headers.get("Host", "")
        return origin in (f"http://{host}",) and re.match(r"^(localhost|127\.0\.0\.1):[0-9]+$", host)

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n) if n else b""

    # プレビュー：保存前のデータで作ったページ
    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == "/" or url.path == "/tools/editor":
            self.send_response(302)
            self.send_header("Location", "/tools/editor/")
            self.end_headers()
            return
        if url.path == "/api/data":
            return self.send_json({"works": portfolio.load()["works"], "grades": portfolio.GRADES})
        if url.path == "/api/git/status":
            try:
                st = git_status()
                st["message"] = suggest_message(st["files"])
                return self.send_json(st)
            except Exception as e:  # noqa: BLE001
                return self.send_json({"error": str(e)}, 500)
        if url.path == "/api/git/pages":
            return self.send_json(pages_status())
        m = re.match(r"^/works/__preview-([a-z0-9-]+)\.html$", url.path)
        if m:
            works = drafts["works"] or portfolio.load()["works"]
            w = next((x for x in works if x.get("slug") == m.group(1)), None)
            if not w:
                return self.send_error(404)
            return self.send_html(portfolio.render_work(portfolio.clean_work(w), works, portfolio.version()))
        if url.path == "/__preview-index.html":
            works = drafts["works"] or portfolio.load()["works"]
            src = portfolio.read(os.path.join(ROOT, "index.html"))
            return self.send_html(portfolio.render_index(src, [portfolio.clean_work(w) for w in works]))
        return super().do_GET()

    def do_POST(self):
        if not self.same_origin():
            return self.send_json({"error": "このエディタの画面からだけ操作できます"}, 403)
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        try:
            if url.path == "/api/preview":
                drafts["works"] = json.loads(self.body())["works"]
                return self.send_json({"ok": True})
            if url.path == "/api/save":
                with lock:
                    res = save_all(json.loads(self.body())["works"])
                drafts["works"] = None
                return self.send_json({"ok": True, **res, "works": portfolio.load()["works"]})
            if url.path == "/api/upload":
                slug = re.sub(r"[^a-z0-9-]", "", (q.get("slug") or ["work"])[0]) or "work"
                slot = re.sub(r"[^a-z0-9-]", "", (q.get("slot") or ["image"])[0]) or "image"
                name = urllib.parse.unquote(self.headers.get("X-Filename", "file"))
                ext = os.path.splitext(name)[1].lower()
                data = self.body()
                with lock:
                    if ext in VIDEO_EXT:
                        return self.send_json({"ok": True, "video": save_video(data, slug, ext)})
                    if ext in IMAGE_EXT:
                        return self.send_json({"ok": True, "image": save_image(data, slug, slot)})
                return self.send_json({"error": f"{ext or 'この種類'} のファイルは使えません（画像：png / jpg / webp、動画：mp4 / webm）"}, 400)
            if url.path == "/api/git/commit":
                msg = (json.loads(self.body()).get("message") or "").strip()
                if not msg:
                    return self.send_json({"error": "コミットの説明を書いてください"}, 400)
                with lock:
                    out = git_commit(msg)
                return self.send_json({"ok": True, "output": out})
            if url.path == "/api/git/push":
                code, out = git("push", timeout=300)
                if code:
                    return self.send_json({"error": out}, 500)
                return self.send_json({"ok": True, "output": out})
            if url.path == "/api/git/pull":
                git("fetch", timeout=120)
                code, out = git("pull", "--ff-only", timeout=300)
                if code:
                    return self.send_json({"error": out}, 500)
                drafts["works"] = None
                return self.send_json({"ok": True, "output": out, "works": portfolio.load()["works"]})
            if url.path == "/api/git/fetch":
                code, out = git("fetch", timeout=120)
                if code:
                    return self.send_json({"error": out}, 500)
                return self.send_json({"ok": True})
        except Exception as e:  # noqa: BLE001
            return self.send_json({"error": str(e)}, 500)
        return self.send_json({"error": "not found"}, 404)


def main():
    nums = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(nums[0]) if nums else 8790
    for p in range(port, port + 20):
        try:
            server = http.server.ThreadingHTTPServer(("127.0.0.1", p), Handler)
            break
        except OSError:
            continue
    else:
        raise SystemExit("空いているポートが見つかりません")
    url = f"http://localhost:{p}/tools/editor/"
    print(f"ポートフォリオエディタ: {url}")
    print("止めるときはこの窓を閉じるか Ctrl+C")
    if "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
