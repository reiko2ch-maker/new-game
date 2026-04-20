# 深夜コンビニ 一人称縦画面試作 v10

## ファイル構成
- `index.html`
- `style.css`
- `game.js`
- `README.md`

## GitHub Pages 反映手順
1. 既存の `index.html` `style.css` `game.js` を削除または上書き
2. このフォルダ **rural_v10_rebuild の中身だけ** を公開ルート直下へ配置
3. GitHub Pages を更新後、以下のように `?v=10` を付けて開く
   - `https://<ユーザー名>.github.io/<repo名>/?v=10`
   - ユーザーページなら `https://<ユーザー名>.github.io/?v=10`

## 操作
- 左下スティック: 移動
- 画面右半分ドラッグ: 視点移動
- 右下 `走る`: ON/OFF
- 右下 `調べる`: 近くの対象を見ている時だけ有効
- 右上 `MENU`: scanline / quality / 感度 切替

## 進行
1. 店の入口に近づく
2. `調べる` で入口を開ける
3. 店内の冷蔵ケースを `調べる`
4. 飲み物を1本選ぶ
5. レジ周辺を `調べる`

## 注意
- 軽量重視の raycasting ベース表現です
- 実機 iPhone Safari での最終チューニングは端末差があります
- 重い場合は MENU から `QUALITY: LOW` に変更してください
