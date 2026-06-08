/**
 * 暗号化ストレージモジュール
 *
 * Web Crypto API（AES-GCM 256bit）を使用して localStorage の値を暗号化します。
 *
 * キー導出方式:
 *   - 初回起動時にランダム 16byte ソルトを生成し localStorage に保存
 *   - PBKDF2（SHA-256, 200,000回）でソルトからマスターキーを導出
 *   - 導出済み CryptoKey はセッション中のみメモリに保持（ページリロードで再導出）
 *
 * 保存フォーマット（Base64）: [12byte IV][暗号文]
 */
const Storage = (() => {
  const SALT_KEY    = 'kw_crypto_salt_v2';
  const ITERATIONS  = 200_000;

  let _cryptoKey = null;

  /**
   * ランダムソルトを取得（なければ生成して保存）
   * @returns {Uint8Array} 16byte ソルト
   */
  function getOrCreateSalt() {
    const stored = localStorage.getItem(SALT_KEY);
    if (stored) {
      return Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    localStorage.setItem(SALT_KEY, btoa(String.fromCharCode(...salt)));
    return salt;
  }

  /**
   * CryptoKey を初期化（セッション中は再利用）
   * @returns {Promise<CryptoKey>}
   */
  async function getKey() {
    if (_cryptoKey) return _cryptoKey;

    const salt    = getOrCreateSalt();
    const enc     = new TextEncoder();

    // ブラウザ拡張機能のオリジンをパスワード素材として使用
    // （完全な秘密ではないが、ソルトと PBKDF2 で十分な導出コストを確保）
    const password = enc.encode(chrome?.runtime?.id ?? 'knowleful-extension');

    const baseKey = await crypto.subtle.importKey(
      'raw', password, { name: 'PBKDF2' }, false, ['deriveKey']
    );

    _cryptoKey = await crypto.subtle.deriveKey(
      {
        name:       'PBKDF2',
        hash:       'SHA-256',
        salt,
        iterations: ITERATIONS,
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return _cryptoKey;
  }

  /**
   * 文字列を暗号化して Base64 文字列で返す
   * @param {string} plaintext
   * @returns {Promise<string>} Base64エンコードされた [IV + 暗号文]
   */
  async function encrypt(plaintext) {
    const key = await getKey();
    const iv  = crypto.getRandomValues(new Uint8Array(12)); // 96bit IV（GCM標準）
    const enc = new TextEncoder();

    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      enc.encode(plaintext)
    );

    // IV（12byte）+ 暗号文を結合して Base64 化
    const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

    return btoa(String.fromCharCode(...combined));
  }

  /**
   * Base64 文字列を復号して元の文字列を返す
   * @param {string} base64
   * @returns {Promise<string>}
   * @throws 復号に失敗した場合（改ざん・ソルト変更等）
   */
  async function decrypt(base64) {
    const key      = await getKey();
    const combined = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const iv        = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plainBuffer);
  }

  /**
   * JSON オブジェクトを暗号化して localStorage に保存する
   * @param {string} key
   * @param {*} value
   */
  async function setItem(key, value) {
    try {
      const json      = JSON.stringify(value);
      const encrypted = await encrypt(json);
      localStorage.setItem(key, encrypted);
    } catch (e) {
      console.error('[Storage] setItem failed:', e);
    }
  }

  /**
   * localStorage から暗号文を読み出して復号し JSON パースして返す
   * @param {string} key
   * @param {*} fallback - データがない・復号失敗時の戻り値
   * @returns {Promise<*>}
   */
  async function getItem(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;

      let json;
      try {
        json = await decrypt(raw);
      } catch (decryptErr) {
        // 復号失敗（ソルト変更・データ破損・旧形式）→ データを破棄してフォールバック返却
        console.warn('[Storage] decryption failed, discarding data:', decryptErr);
        localStorage.removeItem(key);
        return fallback;
      }

      return JSON.parse(json);
    } catch (e) {
      console.error('[Storage] getItem failed:', e);
      return fallback;
    }
  }

  return { setItem, getItem };
})();
