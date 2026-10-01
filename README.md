# 棚原 誇亜 | Portfolio

沖縄の海を自作ゲームエンジンで再現する、棚原 誇亜のポートフォリオサイトです。GitHub Pages で公開しています（https://tanahara0310.github.io/）。

背景の海は WebGL2 で描いています。クリック（タップ）すると波紋が広がり、スクロールするほど海が深くなります。

## 構成

```
index.html              トップ（表紙・自己紹介・就活作品の紹介・チーム作品の一覧）
works/koaengine.html    就活作品 koaEngine
works/*.html            チーム作品 1 本につき 1 ページ
css/style.css           見た目
js/main.js              クリックの波紋・水深計・拡大表示・動画・時刻スライダー
js/ocean.js             背景の海（波の高さ場の計算と描画のシェーダー）
assets/img/             画像（engine / works / profile / icons）
tools/serve.py          手元で確認するためのサーバー
tools/work-template.html  新しい作品のページの雛形
```

チーム作品のページ:

| ファイル | 作品 | 学年 | 中身 |
| --- | --- | --- | --- |
| `works/hansha.html` | 反射迎撃作戦 | 1年生 | 準備中 |
| `works/nigeru.html` | 逃げるかかち | 1年生 | 準備中 |
| `works/untitled-y1.html` | （作品名） | 1年生 | 準備中（作品名も） |
| `works/mawarazaru.html` | まわらザルをえない | 1年生 | あり |
| `works/kunaibu.html` | クナイブ | 1年生 | 準備中 |
| `works/chrono.html` | CHRONO_ | 1年生 | あり |
| `works/hatou.html` | 波闘 | 2年生 | 準備中 |
| `works/gungagan.html` | GUNGAGAN | 2年生 | 準備中 |
| `works/chainrope.html` | チェインロープ | 2年生 | あり |
| `works/biripiyo.html` | ゲキトツ！ビリぴよランブル | 2年生 | あり |
| `works/battarush.html` | バッタラッシュ | 2年生 | 準備中 |
| `works/reprism.html` | レプリズム | 2年生 | あり |

## 手元で確認する

```bash
python tools/serve.py
```

ブラウザで http://localhost:8000 を開きます（`index.html` を直接開くと JS モジュールが読み込めません）。このサーバーはキャッシュさせないので、保存して再読み込みすればすぐ反映されます。

`?still` を付ける（http://localhost:8000/?still）と波が止まるので、見た目を同じ条件で比べられます。

## 準備中のページを埋める

`works/` の該当ページを開き、`✎` で検索すると、書く場所の前に説明のコメントがあります。

- 文章: `<p class="todo">…準備中です。</p>` を書き換え、`class="todo"` を消す。強調は `<em class="hl">…</em>`
- 開発概要: `<i class="todo">準備中</i>` を `学内製エンジン` のような文字に置き換える
- ゲーム画面: `assets/img/works/作品名-game1.webp`（幅 1600）と `作品名-game1-sm.webp`（幅 800）を置き、`<div class="img-todo">…</div>` をコメントの例の `<img>` に置き換える
- 動画: `data-yt=""` に YouTube の動画 ID（`watch?v=` の後ろ）を入れるとボタンが出る
- 作品名を直したとき（`untitled-y1.html` など）は、ページ内の `（作品名）`、`index.html` の一覧の名前、前後の作品のページの「前の作品／次の作品」も直す

## 作品を足す

1. `tools/work-template.html` を `works/英字の名前.html` にコピーして `✎` の所を埋める
2. `index.html` の「チーム作品紹介」の一覧に `<li><a class="tile" href="works/英字の名前.html">…</a></li>` を足す
3. 前後の作品のページの「前の作品／次の作品」のリンクを、新しいページを指すように直す

push すると、1〜2 分で GitHub Pages に反映されます。
