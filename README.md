# 棚原 誇亜 | Portfolio

沖縄の海を自作ゲームエンジンで再現する、棚原 誇亜のポートフォリオサイトです。GitHub Pages で公開します。

背景の海は WebGL2 で描いています。クリック（タップ）すると波紋が広がり、スクロールするほど海が深くなります。

## 構成

```
index.html          ページの中身（文章・画像・動画の ID）
css/style.css       見た目
js/main.js          クリックの波紋・水深計・拡大表示・動画・時刻スライダー
js/ocean.js         背景の海（波の高さ場の計算と描画のシェーダー）
assets/img/         画像（engine / works / profile / icons）
assets/favicon.svg  タブのアイコン
```

## 手元で確認する

```bash
python -m http.server 8000
```

ブラウザで http://localhost:8000 を開きます（`index.html` を直接開くと JS モジュールが読み込めません）。

## 更新のしかた

- 文章を直す: `index.html` の該当箇所を書き換える
- 画像を差し替える: `assets/img/` の同じ名前のファイルを置き換える（`-sm.webp` は幅 800px の縮小版）
- 動画を差し替える: `data-yt="..."` の YouTube 動画 ID を書き換える
- 変更を push すると、1〜2 分で GitHub Pages に反映されます
