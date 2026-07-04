# ファイル分割 変更方針

## 新規作成ファイル

### `src/utils.js`
- `escapeHtml` を `Utils` IIFEとして切り出し
- 他ファイルから `Utils.escapeHtml()` で呼ぶ

### `src/ui-template.js`
- `UITemplate` IIFEとして切り出し
- **移動する関数：** `loadTemplates`, `persistTemplates`, `saveAsTemplate`, `applyTemplate`, `deleteTemplate`, `renameTemplate`, `refreshTemplateSelect`, `renderTemplateEditArea`
- **移動する定数：** `TEMPLATE_KEY`
- **新規追加：** `initEvents()` — `init()` 内のテンプレート関連イベントハンドラをすべて移動
- **移動：** `renderExportChecklist`（現在 `init()` のローカル関数）
- **公開：** `{ initEvents, refreshTemplateSelect }`
- `UI.showStatus()`, `UI.debouncedSave()` 等を実行時参照で呼ぶ

### `src/ui-mask.js`
- `UIMask` IIFEとして切り出し
- **移動する関数：** `handleMask`, `handleUnmask`, `findChatInput`, `setInputValue`, `getLatestChatAnswer`, `markMaskingDone`, `clearMaskingPending`, `beforeUnloadHandler`
- **移動する状態：** `_maskedAndPending`
- **新規追加：** `initEvents()` — マスク/アンマスクボタンのイベント登録
- **公開：** `{ initEvents, markMaskingDone, clearMaskingPending }`

---

## 変更ファイル

### `src/ui.js`

| 変更内容 | 詳細 |
|---|---|
| 削除 | `escapeHtml` → `utils.js` へ |
| 削除 | テンプレート関連関数・`TEMPLATE_KEY` → `ui-template.js` へ |
| 削除 | マスク関連関数・`_maskedAndPending` → `ui-mask.js` へ |
| 置換 | `escapeHtml(x)` → `Utils.escapeHtml(x)` （全箇所） |
| 削除 | `saveCurrentToState()` の `if (!_modal) return` ガード（不要なため） |
| 変更 | `init()` 内のイベント登録を `UITemplate.initEvents()` / `UIMask.initEvents()` 呼び出しに集約 |
| 追加 | `return` に以下を公開（サブモジュールからの参照用）: `debouncedSave`, `saveCurrentToState`, `showStatus`, `addSingleRow`, `renderDataset`, `addTarget`, `collectTargets`, `createDataset`, `normalizeDataset`, `DEFAULT_GENERATE_LANGUAGE`, `DEFAULT_GENERATE_TARGET`, `get/set mainSingles`, `get/set datasets`, `get/set activeIdx` |
| 変更 | `markMaskingDone` / `clearMaskingPending` は `UIMask` への委譲に変更 |

### `manifest.json`

ロード順に3ファイルを追加：

```json
"src/utils.js",        // ← 追加（storage.js の直後）
"src/ui-template.js",  // ← 追加（ui.js の直前）
"src/ui-mask.js",      // ← 追加（ui-template.js の直後）
"src/ui.js",
```

---

## ロード順序と依存関係

```
storage.js → utils.js → ui-template.js → ui-mask.js → ui.js
                              ↑                ↑
                         UI.* を実行時参照    UI.* を実行時参照
```

`UITemplate` / `UIMask` → `UI` の参照はすべて**実行時**（イベント発火時）のため、定義順の循環はなし。
