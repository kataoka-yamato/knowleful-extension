/**
 * プロンプトテンプレート生成モジュール
 */
const PromptBuilder = (() => {
  /**
   * @param {Object} params
   * @param {Array<{label, maskedValue}>} params.maskedMainSingles - 全データ共通の単一情報
   * @param {Array<{
   *   maskedSingles: Array<{label, maskedValue}>,
   *   maskedTables:  Array<{key, maskedHeaders, maskedRows}>
   * }>} params.maskedDatasets
   * @param {string}   params.language
   * @param {string[]} params.targets
   * @param {string}   params.example
   */
  function build({ maskedMainSingles, maskedDatasets, language, targets, example }) {
    language = language ? language.trim() : '';
    example = example ? example.trim() : '';
    const lines = [];

    // ロールとタスクの明示
    lines.push(`あなたは ${ language ? language : 'プロ'} のコード生成アシスタントです。`);
    lines.push(`以下の定義に基づき、${ example ? '出力例に従って' : ''} ${(targets.length > 0) ? targets.join('、') : 'コード断片'} を生成してください。`);
    lines.push('');

    // 共通情報
    const validMainSingles = maskedMainSingles.filter(s => s.label.trim());
    if (validMainSingles.length > 0) {
      lines.push('## 共通情報');
      lines.push('');
      validMainSingles.forEach(({ label, maskedValue }) => {
        lines.push(`### ${label}`);
        lines.push(maskedValue ?? '');
        lines.push('');
      });
    }

    // 入力データ
    const validDatasets = maskedDatasets.filter(
      ds => ds.maskedSingles.length > 0 || ds.maskedTables.length > 0
    );

    if (validDatasets.length > 0) {
      lines.push('## 入力データ');
      lines.push('');

      validDatasets.forEach((ds, di) => {
        lines.push(`### データ${di + 1}`);
        lines.push('');

        ds.maskedSingles.forEach(({ label, maskedValue }) => {
          if (!label.trim()) return;
          lines.push(`#### ${label}`);
          lines.push(maskedValue ?? '');
          lines.push('');
        });

        ds.maskedTables.forEach(({ key, maskedHeaders, maskedRows }) => {
          lines.push(`#### ${key}`);
          lines.push(maskedHeaders.join('\t'));
          maskedRows.forEach(row => lines.push(row.join('\t')));
          lines.push('');
        });
      });
    }

    // 出力規則
    lines.push('## 出力規則');
    lines.push('');
    lines.push('### プレースホルダー規則');
    lines.push('- `[[S_01]]`、`[[C1_01]]` のようなプレースホルダーは絶対に展開・推測・変換しないこと。');
    lines.push('- クラス名・変数名・フィールド名など識別子として使う箇所には、必ずケース修飾子を付加すること。');
    lines.push('  - 例: `[[C1_01]][[LOWER_CAMEL]]`、`[[C5_01]][[UPPER_CAMEL]]`');
    lines.push('- 使用できるケース修飾子: `[[UPPER_CAMEL]]` / `[[LOWER_CAMEL]]` / `[[UPPER_SNAKE]]` / `[[LOWER_SNAKE]]`');
    lines.push('- コメント・文字列リテラルなど、識別子でない箇所にはケース修飾子を付けないこと。');
    lines.push('');
    lines.push('### ケース修飾子の付与ルール');
    lines.push('プレースホルダーを識別子として使用する際は、');
    lines.push('以下のルールに従い必ずケース修飾子を付加すること。');
    lines.push('| 使用箇所 | 修飾子 | 例 |');
    lines.push('|---------|--------|----|');
    lines.push('| クラス名（Entity名など） | [[UPPER_CAMEL]] | [[C3_01]][[UPPER_CAMEL]]Entity |');
    lines.push('| フィールド変数名 | [[LOWER_CAMEL]] | [[C1_01]][[LOWER_CAMEL]] |');
    lines.push('| @Columnのname属性（物理名） | [[UPPER_SNAKE]] | [[C3_01]][[UPPER_SNAKE]] |');
    lines.push('| メソッド引数名 | [[LOWER_CAMEL]] | [[C1_01]][[LOWER_CAMEL]] |');
    lines.push('| getter呼び出し（先頭大文字） | [[UPPER_CAMEL]] | get[[C1_01]][[UPPER_CAMEL]]() |');
    lines.push('');
    lines.push('### 出力形式規則');
    lines.push('- 出力はコードのみとすること。前置き・説明・補足・後置きは一切出力しないこと。');
    lines.push('- ソースコード内に「データ1」「データ2」等の文言を含めないこと。');
    lines.push('- 改行コードには、CR+LFを用いること。');
    lines.push('');

    // 出力例
    if (example) {
      lines.push('## 出力例');
      lines.push(example);
      lines.push('');
    }

    return lines.join('\n');
  }

  return { build };
})();
