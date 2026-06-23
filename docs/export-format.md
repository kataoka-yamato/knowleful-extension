# Knowleful Extension — テンプレートエクスポート JSON 仕様

## 概要
このChrome拡張機能（knowleful-extension）の「テンプレート」機能は、
ユーザーが保存したマスキング設定をJSON配列としてエクスポート／インポートできる。
仕様は src/ui.js のエクスポート処理（renderExportChecklist〜kw-export-btn）と
インポート処理（kw-import-btn のクリックハンドラ）で定義されている。

## トップレベル構造
エクスポートされるJSONは「テンプレートオブジェクトの配列」である。

```json
[
  {
    "id": "1719999999999",
    "name": "テンプレート名",
    "data": {
      "mainSingles": [ { "label": "string", "value": "string", "secret": true } ],
      "datasets": [
        {
          "tables": [
            {
              "key": "string",
              "text": "string",
              "delimiter": "tab",
              "customPattern": "string",
              "secretCols": [true, false],
              "parsedData": null
            }
          ],
          "singles": [ { "label": "string", "value": "string", "secret": true } ]
        }
      ],
      "activeIdx": 0,
      "language": "string",
      "targets": ["Entity", "Dao"],
      "example": "string"
    }
  }
]
```

## 各フィールドの意味

### テンプレートオブジェクト
| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | テンプレートの一意なID。デフォルトは `Date.now().toString()`（数字文字列）だが、インポート時は任意の文字列IDを許容する |
| `name` | string | テンプレートの表示名 |
| `data` | object | テンプレートが保持する全設定（下記） |

### `data` オブジェクト
| フィールド | 型 | 説明 |
|---|---|---|
| `mainSingles` | Array<Single> | 全ページ共通の単一情報（ラベル/値ペア） |
| `datasets` | Array<Dataset> | ページネーションで切り替え可能なデータセット一覧 |
| `activeIdx` | number | 現在アクティブなデータセットのインデックス |
| `language` | string | コード生成時の言語/フレームワーク（例: "Java/Spring Boot"） |
| `targets` | string[] | 生成対象タグの配列（例: `["Entity", "Dao", "Repository"]`） |
| `example` | string | 出力例として使うテキスト |

### `Single`（mainSingles / dataset.singles の要素）
| フィールド | 型 | 説明 |
|---|---|---|
| `label` | string | キー名 |
| `value` | string | 値 |
| `secret` | boolean | マスキング対象か（true で機密扱い） |

### `Dataset`
| フィールド | 型 | 説明 |
|---|---|---|
| `tables` | Array<Table> | データセット内のテーブル（複数保持可） |
| `singles` | Array<Single> | サブ単一情報 |

旧形式（`tables` を持たず、テーブル1件をデータセットに直接保持する形式）は
`normalizeDataset()` により自動的に新形式へ変換される（後方互換）。

### `Table`
| フィールド | 型 | 説明 |
|---|---|---|
| `key` | string | テーブル名 |
| `text` | string | 元の貼り付けテキスト（マスキング前） |
| `delimiter` | string | 区切り文字種別（例: `"tab"`, `"custom"` など） |
| `customPattern` | string | `delimiter` が `"custom"` の場合のカスタムパターン文字列 |
| `secretCols` | boolean[] | 各列が機密（マスキング対象）かどうかのフラグ配列 |
| `parsedData` | object \| null | 解析済みデータ（`text` と `delimiter`/`customPattern` から再生成可能） |

## インポート時の検証ルール（厳格）
インポートはJSON.parse後、配列でない場合・以下を満たさない要素は除外される：

1. JSON全体が **配列** であること（オブジェクト単体は不可）
2. `id`:
   - 型は string
   - 正規表現 `^[\w\-]{1,64}$`（英数字・アンダースコア・ハイフンのみ、1〜64文字）に一致
3. `name`:
   - 型は string
   - トリム後の長さが1文字以上
   - 長さ100文字（`TEMPLATE_NAME_MAX`）以下
4. `data`:
   - `null` でない
   - 型が `object`
   - 配列ではない（プレーンオブジェクトであること。内部フィールドの形式は検証されない）

検証を通過しなかった要素は黒く無視され、有効な要素が0件の場合は
「有効なテンプレートが見つかりませんでした。」というエラーになる。

## インポート時のマージ動作
- 既存テンプレートと **同じ `id`** のものは上書き（更新）される
- 新しい `id` のものは末尾に追加される
- 結果は「新規 N件、更新 M件」のステータスとして表示される

## 注意点（他AIが生成する際の留意事項）
- `id` は他の既存テンプレートと衝突させたくない場合、ユニークな文字列にすること（衝突すると上書きされる）
- `data` 配下のフィールド名・型は表に厳密に従うこと（検証されないため壊れていても import 自体は通るが、UIへの反映時に不整合が起きる）
- `secretCols` の要素数は対応する `text` をパースした際の列数と一致させるのが望ましい（UI側で添字アクセスされる）
- `parsedData` は省略して `null` にしても、アプリ側で `text`/`delimiter` から再パースされるため問題ない
