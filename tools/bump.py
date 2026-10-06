"""JS と CSS の読み込みに付けた版番号を新しくする。push の前に実行すると、見る人のブラウザが必ず新しいファイルを読む。

使い方: python tools/bump.py
"""
import glob
import os
import re
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = time.strftime("%Y%m%d%H%M")
PATTERN = re.compile(r"((?:style\.css|main\.js|ocean\.js))(\?v=[0-9]+)?(?=['\"])")

files = [os.path.join(ROOT, "index.html"), os.path.join(ROOT, "js", "main.js")]
files += glob.glob(os.path.join(ROOT, "works", "*.html"))
for path in files:
    with open(path, encoding="utf-8") as f:
        text = f.read()
    new = PATTERN.sub(lambda m: f"{m.group(1)}?v={VERSION}", text)
    if new != text:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)
print("v=" + VERSION)
