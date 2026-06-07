/**
 * モーダルUI制御モジュール
 *
 * データ構造:
 *   _mainSingles: Array<{label, value, secret}>   // 全ページ共通
 *   _datasets: Array<{                            // ページネーションで切替
 *     key:        string,                         // テーブル名
 *     text:       string,
 *     delimiter:  string,
 *     secretCols: boolean[],
 *     parsedData: object|null,
 *     singles:    Array<{label, value, secret}>   // サブ単一情報
 *   }>
 *   _activeIdx: number
 */
const UI = (() => {
  let _modal = null;
  let _mainSingles = [];
  let _datasets = [];
  let _activeIdx = 0;
  let _saveTimer = null;

  const CIRCLE_NUMS = [
    '①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩',
    '⑪','⑫','⑬','⑭','⑮','⑯','⑰','⑱','⑲','⑳',
  ];
  const STORAGE_KEY   = 'kw_tool_state_v3';
  const TEMPLATE_KEY  = 'kw_templates';

  // ----------------------------------------------------------------
  // データセット管理
  // ----------------------------------------------------------------
  function createDataset() {
    return { key: '', text: '', delimiter: 'tab', customPattern: '', secretCols: [], parsedData: null, singles: [] };
  }

  /** 現在のDOM状態を _datasets[_activeIdx] とメイン単一情報に保存 */
  function saveCurrentToState() {
    if (!_modal) return;

    // メイン単一情報
    _mainSingles = collectSinglesFrom('kw-main-singles-container');

    // 現在のデータセット
    const ds = _datasets[_activeIdx];
    if (!ds) return;
    ds.key       = document.getElementById('kw-multi-key')?.value ?? '';
    ds.text      = document.getElementById('kw-multi-input')?.value ?? '';
    ds.delimiter      = document.querySelector('input[name="kw-delim"]:checked')?.value || 'tab';
    ds.customPattern  = document.getElementById('kw-custom-pattern')?.value ?? '';
    ds.secretCols = Array.from(document.querySelectorAll('.kw-col-secret')).map(s => s.value === 'secret');
    ds.singles   = collectSinglesFrom('kw-sub-singles-container');
    if (ds.text.trim()) {
      ds.parsedData = ds.delimiter === 'custom'
        ? Parser.parseCustom(ds.text, ds.customPattern)
        : Parser.parse(ds.text, ds.delimiter);
    } else {
      ds.parsedData = null;
    }
  }

  function collectSinglesFrom(containerId) {
    return Array.from(document.querySelectorAll(`#${containerId} .kw-single-row`)).map(row => ({
      label:  row.querySelector('.kw-single-label').value,
      value:  row.querySelector('.kw-single-value').value,
      secret: row.querySelector('.kw-single-secret').value === 'secret',
    }));
  }

  /** _datasets[_activeIdx] の内容でDOMを再描画 */
  function renderDataset() {
    const ds = _datasets[_activeIdx];

    // テーブルキー
    const keyEl = document.getElementById('kw-multi-key');
    if (keyEl) keyEl.value = ds.key;

    // 区切り文字
    const delimEl = document.querySelector(`input[name="kw-delim"][value="${ds.delimiter}"]`);
    if (delimEl) delimEl.checked = true;
    const customPatternEl = document.getElementById('kw-custom-pattern');
    const customWrapEl = document.getElementById('kw-custom-pattern-wrap');
    if (customPatternEl) customPatternEl.value = ds.customPattern ?? '';
    if (customWrapEl) customWrapEl.style.display = ds.delimiter === 'custom' ? 'block' : 'none';

    // テキストエリア
    const textEl = document.getElementById('kw-multi-input');
    if (textEl) textEl.value = ds.text;

    // テーブルプレビュー
    if (ds.parsedData && ds.parsedData.headers.length > 0) {
      const sc = ds.secretCols.length === ds.parsedData.headers.length
        ? ds.secretCols
        : ds.parsedData.headers.map(() => true);
      renderTable(ds.parsedData.headers, ds.parsedData.rows, sc);
    } else {
      const container = document.getElementById('kw-table-container');
      if (container) container.innerHTML = '';
    }

    // サブ単一情報
    const subContainer = document.getElementById('kw-sub-singles-container');
    if (subContainer) {
      subContainer.innerHTML = '';
      const subs = ds.singles.length > 0 ? ds.singles : [{ label: '', value: '', secret: true }];
      subs.forEach(({ label, value, secret }) => addSingleRow('kw-sub-singles-container', label, value, secret));
    }

    renderPagination();
  }

  function switchDataset(idx) {
    saveCurrentToState();
    _activeIdx = idx;
    renderDataset();
    debouncedSave();
  }

  function addDataset() {
    saveCurrentToState();
    const prev = _datasets[_activeIdx];
    const inherited = {
      ...createDataset(),
      key:           prev?.key ?? '',
      delimiter:     prev?.delimiter ?? 'tab',
      customPattern: prev?.customPattern ?? '',
      singles:       (prev?.singles ?? []).map(({ label, secret }) => ({ label, value: '', secret })),
    };
    _datasets.push(inherited);
    _activeIdx = _datasets.length - 1;
    renderDataset();
    debouncedSave();
  }

  function removeCurrentDataset() {
    if (_datasets.length <= 1) { showStatus('最低1つのデータが必要です。', 'warn'); return; }
    _datasets.splice(_activeIdx, 1);
    _activeIdx = Math.min(_activeIdx, _datasets.length - 1);
    renderDataset();
    debouncedSave();
  }

  // ----------------------------------------------------------------
  // ページネーション
  // ----------------------------------------------------------------
  function renderPagination() {
    const container = document.getElementById('kw-pagination');
    if (!container) return;
    container.innerHTML = '';

    _datasets.forEach((_, i) => {
      const btn = document.createElement('button');
      btn.className = 'kw-page-btn' + (i === _activeIdx ? ' kw-page-active' : '');
      btn.textContent = CIRCLE_NUMS[i] || String(i + 1);
      btn.title = `データ ${i + 1}`;
      btn.addEventListener('click', () => switchDataset(i));
      container.appendChild(btn);
    });

    const addBtn = document.createElement('button');
    addBtn.className = 'kw-page-add-btn';
    addBtn.textContent = '＋';
    addBtn.title = 'データを追加';
    addBtn.addEventListener('click', addDataset);
    container.appendChild(addBtn);

    if (_datasets.length > 1) {
      const rmBtn = document.createElement('button');
      rmBtn.className = 'kw-page-remove-btn';
      rmBtn.textContent = '−';
      rmBtn.title = '現在のデータを削除';
      rmBtn.addEventListener('click', removeCurrentDataset);
      container.appendChild(rmBtn);
    }
  }

  // ----------------------------------------------------------------
  // 単一情報行
  // ----------------------------------------------------------------
  function addSingleRow(containerId, label = '', value = '', isSecret = true) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'kw-single-row' + (isSecret ? ' kw-secret-bg' : '');
    row.innerHTML = `
      <input type="text" class="kw-single-label" placeholder="項目名" value="${escapeHtml(label)}">
      <input type="text" class="kw-single-value" placeholder="値" value="${escapeHtml(value)}">
      <select class="kw-single-secret">
        <option value="secret" ${isSecret ? 'selected' : ''}>秘密</option>
        <option value="public" ${!isSecret ? 'selected' : ''}>公開</option>
      </select>
      <button class="kw-remove-btn" title="削除">−</button>
    `;
    row.querySelector('.kw-single-secret').addEventListener('change', e => {
      row.classList.toggle('kw-secret-bg', e.target.value === 'secret');
      debouncedSave();
    });
    row.querySelector('.kw-remove-btn').addEventListener('click', () => { row.remove(); debouncedSave(); });
    container.appendChild(row);
  }

  // ----------------------------------------------------------------
  // テーブル描画
  // ----------------------------------------------------------------
  function renderTable(headers, rows, secretCols) {
    const container = document.getElementById('kw-table-container');
    if (!container || !headers.length) { if (container) container.innerHTML = ''; return; }
    while (secretCols.length < headers.length) secretCols.push(true);

    let html = '<table class="kw-table"><thead>';
    html += '<tr class="kw-col-ctrl-row">';
    headers.forEach((_, i) => {
      html += `<th><select class="kw-col-secret" data-col="${i}">
        <option value="secret" ${secretCols[i] ? 'selected' : ''}>秘密</option>
        <option value="public" ${!secretCols[i] ? 'selected' : ''}>公開</option>
      </select></th>`;
    });
    html += '</tr><tr>';
    headers.forEach(h => { html += `<th class="kw-col-header">${escapeHtml(h)}</th>`; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
      html += '<tr>';
      headers.forEach((_, ci) => {
        const cls = secretCols[ci] ? ' class="kw-secret-bg"' : '';
        html += `<td${cls}>${escapeHtml(row[ci] ?? '')}</td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.kw-col-secret').forEach(sel => {
      sel.addEventListener('change', () => {
        const ci = parseInt(sel.dataset.col);
        const isSecret = sel.value === 'secret';
        container.querySelectorAll('tbody tr').forEach(tr => {
          const td = tr.cells[ci];
          if (td) td.classList.toggle('kw-secret-bg', isSecret);
        });
        debouncedSave();
      });
    });
  }

  // ----------------------------------------------------------------
  // 生成対象タグ
  // ----------------------------------------------------------------
  function addTarget(name = '') {
    const container = document.getElementById('kw-targets-container');
    if (!container) return;
    const tag = document.createElement('span');
    tag.className = 'kw-target-tag';
    tag.innerHTML = `
      <input type="text" class="kw-target-input" value="${escapeHtml(name)}" placeholder="例: Entity">
      <button class="kw-remove-btn" title="削除">×</button>
    `;
    tag.querySelector('.kw-remove-btn').addEventListener('click', () => { tag.remove(); debouncedSave(); });
    container.appendChild(tag);
  }

  function collectTargets() {
    return Array.from(document.querySelectorAll('.kw-target-input'))
      .map(i => i.value.trim()).filter(Boolean);
  }

  // ----------------------------------------------------------------
  // マスキング → チャット入力欄へ転記
  // ----------------------------------------------------------------
  function handleMask() {
    saveCurrentToState();
    Masker.reset();

    const language = document.getElementById('kw-language').value.trim() || '（言語未指定）';
    const targets  = collectTargets();
    const example  = document.getElementById('kw-example').value;

    // メイン単一情報マスク
    const maskedMainSingles = _mainSingles
      .filter(s => s.label.trim())
      .map(({ label, value, secret }) => ({
        label,
        maskedValue: (secret && value.trim()) ? Masker.maskSingle(label, value) : value,
      }));

    // データセットごとにマスク
    let colGroupIdx = 0;
    const maskedDatasets = _datasets.map(ds => {
      // サブ単一情報
      const maskedSingles = ds.singles
        .filter(s => s.label.trim())
        .map(({ label, value, secret }) => ({
          label,
          maskedValue: (secret && value.trim()) ? Masker.maskSingle(label, value) : value,
        }));

      // テーブル
      let maskedTable = null;
      if (ds.parsedData && ds.parsedData.headers.length > 0) {
        const { headers, rows } = ds.parsedData;
        const sc = ds.secretCols.length === headers.length ? ds.secretCols : headers.map(() => true);
        const secretColIndices = headers.map((_, i) => i).filter(i => sc[i] !== false);

        const colPlaceholders = {};
        secretColIndices.forEach((colIdx) => {
          colGroupIdx++;
          const cg = colGroupIdx;
          colPlaceholders[colIdx] = rows.map((r, ri) => {
            const k = `[[C${cg}_${String(ri + 1).padStart(2, '0')}]]`;
            Masker.registerCustom(k, r[colIdx] ?? '');
            return k;
          });
        });

        const maskedRows = rows.map((row) =>
          headers.map((_, ci) => {
            if (sc[ci] === false) return row[ci] ?? '';
            if (colPlaceholders[ci]) return colPlaceholders[ci][rows.indexOf(row)];
            return row[ci] ?? '';
          })
        );

        maskedTable = { key: ds.key || 'テーブル', maskedHeaders: headers, maskedRows };
      }

      return { maskedSingles, maskedTable };
    });

    const prompt = PromptBuilder.build({ maskedMainSingles, maskedDatasets, language, targets, example });

    const chatInput = findChatInput();
    if (chatInput) {
      setInputValue(chatInput, prompt);
      showStatus('プロンプトをチャット入力欄に転記しました。内容を確認して送信してください。', 'success');
    } else {
      navigator.clipboard.writeText(prompt).then(() => {
        showStatus('チャット入力欄が見つかりませんでした。クリップボードにコピーしました。', 'warn');
      });
    }
  }

  // ----------------------------------------------------------------
  // アンマスキング
  // ----------------------------------------------------------------
  function handleUnmask() {
    const latestAnswer = getLatestChatAnswer();
    if (!latestAnswer) { showStatus('チャットの回答が見つかりませんでした。', 'error'); return; }
    document.getElementById('kw-output').value = Masker.unmask(latestAnswer);
    showStatus('復元完了しました。', 'success');
  }

  // ----------------------------------------------------------------
  // チャットUI操作ヘルパー
  // ----------------------------------------------------------------
  function findChatInput() {
    for (const sel of ['textarea[placeholder]', 'div[contenteditable="true"]', 'textarea']) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function setInputValue(el, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.contentEditable === 'true') {
      el.innerText = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.focus();
  }

  function getLatestChatAnswer() {
    const proseEls = document.querySelectorAll('div.prose');
    return proseEls.length > 0 ? proseEls[proseEls.length - 1].innerText : null;
  }

  // ----------------------------------------------------------------
  // localStorage 保存・復元
  // ----------------------------------------------------------------
  function debouncedSave() {
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(saveState, 500);
  }

  async function saveState() {
    saveCurrentToState();
    const state = {
      mainSingles: _mainSingles,
      datasets:    _datasets,
      activeIdx:   _activeIdx,
      language:    document.getElementById('kw-language')?.value || '',
      targets:     collectTargets(),
      example:     document.getElementById('kw-example')?.value || '',
    };
    await Storage.setItem(STORAGE_KEY, state);
  }

  async function loadState() {
    return await Storage.getItem(STORAGE_KEY, null);
  }

  // ----------------------------------------------------------------
  // テンプレート管理
  // ----------------------------------------------------------------

  /** テンプレート一覧を localStorage から取得 */
  async function loadTemplates() {
    return await Storage.getItem(TEMPLATE_KEY, []);
  }

  /** テンプレート一覧を localStorage に保存 */
  async function persistTemplates(templates) {
    await Storage.setItem(TEMPLATE_KEY, templates);
  }

  /** 現在の入力内容をテンプレートとして保存 */
  async function saveAsTemplate(name) {
    saveCurrentToState();
    const templates = await loadTemplates();
    templates.push({
      id:   Date.now().toString(),
      name: name.trim(),
      data: {
        mainSingles: _mainSingles,
        datasets:    _datasets,
        activeIdx:   _activeIdx,
        language:    document.getElementById('kw-language')?.value || '',
        targets:     collectTargets(),
        example:     document.getElementById('kw-example')?.value || '',
      },
    });
    await persistTemplates(templates);
    await refreshTemplateSelect();
    showStatus(`テンプレート「${name}」を保存しました。`, 'success');
  }

  /** テンプレートを現在の入力内容に反映 */
  async function applyTemplate(id) {
    const templates = await loadTemplates();
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;

    const d = tmpl.data;
    _mainSingles = d.mainSingles ?? [];
    _datasets    = d.datasets?.length > 0 ? d.datasets : [createDataset()];
    _activeIdx   = d.activeIdx ?? 0;

    // メイン単一情報を再描画
    const mainContainer = document.getElementById('kw-main-singles-container');
    mainContainer.innerHTML = '';
    (_mainSingles.length > 0 ? _mainSingles : [{ label: '', value: '', secret: true }])
      .forEach(({ label, value, secret }) => addSingleRow('kw-main-singles-container', label, value, secret));

    // データセットを再描画
    renderDataset();

    // 生成設定を反映
    if (d.language) document.getElementById('kw-language').value = d.language;
    const targetsContainer = document.getElementById('kw-targets-container');
    targetsContainer.innerHTML = '';
    (d.targets?.length > 0 ? d.targets : ['Entity', 'DAO', 'Service']).forEach(t => addTarget(t));
    if (d.example != null) document.getElementById('kw-example').value = d.example;

    debouncedSave();
    showStatus(`テンプレート「${tmpl.name}」を反映しました。`, 'success');
  }

  /** テンプレートを削除 */
  async function deleteTemplate(id) {
    const templates = (await loadTemplates()).filter(t => t.id !== id);
    await persistTemplates(templates);
    await refreshTemplateSelect();
    await renderTemplateEditArea();
  }

  /** テンプレート名を変更 */
  async function renameTemplate(id, newName) {
    const templates = (await loadTemplates()).map(t => t.id === id ? { ...t, name: newName.trim() } : t);
    await persistTemplates(templates);
    await refreshTemplateSelect();
    await renderTemplateEditArea();
  }

  /** テンプレート選択ドロップダウンを更新 */
  async function refreshTemplateSelect() {
    const sel = document.getElementById('kw-template-select');
    if (!sel) return;
    const current = sel.value;
    const templates = await loadTemplates();
    sel.innerHTML = '<option value="">-- テンプレートを選択 --</option>'
      + templates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join('');
    if (templates.find(t => t.id === current)) sel.value = current;
  }

  /** テンプレート編集エリアを再描画 */
  async function renderTemplateEditArea() {
    const area = document.getElementById('kw-template-edit-area');
    if (!area || area.style.display === 'none') return;
    const templates = await loadTemplates();
    if (templates.length === 0) {
      area.innerHTML = '<p class="kw-tmpl-empty">保存済みテンプレートはありません。</p>';
      return;
    }
    area.innerHTML = templates.map(t => `
      <div class="kw-tmpl-edit-row" data-id="${escapeHtml(t.id)}">
        <input type="text" class="kw-tmpl-name-input" value="${escapeHtml(t.name)}">
        <button class="kw-secondary-btn kw-tmpl-rename-btn">名称変更</button>
        <button class="kw-remove-btn kw-tmpl-delete-btn" title="削除">削除</button>
      </div>
    `).join('');

    area.querySelectorAll('.kw-tmpl-rename-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.kw-tmpl-edit-row');
        const newName = row.querySelector('.kw-tmpl-name-input').value.trim();
        if (!newName) { showStatus('テンプレート名を入力してください。', 'warn'); return; }
        await renameTemplate(row.dataset.id, newName);
        showStatus('名称を変更しました。', 'success');
      });
    });
    area.querySelectorAll('.kw-tmpl-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.kw-tmpl-edit-row');
        const templates = await loadTemplates();
        const tmpl = templates.find(t => t.id === row.dataset.id);
        if (!confirm(`テンプレート「${tmpl?.name}」を削除しますか？`)) return;
        await deleteTemplate(row.dataset.id);
        showStatus('テンプレートを削除しました。', 'success');
      });
    });
  }

  // ----------------------------------------------------------------
  // ステータス表示 / エスケープ
  // ----------------------------------------------------------------
  function showStatus(msg, type = 'info') {
    const el = document.getElementById('kw-status');
    if (!el) return;
    el.textContent = msg;
    el.className = `kw-status kw-status-${type}`;
    setTimeout(() => { el.textContent = ''; el.className = 'kw-status'; }, 5000);
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ----------------------------------------------------------------
  // モーダルHTML生成
  // ----------------------------------------------------------------
  function createModal() {
    const el = document.createElement('div');
    el.id = 'kw-modal';
    el.innerHTML = `
      <div id="kw-modal-inner">
        <div id="kw-modal-header">
          <span>コード生成支援ツール</span>
          <div class="kw-header-actions">
            <button id="kw-template-toggle-btn" title="テンプレート">📋 テンプレート</button>
            <button id="kw-close-btn" title="閉じる">×</button>
          </div>
        </div>

        <!-- テンプレートバー（トグル） -->
        <div id="kw-template-bar">
          <div class="kw-tmpl-main-row">
            <select id="kw-template-select"><option value="">-- テンプレートを選択 --</option></select>
            <button class="kw-secondary-btn" id="kw-template-apply-btn">テンプレート反映</button>
            <button class="kw-secondary-btn" id="kw-template-io-btn">エクスポート / インポート</button>
            <span class="kw-tmpl-spacer"></span>
            <button class="kw-secondary-btn" id="kw-template-save-btn">テンプレートとして保存</button>
            <button class="kw-secondary-btn" id="kw-template-edit-btn">テンプレート編集</button>
            <button class="kw-secondary-btn kw-tmpl-clear-btn" id="kw-template-clear-btn">入力項目をクリア</button>
          </div>
          <!-- 保存フォーム -->
          <div id="kw-template-save-form">
            <input type="text" id="kw-template-name-input" placeholder="テンプレート名を入力">
            <button class="kw-primary-btn" id="kw-template-save-confirm">保存</button>
            <button class="kw-secondary-btn" id="kw-template-save-cancel">キャンセル</button>
          </div>
          <!-- 編集エリア -->
          <div id="kw-template-edit-area"></div>
          <!-- エクスポート/インポートパネル -->
          <div id="kw-template-io-panel">
            <div class="kw-io-block">
              <div class="kw-io-block-header">
                <span class="kw-io-label">エクスポート</span>
                <button class="kw-secondary-btn" id="kw-export-btn">JSONを生成</button>
                <button class="kw-secondary-btn" id="kw-export-copy-btn">コピー</button>
              </div>
              <textarea id="kw-export-text" rows="3" readonly placeholder="「JSONを生成」を押すと保存済みテンプレートのJSONが表示されます"></textarea>
            </div>
            <div class="kw-io-divider"></div>
            <div class="kw-io-block">
              <div class="kw-io-block-header">
                <span class="kw-io-label">インポート</span>
                <button class="kw-secondary-btn" id="kw-import-btn">インポート実行</button>
              </div>
              <textarea id="kw-import-text" rows="3" placeholder="インポートするJSONをここに貼り付け"></textarea>
            </div>
          </div>
        </div>
        <div id="kw-modal-body">

          <!-- メイン単一情報 -->
          <section class="kw-section">
            <div class="kw-section-title">メイン単一情報 <span class="kw-section-hint">（全データ共通）</span></div>
            <div id="kw-main-singles-container"></div>
            <button class="kw-add-btn" id="kw-add-main-single">＋ 行を追加</button>
          </section>

          <!-- 複数情報（ページネーション） -->
          <section class="kw-section">
            <div class="kw-section-title">複数情報</div>

            <!-- テーブルキー -->
            <div class="kw-multi-block-header">
              <span class="kw-multi-block-label">テーブル名</span>
              <input type="text" id="kw-multi-key" placeholder="テーブル名（例: 画面項目）">
            </div>

            <!-- 区切り文字 -->
            <div class="kw-delimiter-row">
              <span>区切り文字：</span>
              <label><input type="radio" name="kw-delim" value="tab" checked> タブ</label>
              <label><input type="radio" name="kw-delim" value="space"> スペース</label>
              <label><input type="radio" name="kw-delim" value="comma"> カンマ</label>
              <label><input type="radio" name="kw-delim" value="slash"> スラッシュ</label>
              <label><input type="radio" name="kw-delim" value="custom"> カスタム</label>
            </div>
            <div id="kw-custom-pattern-wrap" style="display:none">
              <textarea id="kw-custom-pattern" rows="3" placeholder="例: [[物理名]]:&#10;type: [[型]]&#10;description: [[論理名]]"></textarea>
            </div>

            <!-- テキストエリア -->
            <textarea id="kw-multi-input" rows="5" placeholder="1行目をヘッダー行として入力"></textarea>

            <!-- テーブルプレビュー -->
            <div class="kw-table-scroll-wrapper"><div id="kw-table-container"></div></div>

            <div class="kw-divider"></div>

            <!-- サブ単一情報 -->
            <div class="kw-subsection-title">サブ単一情報 <span class="kw-section-hint">（このデータ専用）</span></div>
            <div id="kw-sub-singles-container"></div>
            <button class="kw-add-btn" id="kw-add-sub-single">＋ 行を追加</button>

            <!-- ページネーション -->
            <div id="kw-pagination-wrap">
              <span class="kw-pagination-label">データ：</span>
              <div id="kw-pagination"></div>
            </div>
          </section>

          <!-- 生成設定 -->
          <section class="kw-section">
            <div class="kw-section-title">生成設定</div>
            <div class="kw-row">
              <label>言語 / FW：</label>
              <input type="text" id="kw-language" placeholder="例: Java / Spring Boot" value="Java / Spring Boot">
            </div>
            <div class="kw-row kw-targets-row">
              <label>生成対象：</label>
              <div id="kw-targets-container"></div>
              <button class="kw-add-btn" id="kw-add-target">＋</button>
            </div>
            <div class="kw-row">
              <label>出力例（任意）：</label>
              <textarea id="kw-example" rows="4" placeholder="AIへの出力例を入力（省略可）"></textarea>
            </div>
          </section>

          <!-- ボタン -->
          <section class="kw-section kw-btn-section">
            <button class="kw-primary-btn" id="kw-mask-btn">マスキングして入力欄へ転記</button>
            <button class="kw-primary-btn" id="kw-unmask-btn">返答を取得して復元（アンマスキング）</button>
          </section>

          <!-- コード出力欄 -->
          <section class="kw-section">
            <div class="kw-section-title">コード出力欄</div>
            <textarea id="kw-output" rows="10" readonly placeholder="復元されたコードがここに表示されます"></textarea>
            <div class="kw-output-actions">
              <button class="kw-secondary-btn" id="kw-copy-btn">クリップボードにコピー</button>
              <button class="kw-secondary-btn" id="kw-save-btn">ファイルとして保存</button>
            </div>
            <div id="kw-status" class="kw-status"></div>
          </section>

        </div>
      </div>
    `;
    return el;
  }

  // ----------------------------------------------------------------
  // 初期化
  // ----------------------------------------------------------------
  async function init() {
    _modal = createModal();
    document.body.appendChild(_modal);

    const saved = await loadState();

    // メイン単一情報復元
    _mainSingles = saved?.mainSingles ?? [];
    const mainSingles = _mainSingles.length > 0
      ? _mainSingles
      : [{ label: '', value: '', secret: true }];
    mainSingles.forEach(({ label, value, secret }) =>
      addSingleRow('kw-main-singles-container', label, value, secret)
    );

    // データセット復元
    _datasets  = saved?.datasets?.length > 0 ? saved.datasets : [createDataset()];
    _activeIdx = saved?.activeIdx ?? 0;
    renderDataset();

    // 生成対象復元
    if (saved?.targets?.length > 0) {
      saved.targets.forEach(t => addTarget(t));
    } else {
      ['Entity', 'DAO', 'Service'].forEach(t => addTarget(t));
    }
    if (saved?.language) document.getElementById('kw-language').value = saved.language;
    if (saved?.example)  document.getElementById('kw-example').value  = saved.example;

    // ---- イベント登録 ----

    // テンプレートバー初期化
    await refreshTemplateSelect();
    document.getElementById('kw-template-bar').style.display = 'none';
    document.getElementById('kw-template-save-form').style.display = 'none';
    document.getElementById('kw-template-edit-area').style.display = 'none';

    // テンプレートボタン（トグル）
    document.getElementById('kw-template-toggle-btn').addEventListener('click', () => {
      const bar = document.getElementById('kw-template-bar');
      bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
    });

    // テンプレート反映
    document.getElementById('kw-template-apply-btn').addEventListener('click', async () => {
      const id = document.getElementById('kw-template-select').value;
      if (!id) { showStatus('テンプレートを選択してください。', 'warn'); return; }
      if (!confirm('現在の入力内容をテンプレートの内容で上書きします。よろしいですか？')) return;
      await applyTemplate(id);
    });

    // テンプレートとして保存ボタン
    document.getElementById('kw-template-save-btn').addEventListener('click', () => {
      const form = document.getElementById('kw-template-save-form');
      const editArea = document.getElementById('kw-template-edit-area');
      const ioPanel = document.getElementById('kw-template-io-panel');
      editArea.style.display = 'none';
      ioPanel.style.display = 'none';
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      if (form.style.display === 'flex') {
        document.getElementById('kw-template-name-input').focus();
      }
    });

    // 保存確定
    document.getElementById('kw-template-save-confirm').addEventListener('click', async () => {
      const name = document.getElementById('kw-template-name-input').value.trim();
      if (!name) { showStatus('テンプレート名を入力してください。', 'warn'); return; }
      await saveAsTemplate(name);
      document.getElementById('kw-template-name-input').value = '';
      document.getElementById('kw-template-save-form').style.display = 'none';
    });

    // 保存キャンセル
    document.getElementById('kw-template-save-cancel').addEventListener('click', () => {
      document.getElementById('kw-template-save-form').style.display = 'none';
    });

    // 入力項目クリアボタン
    document.getElementById('kw-template-clear-btn').addEventListener('click', () => {
      if (!confirm('すべての入力項目をクリアします。よろしいですか？')) return;

      // メイン単一情報リセット
      _mainSingles = [];
      document.getElementById('kw-main-singles-container').innerHTML = '';
      addSingleRow('kw-main-singles-container');

      // データセットリセット
      _datasets  = [createDataset()];
      _activeIdx = 0;
      renderDataset();

      // 生成設定リセット
      document.getElementById('kw-language').value = 'Java / Spring Boot';
      document.getElementById('kw-targets-container').innerHTML = '';
      ['Entity', 'DAO', 'Service'].forEach(t => addTarget(t));
      document.getElementById('kw-example').value = '';

      // 出力欄リセット
      document.getElementById('kw-output').value = '';

      debouncedSave();
      showStatus('入力項目をクリアしました。', 'success');
    });

    // エクスポート/インポートパネルトグル
    document.getElementById('kw-template-io-panel').style.display = 'none';
    document.getElementById('kw-template-io-btn').addEventListener('click', () => {
      const panel   = document.getElementById('kw-template-io-panel');
      const editArea = document.getElementById('kw-template-edit-area');
      const saveForm = document.getElementById('kw-template-save-form');
      editArea.style.display = 'none';
      saveForm.style.display = 'none';
      panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });

    // エクスポート
    document.getElementById('kw-export-btn').addEventListener('click', async () => {
      const templates = await loadTemplates();
      document.getElementById('kw-export-text').value = JSON.stringify(templates, null, 2);
      showStatus(`${templates.length}件のテンプレートをエクスポートしました。`, 'success');
    });

    // エクスポートコピー
    document.getElementById('kw-export-copy-btn').addEventListener('click', () => {
      const text = document.getElementById('kw-export-text').value;
      if (!text.trim()) { showStatus('先にエクスポートボタンを押してください。', 'warn'); return; }
      navigator.clipboard.writeText(text).then(() => showStatus('クリップボードにコピーしました。', 'success'));
    });

    // インポート
    document.getElementById('kw-import-btn').addEventListener('click', async () => {
      const raw = document.getElementById('kw-import-text').value.trim();
      if (!raw) { showStatus('JSONを入力してください。', 'warn'); return; }
      let imported;
      try {
        imported = JSON.parse(raw);
      } catch (_) {
        showStatus('JSONの形式が正しくありません。', 'error'); return;
      }
      if (!Array.isArray(imported)) {
        showStatus('テンプレートの配列形式である必要があります。', 'error'); return;
      }
      const valid = imported.filter(t => t.id && t.name && t.data);
      if (valid.length === 0) { showStatus('有効なテンプレートが見つかりませんでした。', 'warn'); return; }

      const existing = await loadTemplates();
      const existingIds = new Set(existing.map(t => t.id));
      // 同じIDは上書き、新規は追加
      const merged = [...existing];
      let added = 0, updated = 0;
      valid.forEach(t => {
        if (existingIds.has(t.id)) {
          const idx = merged.findIndex(e => e.id === t.id);
          merged[idx] = t;
          updated++;
        } else {
          merged.push(t);
          added++;
        }
      });
      await persistTemplates(merged);
      await refreshTemplateSelect();
      document.getElementById('kw-import-text').value = '';
      showStatus(`インポート完了：新規 ${added}件、更新 ${updated}件`, 'success');
    });

    // テンプレート編集ボタン
    document.getElementById('kw-template-edit-btn').addEventListener('click', async () => {
      const editArea = document.getElementById('kw-template-edit-area');
      const form = document.getElementById('kw-template-save-form');
      const ioPanel = document.getElementById('kw-template-io-panel');
      form.style.display = 'none';
      ioPanel.style.display = 'none';
      const next = editArea.style.display === 'none' ? 'block' : 'none';
      editArea.style.display = next;
      if (next === 'block') await renderTemplateEditArea();
    });

    document.getElementById('kw-close-btn').addEventListener('click', () => {
      _modal.style.display = 'none';
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _modal.style.display === 'flex') _modal.style.display = 'none';
    });
    let _mouseDownOnBackdrop = false;
    _modal.addEventListener('mousedown', e => {
      _mouseDownOnBackdrop = e.target === _modal;
    });
    _modal.addEventListener('mouseup', e => {
      if (_mouseDownOnBackdrop && e.target === _modal) _modal.style.display = 'none';
      _mouseDownOnBackdrop = false;
    });

    document.getElementById('kw-add-main-single').addEventListener('click', () => {
      addSingleRow('kw-main-singles-container'); debouncedSave();
    });
    document.getElementById('kw-add-sub-single').addEventListener('click', () => {
      addSingleRow('kw-sub-singles-container', '', '', true); debouncedSave();
    });

    // テキストエリア: フォーカスアウトでテーブル再描画
    const multiInput = document.getElementById('kw-multi-input');

    function reparseCurrent(resetSecretCols = false) {
      const delim   = document.querySelector('input[name="kw-delim"]:checked')?.value || 'tab';
      const text    = multiInput.value;
      const pattern = document.getElementById('kw-custom-pattern')?.value ?? '';
      const parsed  = delim === 'custom'
        ? Parser.parseCustom(text, pattern)
        : Parser.parse(text, delim);
      if (!parsed) return;
      const existing = Array.from(document.querySelectorAll('.kw-col-secret'))
        .map(s => s.value === 'secret');
      const sc = (!resetSecretCols && existing.length === parsed.headers.length)
        ? existing
        : parsed.headers.map(() => true);
      renderTable(parsed.headers, parsed.rows, sc);
    }

    multiInput.addEventListener('blur', () => { reparseCurrent(); debouncedSave(); });

    // 区切り文字変更
    document.querySelectorAll('input[name="kw-delim"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const isCustom = radio.value === 'custom';
        document.getElementById('kw-custom-pattern-wrap').style.display = isCustom ? 'block' : 'none';
        if (!isCustom && multiInput.value.trim()) reparseCurrent(true);
        debouncedSave();
      });
    });

    // カスタムパターン変更でテーブル再描画
    document.getElementById('kw-custom-pattern').addEventListener('input', () => {
      if (multiInput.value.trim()) reparseCurrent(true);
      debouncedSave();
    });

    document.getElementById('kw-add-target').addEventListener('click', () => { addTarget(); debouncedSave(); });
    document.getElementById('kw-mask-btn').addEventListener('click', handleMask);
    document.getElementById('kw-unmask-btn').addEventListener('click', handleUnmask);

    document.getElementById('kw-copy-btn').addEventListener('click', () => {
      const text = document.getElementById('kw-output').value;
      navigator.clipboard.writeText(text).then(() => showStatus('クリップボードにコピーしました。', 'success'));
    });

    document.getElementById('kw-save-btn').addEventListener('click', () => {
      const text = document.getElementById('kw-output').value;
      if (!text.trim()) { showStatus('出力欄が空です。', 'warn'); return; }
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `generated_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('ファイルとして保存しました。', 'success');
    });

    _modal.addEventListener('input', debouncedSave);
    _modal.addEventListener('change', debouncedSave);
  }

  function show() { _modal.style.display = 'flex'; }
  function hide() { if (_modal) _modal.style.display = 'none'; }

  return { init, show, hide };
})();
