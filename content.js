/**
 * content.js - chat.knowleful.jp へのツール注入エントリーポイント
 */
(function () {
  'use strict';

  // すでに初期化済みならスキップ
  if (document.getElementById('kw-launcher')) return;

  // ランチャーボタンを画面上部中央に追加
  const launcher = document.createElement('button');
  launcher.id = 'kw-launcher';
  launcher.textContent = '🛠 コード生成支援ツール';
  launcher.title = 'コード生成支援ツールを開く';
  document.body.appendChild(launcher);

  launcher.addEventListener('click', () => {
    UI.show();
  });

  // モーダルを初期化（非表示状態で生成）
  UI.init();
})();
