# 田舎町・商店前通り v8

GitHub Pages にそのまま置ける、縦画面スマホ向けの一人称マップ検証版です。

## 置き方
1. ZIP を解凍
2. `index.html` `style.css` `game.js` `README.md` をリポジトリ直下に置く
3. 既存の同名ファイルは上書き
4. Pages 側で `?v=8` を付けて開く

例: `https://reiko2ch-maker.github.io/?v=8`

## 操作
- 左下スティック: 移動
- 右半分ドラッグ: 視点移動
- 走る: ON/OFF 切り替え
- 調べる: 近くのスポット表示
- メニュー: scanline / quality / 感度 切り替え

## 仕様メモ
- 外部ライブラリなし
- Raycasting ベースの軽量 3D
- コンビニ外観 / 店内 / 路地 / 民家 / 公衆電話 / バス停 / 自販機 / 掲示板 / 祠方向 の見え方重視
