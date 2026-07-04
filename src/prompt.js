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
   * @param {boolean}  [params.loopEnabled=true] - 連続データのループ表記規則を含めるか
   */
  function build({ maskedMainSingles, maskedDatasets, language, targets, example, loopEnabled = true }) {
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
    lines.push('以下は全て厳守すること。1つでも違反した場合は出力をやり直すこと。');
    lines.push('1. プレースホルダーは絶対に展開・推測・変換しない');
    lines.push('2. 識別子として使う箇所には必ずケース修飾子コードを付ける');
    if (loopEnabled) {
      lines.push('3. **同じ構造のコードが3回以上連続する場合、行ごとに書かず必ずループ表記にする（詳細は後述）**');
    }
    lines.push(`${loopEnabled ? 4 : 3}. 出力はコードのみとし、前置き・説明・後置きを含めない`);
    lines.push('');

    let sectionNo = 1;

    lines.push(`### ${sectionNo++}. プレースホルダー規則`);
    lines.push('- `[[S_01]]`、`[[C1_01]]` のようなプレースホルダーは絶対に展開・推測・変換しないこと。');
    lines.push('- クラス名・変数名・フィールド名など識別子として使う箇所には、必ずプレースホルダー内にケース修飾子コードをカンマ区切りで付加すること。');
    lines.push('  - 例: `[[C1_01,LC]]`、`[[C5_01,UC]]`');
    lines.push('- 使用できるケース修飾子コード: `UC`(UpperCamel) / `LC`(lowerCamel) / `US`(UPPER_SNAKE) / `LS`(lower_snake)');
    lines.push('- コメント・文字列リテラルなど、識別子でない箇所には修飾子コードを付けないこと（`[[C1_01]]` のまま使用）。');
    lines.push('');
    lines.push(`### ${sectionNo++}. ケース修飾子の付与ルール`);
    lines.push('プレースホルダーを識別子として使用する際は、');
    lines.push('以下のルールに従い必ず修飾子コードをカンマ区切りで付加すること。');
    lines.push('| 使用箇所 | 修飾子 | 例 |');
    lines.push('|---------|--------|----|');
    lines.push('| クラス名（Entity名など） | UC | [[C3_01,UC]]Entity |');
    lines.push('| フィールド変数名 | LC | [[C1_01,LC]] |');
    lines.push('| @Columnのname属性（物理名） | US | [[C3_01,US]] |');
    lines.push('| メソッド引数名 | LC | [[C1_01,LC]] |');
    lines.push('| getter呼び出し（先頭大文字） | UC | get[[C1_01,UC]]() |');
    lines.push('');

    if (loopEnabled) {
      lines.push(`### ${sectionNo++}. 【必須】同一構造が3回以上連続する場合はループ表記にすること`);
      lines.push('テーブルの各行に対して同じコード構造を繰り返し生成する場合、行ごとに書き並べることを禁止する。');
      lines.push('コードを1行でも書き始める前に、必ず次の手順で判定すること。');
      lines.push('');
      lines.push('手順:');
      lines.push('1. これから出力するコードブロックが、同じ構造で3回以上連続するかを確認する。');
      lines.push('2. 繰り返しごとに変化する箇所が、プレースホルダー末尾の行番号（例: `C3_01`の`01`）だけであるかを確認する。');
      lines.push('3. 上記2つに該当する場合、行ごとに書くのをやめ、次の形式で1回だけ出力する。');
      lines.push('   - プレースホルダー末尾の行番号を `XX` に置き換える。');
      lines.push('   - 出力全体を `[[LOOP_START,<開始番号>,<終了番号>]]` と `[[LOOP_END]]` の2行で囲む。');
      lines.push('   - 開始・終了番号は元データの2桁ゼロ埋め表記（例: `01`, `15`）に合わせる。');
      lines.push('   - ケース修飾子コードはループ内でもそのまま使用できる（例: `[[C3_XX,US]]`）。');
      lines.push('4. 一部の行だけ条件分岐等で構造が異なる場合は、その行のみループの外に個別で出力する。');
      lines.push('');
      lines.push('❌ 禁止：次のように同じ構造の行を1行ずつ繰り返し書くこと');
      lines.push('```');
      lines.push('<1行目: [[C1_01,LC]] を含む1行分のコード>');
      lines.push('<2行目: [[C1_02,LC]] を含む1行分のコード>');
      lines.push('<3行目: [[C1_03,LC]] を含む1行分のコード>');
      lines.push('（データ件数分、同じ形をこのまま繰り返す ← このような繰り返し出力は禁止）');
      lines.push('```');
      lines.push('');
      lines.push('⭕ 必須：上記と同じ内容は、次のようにループ表記1回だけで出力すること');
      lines.push('```');
      lines.push('[[LOOP_START,01,05]]');
      lines.push('<行の内容: [[C1_XX,LC]] を含む1行分のコード>');
      lines.push('[[LOOP_END]]');
      lines.push('```');
      lines.push('');
      lines.push('注意: 上記はプレースホルダー末尾の行番号を `XX` にする書き方を説明するための');
      lines.push('模式例であり、コードのスタイル・構造を指定するものではない。ループ内に実際に書く');
      lines.push('コードの内容・書式（コメントの有無、アノテーション、宣言の形など）は、この模式例を');
      lines.push('真似るのではなく、必ず生成対象や「## 出力例」で指定されたスタイル・構造に従うこと。');
      lines.push('');
    }

    lines.push(`### ${sectionNo++}. 出力形式規則`);
    lines.push('- 出力はコードのみとすること。前置き・説明・補足・後置きは一切出力しないこと。');
    lines.push('- ソースコード内に「データ1」「データ2」等の文言を含めないこと。');
    if (loopEnabled) {
      lines.push('- 出力前に、同じ構造の行を3回以上1行ずつ書いていないか必ず見直すこと。該当する場合は上記のループ表記に書き直すこと。');
    }
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
