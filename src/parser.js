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

  /** パターン文字列の最大長 */
  const PATTERN_MAX_LEN = 500;

  /**
   * ReDoS を引き起こす可能性のある危険な量指定子パターンを検出する
   * 例: (a+)+, (a*)+, (a+)*, (a|aa)+ など
   * @param {string} pattern
   * @returns {boolean} 危険なパターンが含まれる場合 true
   */
  function hasDangerousQuantifier(pattern) {
    // ネストされた量指定子 (X+)+ / (X*)+ / (X+)* / (X*)* など
    if (/\([^)]*[+*][^)]*\)[+*?]/.test(pattern)) return true;
    // 交替を含む量指定子の繰り返し (a|aa)+ など
    if (/\([^)]*\|[^)]*\)[+*]/.test(pattern)) return true;
    return false;
  }

  /**
   * カスタムパターンの安全性を検証する
   * @param {string} pattern
   * @returns {{ ok: boolean, reason?: string }}
   */
  function validatePattern(pattern) {
    if (pattern.length > PATTERN_MAX_LEN) {
      return { ok: false, reason: `パターンが長すぎます（上限 ${PATTERN_MAX_LEN} 文字）` };
    }
    if (hasDangerousQuantifier(pattern)) {
      return { ok: false, reason: 'ネストされた繰り返し量指定子は使用できません' };
    }
    return { ok: true };
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

    // パターンの安全性チェック
    const validation = validatePattern(pattern);
    if (!validation.ok) {
      console.warn('[Parser] unsafe pattern rejected:', validation.reason);
      return null;
    }

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
      if (i < fieldNames.length) {
        const nextSep = separators[i + 1] ?? '';
        const nextTrimmed = nextSep.split('\n').map(l => l.trim()).filter(Boolean).join('');
        // 次セパレータがスペースのみ（単語区切り）→ 空白を含まない単語にマッチ
        if (/^\s+$/.test(nextSep) && nextTrimmed === '') {
          regexStr += '(\\S+)';
        } else {
          regexStr += '([^\\n\\r]+?)';
        }
      }
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
