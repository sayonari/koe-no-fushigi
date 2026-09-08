# こえのふしぎラボ

小学4年生向け出前授業（豊橋技術科学大学 情報・知能工学系 西村良太研究室，2027.1.17）で使う，
スマホでも動く音声デモ Web サイト．

公開URL: https://sayonari.github.io/koe-no-fushigi/

## 構成

```
web/
├── index.html      … ページ本体（4つのデモをタブで切替）
├── style.css        … デザイン
├── common.js         … 共通ユーティリティ（AudioContext/マイク共有・RMS・localStorage・音声再生）
├── app.js            … タブ切替・せんせいモード・全体初期化
├── demo1.js           … ①こえを みる（スペクトログラム）
├── demo2.js           … ②AIが きいて・やくして・はなす（音声認識＋翻訳＋読み上げ）
├── demo3.js           … ③あいづちくん と はなす（RMSによる発話区間検出＋相槌）
├── demo4.js           … ④へんじの はやさ じっけん（応答速度の比較投票）
├── img/
│   ├── hero.jpg       … ヒーロー写真
│   └── qr.png         … サイトQRコード
├── audio/             … 相槌・応答用 wav（下記一覧，無ければ speechSynthesis に自動フォールバック）
└── README.md
```

## audio/ に置く wav ファイル一覧（VOICEVOX等で生成）

デモ③「あいづちくん」用：

| ファイル名 | 読み上げ内容 |
|---|---|
| `un.wav` | うん |
| `hee.wav` | へえ |
| `hai.wav` | はい |
| `sounanda.wav` | そうなんだ |
| `fuun.wav` | ふーん |
| `naruhodo.wav` | なるほど |
| `unun.wav` | うんうん |

デモ④「へんじの はやさ じっけん」用：

| ファイル名 | 読み上げ内容 |
|---|---|
| `hee_sounanda.wav` | へえ！そうなんだ！ |

wav が存在しない場合は，各ファイルの `<audio>` 再生が `onerror` になった時点で
`window.speechSynthesis`（日本語）による読み上げに自動的に切り替わります．

## ローカルでの確認方法

```
cd web
python3 -m http.server 8000
```

ブラウザで http://localhost:8000/ を開く．
マイクを使うデモ（①③④）は `localhost` であれば HTTPS 化しなくても動作します
（ブラウザが localhost を secure context として扱うため）．

## GitHub Pages への公開手順

1. このリポジトリ（`koe-no-fushigi`）に `web/` の中身をルート，または `docs/` として配置する
2. GitHub リポジトリの Settings → Pages で公開元ブランチ・フォルダを指定する
3. しばらく待つと `https://sayonari.github.io/koe-no-fushigi/` で公開される
4. 本番ドメインは HTTPS のため，マイクを使うデモもそのまま動作する

## URL ハッシュで各デモに直接アクセス

- `#see` … ①こえを みる
- `#ai` … ②AIと はなす
- `#aizuchi` … ③あいづちくん
- `#speed` … ④へんじの はやさ

## せんせいモード（プロジェクタ表示用）

- URL に `?big=1` を付けるか，画面上部の「🖥 せんせいモード」トグルを ON にすると，
  文字とキャンバスが大きくなる（設定は localStorage に保存される）．

## 技術的なメモ

- 4つのデモは1つのページ内でタブ切替．マイクストリーム（`getUserMedia`）は
  `common.js` の `KoeLab.getMicStream()` でデモ間を共有し，使い回す．
  タブを離れたデモの解析処理（requestAnimationFrame ループや音声認識）は停止するが，
  マイクストリーム自体はページを離れる（`pagehide`）まで維持する．
- iOS Safari 対策として，AudioContext の生成・resume，speechSynthesis の呼び出しは
  すべてユーザーのタップ（ボタン押下）のハンドラ内で行っている．
- デモ②の翻訳は `translateText(text, tl)`（demo2.js）で
  (1) Chrome組み込み Translator API → (2) Google翻訳(非公式エンドポイント) →
  (3) MyMemory API の順にフォールバックし，各リクエストは6秒でタイムアウトする．
- マイクの音は端末内だけで処理し，サーバーには送信しない．
  翻訳時のみ，認識結果の「文字（テキスト）」を翻訳サービスへ送信する．

## 動作未確認の点

- 実機（iOS Safari / Android Chrome）でのマイク許可フロー，音声認識の挙動，
  VOICEVOX生成 wav の再生タイミングは，このリポジトリの自動チェックでは検証できていない．
  当日までに実機での通しリハーサルを推奨する．
