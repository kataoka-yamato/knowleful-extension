/**
 * 匿名化・復元モジュール
 */
const Masker = (() => {
  // マッピング辞書: { "[[S_01]]": "SCR001", "[[C1_01]]": "ユーザID", ... }
  let _map = {};
  let _singleIdx = 0;

  function reset() {
    _map = {};
    _singleIdx = 0;
  }

  /**
   * 任意キーで登録（複数情報列用）
   * @param {string} key  - プレースホルダー（例: "[[C1_01]]"）
   * @param {string} value - 元の値
   */
  function registerCustom(key, value) {
    _map[key] = value;
  }

  /**
   * 単一情報の値をマスクする
   * @param {string} value - 値（例: "SCR001"）
   * @returns {string} プレースホルダー
   */
  function maskSingle(label, value) {
    const key = `[[S_${String(++_singleIdx).padStart(2, '0')}]]`;
    _map[key] = value;
    return key;
  }

  /**
   * [[LOOP_START,開始番号,終了番号]] 〜 [[LOOP_END]] で囲まれたブロックを展開する。
   * ブロック内のプレースホルダーに含まれる "XX" を、開始〜終了番号（2桁ゼロ埋め）で
   * 置き換えたコピーを繰り返し生成し、連結する。
   * @param {string} text
   * @returns {string}
   */
  function expandLoops(text) {
    return text.replace(
      /\[\[LOOP_START\s*,\s*(\d+)\s*,\s*(\d+)\s*\]\]\r?\n?([\s\S]*?)\r?\n?\[\[LOOP_END\]\]/g,
      (_, startStr, endStr, body) => {
        const start = parseInt(startStr, 10);
        const end   = parseInt(endStr, 10);
        if (Number.isNaN(start) || Number.isNaN(end) || end < start) return '';

        // LOOP_START/LOOP_END の前後の改行は既に正規表現側で除去済みのため、
        // 繰り返し単位の間は改行1つのみで連結する（余分な空行を作らない）
        const parts = [];
        for (let i = start; i <= end; i++) {
          const idx = String(i).padStart(2, '0');
          parts.push(body.replace(/\[\[([^\]]+)\]\]/g, (m, inner) => `[[${inner.replace(/XX/g, idx)}]]`));
        }
        return parts.join('\n');
      }
    );
  }

  /**
   * AIの返答テキスト内のプレースホルダーを実データに復元する
   * [[C1_01,UC]] のようなカンマ区切り修飾子付きパターン、
   * [[LOOP_START,01,15]]〜[[LOOP_END]] のループ表記も処理する
   * @param {string} text
   * @returns {string}
   */
  function unmask(text) {
    text = expandLoops(text);
    // 修飾子あり: [[C1_01,UC]] など（キーと修飾子コードをカンマ区切りで1つのプレースホルダーに記述）
    text = text.replace(/\[\[([^,\]]+),([A-Za-z]+)\]\]/g, (match, key, modifier) => {
      const value = _map[`[[${key}]]`];
      if (value === undefined) return match;
      return Formatter.apply(value, modifier);
    });
    // 修飾子なし
    text = text.replace(/\[\[[^\]]+\]\]/g, match => {
      return _map[match] !== undefined ? _map[match] : match;
    });
    return text;
  }

  function getMap() {
    return { ..._map };
  }

  return { reset, registerCustom, maskSingle, unmask, getMap };
})();
