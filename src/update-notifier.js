/**
 * update-notifier.js — メジャーアップデート通知モジュール
 *
 * 起動時に GitHub Pages から version.json を fetch し、
 * 既読メジャーバージョンより新しければバナーを表示する。
 * セッション中は1回のみチェックする（メモリフラグで制御）。
 */
const UpdateNotifier = (() => {
  'use strict';

  const VERSION_URL     = 'https://kataoka-yamato.github.io/knowleful-extension/docs/version.json';
  const STORAGE_KEY     = 'kw_last_seen_major';
  const BANNER_ID       = 'kw-update-banner';
  const RELEASE_URL     = 'https://github.com/kataoka-yamato/knowleful-extension/releases';
  const FETCH_TIMEOUT_MS = 5000;

  // セッション中フラグ（ページ遷移後の重複チェック防止）
  let _checked = false;

  /**
   * 既読メジャーバージョンを localStorage から取得する
   * @returns {number} 既読バージョン（未記録なら 0）
   */
  function getLastSeenMajor() {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * 既読メジャーバージョンを localStorage に保存する
   * @param {number} major
   */
  function saveLastSeenMajor(major) {
    localStorage.setItem(STORAGE_KEY, String(major));
  }

  /**
   * タイムアウト付き fetch
   * @param {string} url
   * @param {number} ms
   * @returns {Promise<Response>}
   */
  function fetchWithTimeout(url, ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return fetch(url, { signal: controller.signal })
      .finally(() => clearTimeout(timer));
  }

  /**
   * アップデートバナーを DOM に追加する
   * @param {number} major  新しいメジャーバージョン番号
   * @param {string} message リリースメッセージ
   */
  function showBanner(major, message) {
    // 重複表示防止
    if (document.getElementById(BANNER_ID)) return;

    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.innerHTML = `
      <span class="kw-update-icon">🎉</span>
      <span class="kw-update-message">
        <strong>knowleful v${major}.0 にアップデートされました</strong>
        &nbsp;—&nbsp;${escapeHtml(message)}
      </span>
      <a class="kw-update-link" href="${RELEASE_URL}" target="_blank" rel="noopener noreferrer">
        リリースノートを見る
      </a>
      <button class="kw-update-close" aria-label="閉じる">✕</button>
    `;

    banner.querySelector('.kw-update-close').addEventListener('click', () => {
      banner.remove();
      saveLastSeenMajor(major);
    });

    document.body.appendChild(banner);
  }

  /**
   * HTMLエスケープ（XSS防止）
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * バージョンチェックを実行する（起動時に1回のみ）
   */
  async function check() {
    if (_checked) return;
    _checked = true;

    try {
      const res = await fetchWithTimeout(VERSION_URL, FETCH_TIMEOUT_MS);
      if (!res.ok) return;

      const data = await res.json();
      const remoteMajor = parseInt(data.major, 10);
      const message     = typeof data.message === 'string' ? data.message : '';

      if (!Number.isFinite(remoteMajor) || remoteMajor <= 0) return;

      const lastSeen = getLastSeenMajor();
      if (remoteMajor > lastSeen) {
        showBanner(remoteMajor, message);
      }
    } catch (e) {
      // ネットワークエラー・タイムアウト・パース失敗は静かに無視
      console.warn('[UpdateNotifier] version check failed:', e?.message ?? e);
    }
  }

  return { check };
})();
