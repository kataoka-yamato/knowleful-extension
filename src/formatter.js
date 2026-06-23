/**
 * ケース変換モジュール
 * 文字列（スネークケース想定）を各ケースに変換する
 */
const Formatter = (() => {
  // "user_id" や "userId" や "UserId" をすべてワード配列に分解
  function toWords(str) {
    // スネークケース分割
    if (str.includes('_')) {
      return str.split('_').filter(Boolean);
    }
    // キャメル/パスカル分割
    return str
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')  // 例: "RESULTId" → "RESULT_Id"
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')        // 例: "userId"   → "user_Id"
      .toLowerCase()
      .split('_')
      .filter(Boolean);
  }

  function toUpperCamel(str) {
    return toWords(str)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join('');
  }

  function toLowerCamel(str) {
    const words = toWords(str);
    return words
      .map((w, i) =>
        i === 0
          ? w.toLowerCase()
          : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      )
      .join('');
  }

  function toUpperSnake(str) {
    return toWords(str).map(w => w.toUpperCase()).join('_');
  }

  function toLowerSnake(str) {
    return toWords(str).map(w => w.toLowerCase()).join('_');
  }

  /**
   * @param {string} value - 元の値（例: "user_id"）
   * @param {string|null} modifier - ケース修飾子（例: "UPPER_CAMEL"）
   * @returns {string}
   */
  function apply(value, modifier) {
    switch (modifier) {
      case 'UPPER_CAMEL': return toUpperCamel(value);
      case 'LOWER_CAMEL': return toLowerCamel(value);
      case 'UPPER_SNAKE': return toUpperSnake(value);
      case 'LOWER_SNAKE': return toLowerSnake(value);
      default:            return value;
    }
  }

  return { apply };
})();
