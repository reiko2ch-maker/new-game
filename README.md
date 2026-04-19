# 夏の売店 / 縦画面スマホ向け操作テスト

GitHub Pagesへそのまま置ける、スマホ縦画面向けの一人称ホラープロトタイプです。

## できること
- 左下バーチャルスティック移動
- 右側ドラッグ視点移動
- 走る / 調べる
- 売店の外観と内装を探索
- 冷蔵庫 / 棚 / レジ / CRT の簡単なインタラクト
- VHSっぽい走査線のON/OFF

## 配置ファイル
- `index.html`
- `style.css`
- `app.js`

## GitHub Pages公開手順
1. 新しいGitHubリポジトリを作る
2. この3ファイルをアップロードする
3. Settings → Pages → Branch を `main` / `/root` にする
4. 数分待つ
5. 発行されたURLをスマホで開く

## 調整しやすい場所
### 操作感
`app.js`
- `state.moveSpeed`
- `state.runMultiplier`
- `sensitivityX`
- `sensitivityY`

### 視点
`app.js`
- `PerspectiveCamera(72, ...)`
- `state.pitch`
- `state.player`

### 雰囲気
`app.js`
- `scene.fog`
- 各種ライト強度
- `createCRTText()`

### UI
`style.css`
- `.joystick-base`
- `.action-btn`
- `#interactionHint`

## 次に広げるなら
- 商品を1本手に取る処理
- 店員NPC配置
- 音（虫・冷蔵庫・自動ドア）
- 異変差し替えシステム
- タイトル画面 / リザルト画面
