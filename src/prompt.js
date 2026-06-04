/**
 * プロンプトテンプレート生成モジュール
 */
const PromptBuilder = (() => {
  /**
   * @param {Object} params
   * @param {Array<{label, maskedValue}>} params.maskedMainSingles - 全データ共通の単一情報
   * @param {Array<{
   *   maskedSingles: Array<{label, maskedValue}>,
   *   maskedTable:   {key, maskedHeaders, maskedRows} | null
   * }>} params.maskedDatasets
   * @param {string}   params.language
   * @param {string[]} params.targets
   * @param {string}   params.example
   */
  function build({ maskedMainSingles, maskedDatasets, language, targets, example }) {
    const lines = [];

    lines.push(`以下の定義に基づき、${language} で ${targets.join('、')} を生成してください。`);
    lines.push('');

    // メイン単一情報
    const validMainSingles = maskedMainSingles.filter(s => s.label.trim());
    if (validMainSingles.length > 0) {
      lines.push('## 共通情報');
      lines.push('');
      validMainSingles.forEach(({ label, maskedValue }) => {
        lines.push(`#### ${label}`);
        lines.push(maskedValue ?? '');
        lines.push('');
      });
    }

    // データセットごと
    const validDatasets = maskedDatasets.filter(
      ds => ds.maskedSingles.length > 0 || ds.maskedTable
    );

    validDatasets.forEach((ds, di) => {
      lines.push(`### データ${di + 1}`);
      lines.push('');

      // サブ単一情報
      ds.maskedSingles.forEach(({ label, maskedValue }) => {
        if (!label.trim()) return;
        lines.push(`#### ${label}`);
        lines.push(maskedValue ?? '');
        lines.push('');
      });

      // テーブル
      if (ds.maskedTable) {
        const { key, maskedHeaders, maskedRows } = ds.maskedTable;
        lines.push(`#### ${key}`);
        lines.push(maskedHeaders.join('\t'));
        maskedRows.forEach(row => lines.push(row.join('\t')));
        lines.push('');
      }
    });

    // 出力規則
    lines.push('## 出力規則');
    lines.push('- プレースホルダー（[[S_01]], [[C1_01]] 等）はそのまま出力すること。');
    lines.push('- 変数名・フィールド名・クラス名には [[C1_01]][[LOWER_CAMEL]] のようにケース修飾子を付加すること。');
    lines.push('- 使用できるケース修飾子: [[UPPER_CAMEL]] / [[LOWER_CAMEL]] / [[UPPER_SNAKE]] / [[LOWER_SNAKE]]');
    lines.push('- 修飾子が不要な箇所（コメント・文字列リテラル等）はプレースホルダーのみ使用すること。');
    lines.push('- 前置きや説明は不要。コードのみを出力すること。');
    lines.push('- ソースコード内にデータ１やデータ２などの情報は不要です。');
    lines.push('');

    // 出力例
    if (example && example.trim()) {
      lines.push('## 出力例');
      lines.push(example.trim());
      lines.push('');
    }

    return lines.join('\n');
  }

  return { build };
})();
