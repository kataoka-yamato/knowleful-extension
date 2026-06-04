/**
 * 入力解析モジュール
 */
const Parser = (() => {
  /**
   * テキストを区切り文字で分割してヘッダー＋行データに変換する
   * @param {string} text
   * @param {string} delimiter - 'tab' | 'space' | 'comma' | 'slash'
   * @returns {{ headers: string[], rows: string[][] } | null}
   */
  function parse(text, delimiter) {
    const sep = { tab: '\t', space: ' ', comma: ',', slash: '/' }[delimiter] || '\t';
    const lines = text
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.length > 0);

    if (lines.length < 1) return null;

    const headers = lines[0].split(sep).map(h => h.trim());
    const rows = lines.slice(1).map(line =>
      line.split(sep).map(cell => cell.trim())
    );

    return { headers, rows };
  }

  /**
   * カスタムパターンでテキストを解析する
   *
   * pattern例: "[[物理名]]:\ntype: [[型]]\ndescription: [[論理名]]"
   * → [[fieldName]] がキャプチャ対象、それ以外はセパレータ（行ごとにtrimして照合）
   *
   * @param {string} text
   * @param {string} pattern
   * @returns {{ headers: string[], rows: string[][] } | null}
   */
  function parseCustom(text, pattern) {
    if (!text.trim() || !pattern.trim()) return null;

    const fieldNames = [];
    const separators = [];
    let lastIdx = 0;
    const fieldRe = /\[\[([^\]]+)\]\]/g;
    let m;
    while ((m = fieldRe.exec(pattern)) !== null) {
      separators.push(pattern.slice(lastIdx, m.index));
      fieldNames.push(m[1]);
      lastIdx = m.index + m[0].length;
    }
    separators.push(pattern.slice(lastIdx));

    if (fieldNames.length === 0) return null;

    function escapeRe(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // セパレータを柔軟な正規表現に変換
    // 各行をtrimして空行は無視、行間は \s* で結合
    function sepToRegex(sep) {
      const lines = sep.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return '\\s*';
      return '\\s*' + lines.map(escapeRe).join('\\s*') + '\\s*';
    }

    let regexStr = '';
    separators.forEach((sep, i) => {
      regexStr += sepToRegex(sep);
      if (i < fieldNames.length) regexStr += '([^\\n\\r]+)';
    });

    let regex;
    try { regex = new RegExp(regexStr, 'gs'); } catch (_) { return null; }

    const rows = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const row = fieldNames.map((_, i) => (match[i + 1] ?? '').trim());
      if (row.some(v => v)) rows.push(row);
    }

    return rows.length > 0 ? { headers: fieldNames, rows } : null;
  }

  return { parse, parseCustom };
})();
