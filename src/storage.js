/**
 * 暗号化ストレージモジュール
 *
 * Web Crypto API（AES-GCM 256bit）を使用して localStorage の値を暗号化します。
 * 固定キー方式：拡張機能固有のキー素材から CryptoKey を導出します。
 *
 * 保存フォーマット（Base64）: [12byte IV][暗号文]
 */
const Storage = (() => {
  // 拡張機能固有のキー素材（変更するとすべての保存データが読めなくなります）
  const KEY_MATERIAL = 'knowleful-extension-v1-secret-key-material';

  let _cryptoKey = null;

  /**
   * CryptoKey を初期化（初回のみ導出）
   * @returns {Promise<CryptoKey>}
   */
  async function getKey() {
    if (_cryptoKey) return _cryptoKey;

    const enc = new TextEncoder();
    const raw = enc.encode(KEY_MATERIAL);

    // PBKDF2 ではなく importKey で直接 HKDF 用素材として読み込む
    const baseKey = await crypto.subtle.importKey(
      'raw', raw, { name: 'HKDF' }, false, ['deriveKey']
    );

    _cryptoKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: enc.encode('knowleful-salt'),
        info: enc.encode('knowleful-aes-gcm'),
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
   */
  async function decrypt(base64) {
    const key  = await getKey();
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
      const json       = JSON.stringify(value);
      const encrypted  = await encrypt(json);
      localStorage.setItem(key, encrypted);
    } catch (e) {
      console.error('[Storage] setItem failed:', e);
    }
  }

  /**
   * localStorage から暗号文を読み出して復号し JSON パースして返す
   * 旧データ（平文JSON）も透過的に読み込めるようフォールバック付き
   * @param {string} key
   * @param {*} fallback - データがない・復号失敗時の戻り値
   * @returns {Promise<*>}
   */
  async function getItem(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;

      // 旧データ（平文JSON）の後方互換フォールバック
      // Base64 でなければそのまま JSON.parse を試みる
      let json;
      try {
        json = await decrypt(raw);
      } catch (_) {
        // 復号失敗 → 平文JSONとして読み直す（移行期の互換処理）
        json = raw;
      }

      return JSON.parse(json);
    } catch (e) {
      console.error('[Storage] getItem failed:', e);
      return fallback;
    }
  }

  return { setItem, getItem };
})();
