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
   * AIの返答テキスト内のプレースホルダーを実データに復元する
   * [[C1_01]][[UPPER_CAMEL]] のような修飾子付きパターンも処理する
   * @param {string} text
   * @returns {string}
   */
  function unmask(text) {
    // 修飾子あり: [[C1_01]][[UPPER_CAMEL]] など
    text = text.replace(
      /(\[\[[^\]]+\]\])(\[\[([A-Z_]+)\]\])/g,
      (_, placeholder, _modifierTag, modifier) => {
        const value = _map[placeholder];
        if (value === undefined) return _;
        return Formatter.apply(value, modifier);
      }
    );
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
