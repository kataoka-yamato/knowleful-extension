/**
 * モーダルUI制御モジュール
 *
 * データ構造:
 *   _mainSingles: Array<{label, value, secret}>   // 全ページ共通
 *   _datasets: Array<{                            // ページネーションで切替
 *     tables: Array<{                             // 複数情報（テーブルを複数保持可）
 *       key:        string,                       // テーブル名
 *       text:       string,
 *       delimiter:  string,
 *       secretCols: boolean[],
 *       parsedData: object|null,
 *     }>,
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

  const DEFAULT_GENERATE_LANGUAGE = ''; // 例: Java/Spring Boot
  const DEFAULT_GENERATE_TARGET = ['']; // 例：['Entity', 'Dao', 'Repository', 'Service']

  const STORAGE_KEY   = 'kw_tool_state_v3';
  const TEMPLATE_KEY  = 'kw_templates';
  const SETTINGS_KEY  = 'kw_settings';

  const DEFAULT_SETTINGS = { loopOutput: true };
  let _settings = { ...DEFAULT_SETTINGS };
  let _activeMainTab = 'mask'; // 設定タブ表示前にいた「マスキング／アンマスキング」「質問」のどちらか

  const SVG_ICON_TRASH = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="hover:opacity-50" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="radix-_r_1fh_" data-state="closed"><path d="M4 7l16 0"></path><path d="M10 11l0 6"></path><path d="M14 11l0 6"></path><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"></path><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"></path></svg>'

  const MULTI_INPUT_PLACEHOLDER_DEFAULT = '1行目をヘッダー行として入力';
  const MULTI_INPUT_PLACEHOLDER_CUSTOM  = 'カスタムパターンに一致するデータを入力';

  // 対象AIツール一覧
  const AI_TOOL = {
    KNOWLEFUL:  'KNOWLEFUL',
    CHATGPT:    'CHATGPT',
    CLAUDE:     'CLAUDE',
    GEMINI:     'GEMINI'
  };

  // AIツールのベースURL
  const BASE_URL = {
    [AI_TOOL.KNOWLEFUL]:  'https://chat.knowleful.jp/',
    [AI_TOOL.CHATGPT]:    'https://chatgpt.com/',
    [AI_TOOL.CLAUDE]:     'https://claude.ai/',
    [AI_TOOL.GEMINI]:     'https://gemini.google.com/',
  };

  // マスキング転記（チャット入力欄）／アンマスキング（最新回答取得）に使うDOM構造
  // chatInput: 入力欄のセレクター、chatAnswer: 最新回答を取得するセレクター
  const DOM_SELECTORS = {
    [AI_TOOL.KNOWLEFUL]: {
      chatInput:  '#chat-input',
      chatAnswer: 'div.prose',
    },
    [AI_TOOL.CHATGPT]: {
      chatInput:  '#prompt-textarea',
      chatAnswer: 'div[data-message-author-role="assistant"]',
    },
    [AI_TOOL.CLAUDE]: {
      chatInput:  'div.ProseMirror[contenteditable="true"]',
      chatAnswer: 'div.standard-markdown',
    },
    [AI_TOOL.GEMINI]: {
      chatInput:  'div.ql-editor[contenteditable="true"]',
      chatAnswer: 'message-content .markdown',
    },
  };

  // AIへ質問形式での確認を促すプロンプト指示文
  const QUESTION_PROMPT_SNIPPET =
`仕様に不明点がある場合は、実装・出力前に必ず次の形式で質問してください。
- 選択肢は2つ以上提示し、1つ目を推奨案とすること
- 質問が複数ある場合はQ1, Q2, ...と連番を振ること
- 選択肢のタイトルは簡潔に、説明はその選択肢を選んだ場合の要点のみを1文で記載すること

## 質問形式
[[Q<連番>, "<質問内容>", { ["<推奨する回答のタイトル>", "<推奨する回答の説明>"], ["<他の回答のタイトル>", "<他の回答の説明>"] }]]

例:
[[Q1, "認証方式はどれを採用しますか？", {
["JWT", "ステートレスでスケールしやすいが、失効管理は別途必要。"],
["セッションCookie", "実装はシンプルだが、サーバー側での状態管理が必要。"]
}]]
---`;

  /** 現在のURL（ホスト名）から対象AIツールを判定する。一致しない場合はKNOWLEFULにフォールバック */
  function getCurrentAiTool() {
    const hostname = location.hostname;
    return Object.keys(BASE_URL).find(tool => {
      try { return new URL(BASE_URL[tool]).hostname === hostname; } catch { return false; }
    }) || AI_TOOL.KNOWLEFUL;
  }


  // ----------------------------------------------------------------
  // データセット管理
  // ----------------------------------------------------------------
  function createTable() {
    return { key: '', text: '', delimiter: 'tab', customPattern: '', secretCols: [], parsedData: null };
  }

  function createDataset() {
    return { tables: [createTable()], singles: [] };
  }

  /** 旧形式（テーブル1件をデータセットに直接保持）のデータセットを新形式に変換する */
  function normalizeDataset(ds) {
    if (ds.tables) return ds;
    return {
      tables: [{
        key:           ds.key ?? '',
        text:          ds.text ?? '',
        delimiter:     ds.delimiter ?? 'tab',
        customPattern: ds.customPattern ?? '',
        secretCols:    ds.secretCols ?? [],
        parsedData:    ds.parsedData ?? null,
      }],
      singles: ds.singles ?? [],
    };
  }

  /** 現在のDOM状態を _datasets[_activeIdx] とメイン単一情報に保存 */
  function saveCurrentToState() {
    if (!_modal) return;

    // メイン単一情報
    _mainSingles = collectSinglesFrom('kw-main-singles-container');

    // 現在のデータセット
    const ds = _datasets[_activeIdx];
    if (!ds) return;
    ds.tables  = collectTablesFromDom();
    ds.singles = collectSinglesFrom('kw-sub-singles-container');
  }

  function collectTablesFromDom() {
    const blocks = Array.from(document.querySelectorAll('#kw-multi-blocks-container .kw-multi-block'));
    return blocks.map(block => {
      const key           = block.querySelector('.kw-multi-key')?.value ?? '';
      const text          = block.querySelector('.kw-multi-input')?.value ?? '';
      const delimiter     = block.querySelector('.kw-delim-radio:checked')?.value || 'tab';
      const customPattern = block.querySelector('.kw-custom-pattern')?.value ?? '';
      const secretCols     = Array.from(block.querySelectorAll('.kw-col-secret')).map(s => s.value === 'secret');
      const parsedData = text.trim()
        ? (delimiter === 'custom' ? Parser.parseCustom(text, customPattern) : Parser.parse(text, delimiter))
        : null;
      return { key, text, delimiter, customPattern, secretCols, parsedData };
    });
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

    renderMultiBlocks();

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
      tables: (prev?.tables ?? [createTable()]).map(t => ({
        key:           t.key ?? '',
        text:          '',
        delimiter:     t.delimiter ?? 'tab',
        customPattern: t.customPattern ?? '',
        secretCols:    [],
        parsedData:    null,
      })),
      singles: (prev?.singles ?? []).map(({ label, secret }) => ({ label, value: '', secret })),
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
      btn.textContent = String(i + 1);
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
      // rmBtn.textContent = '−';
      rmBtn.innerHTML = SVG_ICON_TRASH;
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
      <button class="kw-remove-btn" title="削除">
        ${SVG_ICON_TRASH}
      </button>
    `;
    row.querySelector('.kw-single-secret').addEventListener('change', e => {
      row.classList.toggle('kw-secret-bg', e.target.value === 'secret');
      debouncedSave();
    });
    row.querySelector('.kw-remove-btn').addEventListener('click', () => { row.remove(); debouncedSave(); });
    container.appendChild(row);
  }

  // ----------------------------------------------------------------
  // 複数情報（テーブル）ブロック管理
  // ----------------------------------------------------------------

  /** _datasets[_activeIdx].tables の内容で複数情報ブロック群を再描画 */
  function renderMultiBlocks() {
    const ds = _datasets[_activeIdx];
    const container = document.getElementById('kw-multi-blocks-container');
    if (!container) return;
    if (ds.tables.length === 0) ds.tables.push(createTable());
    container.innerHTML = '';
    ds.tables.forEach((table, idx) => addTableBlock(table, idx, ds.tables.length));
  }

  /** 現在のデータセットにテーブルを1件追加する */
  function addTableToCurrentDataset() {
    saveCurrentToState();
    const ds = _datasets[_activeIdx];
    ds.tables.push(createTable());
    renderMultiBlocks();
    debouncedSave();
  }

  /** 複数情報ブロックを1件描画し、コンテナへ追加する */
  function addTableBlock(table, idx, total) {
    const container = document.getElementById('kw-multi-blocks-container');
    if (!container) return;

    const block = document.createElement('div');
    block.className = 'kw-multi-block';
    block.innerHTML = `
      <div class="kw-multi-block-header">
        <span class="kw-multi-block-label">テーブル名</span>
        <input type="text" class="kw-multi-key" placeholder="テーブル名（例: 画面項目）" value="${escapeHtml(table.key)}">
      </div>
      <div class="kw-delimiter-row">
        <span>区切り文字：</span>
        <label><input type="radio" name="kw-delim-${idx}" class="kw-delim-radio" value="tab"> タブ</label>
        <label><input type="radio" name="kw-delim-${idx}" class="kw-delim-radio" value="space"> スペース</label>
        <label><input type="radio" name="kw-delim-${idx}" class="kw-delim-radio" value="comma"> カンマ</label>
        <label><input type="radio" name="kw-delim-${idx}" class="kw-delim-radio" value="slash"> スラッシュ</label>
        <label><input type="radio" name="kw-delim-${idx}" class="kw-delim-radio" value="custom"> カスタム</label>
      </div>
      <div class="kw-custom-pattern-wrap" style="display:none">
        <textarea class="kw-custom-pattern" rows="4" placeholder="カスタムパターンを入力&#10;例: [[物理名]]:&#10;type: [[型]]&#10;description: [[論理名]]">${escapeHtml(table.customPattern ?? '')}</textarea>
      </div>
      <textarea class="kw-multi-input" rows="5" placeholder="${table.delimiter === 'custom' ? MULTI_INPUT_PLACEHOLDER_CUSTOM : MULTI_INPUT_PLACEHOLDER_DEFAULT}">${escapeHtml(table.text ?? '')}</textarea>
      <div class="kw-table-scroll-wrapper"><div class="kw-table-container"></div></div>
    `;

    if (total > 1) {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'kw-remove-btn';
      removeBtn.title = '削除';
      removeBtn.innerHTML = SVG_ICON_TRASH;
      removeBtn.addEventListener('click', () => removeTableBlock(block));
      block.querySelector('.kw-multi-block-header').appendChild(removeBtn);
    }

    const delimRadio = block.querySelector(`.kw-delim-radio[value="${table.delimiter || 'tab'}"]`);
    if (delimRadio) delimRadio.checked = true;
    block.querySelector('.kw-custom-pattern-wrap').style.display = table.delimiter === 'custom' ? 'block' : 'none';

    const multiInput = block.querySelector('.kw-multi-input');
    const customPatternEl = block.querySelector('.kw-custom-pattern');
    const customWrapEl = block.querySelector('.kw-custom-pattern-wrap');
    const tableContainer = block.querySelector('.kw-table-container');

    function reparseCurrent(resetSecretCols = false) {
      const delim = block.querySelector('.kw-delim-radio:checked')?.value || 'tab';
      const text = multiInput.value;
      const pattern = customPatternEl.value;
      const parsed = delim === 'custom' ? Parser.parseCustom(text, pattern) : Parser.parse(text, delim);
      if (!parsed) return;
      const existing = Array.from(block.querySelectorAll('.kw-col-secret')).map(s => s.value === 'secret');
      const sc = (!resetSecretCols && existing.length === parsed.headers.length)
        ? existing
        : parsed.headers.map(() => true);
      renderTable(tableContainer, parsed.headers, parsed.rows, sc);
    }

    if (table.parsedData && table.parsedData.headers.length > 0) {
      const sc = table.secretCols.length === table.parsedData.headers.length
        ? table.secretCols
        : table.parsedData.headers.map(() => true);
      renderTable(tableContainer, table.parsedData.headers, table.parsedData.rows, sc);
    }

    multiInput.addEventListener('blur', () => { reparseCurrent(); debouncedSave(); });

    block.querySelectorAll('.kw-delim-radio').forEach(radio => {
      radio.addEventListener('change', () => {
        const isCustom = radio.value === 'custom';
        customWrapEl.style.display = isCustom ? 'block' : 'none';
        multiInput.placeholder = isCustom ? MULTI_INPUT_PLACEHOLDER_CUSTOM : MULTI_INPUT_PLACEHOLDER_DEFAULT;
        if (!isCustom && multiInput.value.trim()) reparseCurrent(true);
        debouncedSave();
      });
    });

    customPatternEl.addEventListener('input', () => {
      if (multiInput.value.trim()) reparseCurrent(true);
      debouncedSave();
    });

    container.appendChild(block);
  }

  /** 複数情報ブロックを1件削除する */
  function removeTableBlock(block) {
    const ds = _datasets[_activeIdx];
    if (ds.tables.length <= 1) { showStatus('最低1つのテーブルが必要です。', 'warn'); return; }
    saveCurrentToState();
    const idx = Array.from(block.parentElement.children).indexOf(block);
    ds.tables.splice(idx, 1);
    renderMultiBlocks();
    debouncedSave();
  }

  // ----------------------------------------------------------------
  // テーブル描画
  // ----------------------------------------------------------------
  function renderTable(container, headers, rows, secretCols) {
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

    const language = document.getElementById('kw-language').value.trim();
    const targets  = collectTargets();
    const example  = document.getElementById('kw-example').value.trim();

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

      // テーブル群
      const maskedTables = ds.tables
        .filter(t => t.parsedData && t.parsedData.headers.length > 0)
        .map(t => {
          const { headers, rows } = t.parsedData;
          const sc = t.secretCols.length === headers.length ? t.secretCols : headers.map(() => true);
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

          const maskedRows = rows.map((row, ri) =>
            headers.map((_, ci) => {
              if (sc[ci] === false) return row[ci] ?? '';
              if (colPlaceholders[ci]) return colPlaceholders[ci][ri];
              return row[ci] ?? '';
            })
          );

          return { key: t.key || 'テーブル', maskedHeaders: headers, maskedRows };
        });

      return { maskedSingles, maskedTables };
    });

    const prompt = PromptBuilder.build({
      maskedMainSingles, maskedDatasets, language, targets, example,
      loopEnabled: _settings.loopOutput,
    });

    const chatInput = findChatInput();
    if (chatInput) {
      setInputValue(chatInput, prompt);
      markMaskingDone();
      showStatus('プロンプトをチャット入力欄に転記しました。内容を確認して送信してください。', 'success');
    } else {
      navigator.clipboard.writeText(prompt).then(() => {
        markMaskingDone();
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
    clearMaskingPending();
    showStatus('復元完了しました。', 'success');
  }

  // ----------------------------------------------------------------
  // 質問タブ
  // ----------------------------------------------------------------

  /** チャット入力欄の現在のテキストを取得する */
  function getInputText(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value;
    if (el.contentEditable === 'true') return el.innerText;
    return '';
  }

  function unescapeQuoted(str) {
    return str.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  /** AIの回答テキストから質問形式（[[QX, "質問", { ["タイトル","説明"], ... }]]）を抽出する */
  function parseQuestions(text) {
    if (!text) return [];
    const questions = [];
    const qRe = /\[\[\s*([A-Za-z0-9_]+)\s*,\s*"((?:[^"\\]|\\.)*)"\s*,\s*\{([\s\S]*?)\}\s*\]\]/g;
    let qm;
    while ((qm = qRe.exec(text)) !== null) {
      const [, id, rawText, optionsBlock] = qm;
      const options = [];
      const optRe = /\[\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]/g;
      let om;
      while ((om = optRe.exec(optionsBlock)) !== null) {
        options.push({ title: unescapeQuoted(om[1]), desc: unescapeQuoted(om[2]) });
      }
      if (options.length > 0) questions.push({ id, text: unescapeQuoted(rawText), options });
    }
    return questions;
  }

  /** 抽出した質問をラジオボタン形式でツールのカード部に描画する（「その他」を末尾に追加） */
  function renderQuestionList(questions) {
    const container = document.getElementById('kw-question-list');
    if (!container) return;

    if (questions.length === 0) {
      container.innerHTML = '<p class="kw-tmpl-empty">質問形式に合致するデータが見つかりませんでした。</p>';
      return;
    }

    container.innerHTML = questions.map((q, qi) => `
      <div class="kw-question-block" data-qid="${escapeHtml(q.id)}">
        <div class="kw-question-text">${escapeHtml(q.id)}: ${escapeHtml(q.text)}</div>
        <div class="kw-question-options">
          ${q.options.map((opt, oi) => `
            <label class="kw-question-option">
              <input type="radio" name="kw-q-${qi}" value="${escapeHtml(opt.title)}">
              <span class="kw-question-option-body">
                <span class="kw-question-option-title">${oi === 0 ? '【推奨】' : ''}${escapeHtml(opt.title)}</span>
                <span class="kw-question-option-desc">${escapeHtml(opt.desc)}</span>
              </span>
            </label>
          `).join('')}
          <label class="kw-question-option kw-question-option-other">
            <input type="radio" name="kw-q-${qi}" class="kw-question-other-radio" value="__other__">
            <span class="kw-question-option-body">
              <span class="kw-question-option-title">その他</span>
              <input type="text" class="kw-question-other-input" placeholder="回答を入力してください">
            </span>
          </label>
        </div>
      </div>
    `).join('');

    // 「その他」の入力欄に文字が入力されたら自動で対応するラジオボタンを選択する
    container.querySelectorAll('.kw-question-other-input').forEach(input => {
      input.addEventListener('input', () => {
        if (!input.value.trim()) return;
        input.closest('.kw-question-option-other').querySelector('.kw-question-other-radio').checked = true;
      });
    });
  }

  /** チャット入力欄先頭に質問形式の指示文を追加する（既に追加済みなら何もしない） */
  function handlePromptAppend() {
    const chatInput = findChatInput();
    if (!chatInput) { showStatus('チャット入力欄が見つかりませんでした。', 'error'); return; }

    const currentText = getInputText(chatInput);
    if (currentText.includes('## 質問形式')) {
      showStatus('すでにプロンプトに追加済みです。', 'info');
      return;
    }

    const newText = currentText.trim()
      ? `${QUESTION_PROMPT_SNIPPET}\n\n${currentText}`
      : QUESTION_PROMPT_SNIPPET;
    setInputValue(chatInput, newText);
    showStatus('プロンプトに追加しました。', 'success');
  }

  /** AIの最新回答から質問を抽出して表示する（抽出結果は毎回上書き） */
  function handleQuestionExtract() {
    const latestAnswer = getLatestChatAnswer();
    if (!latestAnswer) { showStatus('チャットの回答が見つかりませんでした。', 'error'); return; }

    const questions = parseQuestions(latestAnswer);
    renderQuestionList(questions);
    if (questions.length === 0) {
      showStatus('質問形式に合致するデータが見つかりませんでした。', 'warn');
    } else {
      showStatus(`${questions.length}件の質問を抽出しました。`, 'success');
    }
  }

  /** 選択された回答をAIが理解しやすい形式に変換し、チャット入力欄に上書きする */
  function handleQuestionAnswer() {
    const blocks = Array.from(document.querySelectorAll('#kw-question-list .kw-question-block'));
    if (blocks.length === 0) { showStatus('先に質問を抽出してください。', 'warn'); return; }

    const lines = [];
    blocks.forEach(block => {
      const checked = block.querySelector('input[type="radio"]:checked');
      if (!checked) return;
      let answer;
      if (checked.value === '__other__') {
        answer = block.querySelector('.kw-question-other-input').value.trim();
        if (!answer) return;
      } else {
        answer = checked.value;
      }
      lines.push(`${block.dataset.qid}: ${answer}`);
    });

    if (lines.length === 0) { showStatus('回答が選択されていません。', 'warn'); return; }

    const chatInput = findChatInput();
    if (!chatInput) { showStatus('チャット入力欄が見つかりませんでした。', 'error'); return; }
    setInputValue(chatInput, lines.join('\n'));
    showStatus('回答をチャット入力欄に貼り付けました。', 'success');
    hide();
  }

  /** タブ切り替え（マスキング／アンマスキング ⇔ 質問 ⇔ 設定） */
  function switchTab(tab) {
    if (tab === 'mask' || tab === 'question') _activeMainTab = tab;
    const isMask = tab === 'mask';

    document.getElementById('kw-tab-panel-mask').style.display     = tab === 'mask'     ? 'flex' : 'none';
    document.getElementById('kw-tab-panel-question').style.display = tab === 'question' ? 'flex' : 'none';
    document.getElementById('kw-tab-panel-settings').style.display = tab === 'settings' ? 'flex' : 'none';

    // テンプレートはマスキングタブ以外では無関係のため非表示にする
    document.getElementById('kw-template-toggle-btn').style.display = isMask ? '' : 'none';
    if (!isMask) document.getElementById('kw-template-bar').style.display = 'none';

    document.querySelectorAll('.kw-tab-btn').forEach(btn => {
      btn.classList.toggle('kw-tab-active', btn.dataset.tab === tab);
    });
    document.getElementById('kw-settings-toggle-btn').classList.toggle('kw-header-btn-active', tab === 'settings');
  }

  // ----------------------------------------------------------------
  // 設定
  // ----------------------------------------------------------------
  async function loadSettings() {
    return await Storage.getItem(SETTINGS_KEY, DEFAULT_SETTINGS);
  }

  async function saveSettings() {
    await Storage.setItem(SETTINGS_KEY, _settings);
  }

  // ----------------------------------------------------------------
  // チャットUI操作ヘルパー
  // ----------------------------------------------------------------
  function findChatInput() {
    const { chatInput } = DOM_SELECTORS[getCurrentAiTool()];
    return document.querySelector(chatInput);
  }

  function setInputValue(el, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) setter.call(el, text); else el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.contentEditable === 'true') {
      // ProseMirror/Tiptap系エディタは改行を<br>ではなく行ごとの<p>として扱うため、
      // innerTextではなく1行=1<p>のHTMLを組み立てて反映する
      el.innerHTML = text.split('\n').map(line => `<p>${escapeHtml(line) || '<br>'}</p>`).join('');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.focus();
  }

  function getLatestChatAnswer() {
    const { chatAnswer } = DOM_SELECTORS[getCurrentAiTool()];
    const answerEls = document.querySelectorAll(chatAnswer);
    return answerEls.length > 0 ? answerEls[answerEls.length - 1].innerText : null;
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
    _datasets    = (d.datasets?.length > 0 ? d.datasets : [createDataset()]).map(normalizeDataset);
    _activeIdx   = d.activeIdx ?? 0;

    // メイン単一情報を再描画
    const mainContainer = document.getElementById('kw-main-singles-container');
    mainContainer.innerHTML = '';
    (_mainSingles.length > 0 ? _mainSingles : [{ label: '', value: '', secret: true }])
      .forEach(({ label, value, secret }) => addSingleRow('kw-main-singles-container', label, value, secret));

    // 複数情報の解析
    _datasets.forEach(ds => {
      ds.tables.forEach(t => {
        if (t.text && t.text.trim()) {
          t.parsedData = t.delimiter === 'custom'
            ? Parser.parseCustom(t.text, t.customPattern)
            : Parser.parse(t.text, t.delimiter);
        } else {
          t.parsedData = null;
        }
      });
    });

    // データセットを再描画
    renderDataset();

    // 生成設定を反映
    if (d.language) document.getElementById('kw-language').value = d.language;
    const targetsContainer = document.getElementById('kw-targets-container');
    targetsContainer.innerHTML = '';
    (d.targets?.length > 0 ? d.targets : DEFAULT_GENERATE_TARGET).forEach(t => addTarget(t));
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
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
          <div class="kw-tab-switcher">
            <button class="kw-tab-btn kw-tab-active" data-tab="mask">マスキング／アンマスキング</button>
            <button class="kw-tab-btn" data-tab="question">質問</button>
          </div>
          <div class="kw-header-actions">
            <button id="kw-template-toggle-btn" title="テンプレート">📋 テンプレート</button>
            <button id="kw-settings-toggle-btn" title="設定">⚙ 設定</button>
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
                <button class="kw-secondary-btn" id="kw-export-select-all-btn">すべて選択</button>
                <button class="kw-secondary-btn" id="kw-export-btn">JSONを生成</button>
                <button class="kw-secondary-btn" id="kw-export-copy-btn">コピー</button>
              </div>
              <div id="kw-export-checklist"></div>
              <textarea id="kw-export-text" rows="3" readonly placeholder="エクスポートするテンプレートを選択して「JSONを生成」を押してください"></textarea>
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
        <div id="kw-tab-panel-mask" class="kw-tab-panel">

          <!-- メイン単一情報 -->
          <section class="kw-section">
            <div class="kw-section-title">メイン単一情報 <span class="kw-section-hint">（全データ共通）</span></div>
            <div id="kw-main-singles-container"></div>
            <button class="kw-add-btn" id="kw-add-main-single">＋ 行を追加</button>
          </section>

          <!-- 複数情報（ページネーション） -->
          <section class="kw-section">
            <div class="kw-section-title">複数情報</div>

            <!-- テーブルブロック群 -->
            <div id="kw-multi-blocks-container"></div>
            <button class="kw-add-btn" id="kw-add-multi-table">＋ テーブルを追加</button>

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
              <input type="text" id="kw-language" placeholder="例: Java / Spring Boot" value="">
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

        <!-- 質問タブ -->
        <div id="kw-tab-panel-question" class="kw-tab-panel" style="display:none">
          <section class="kw-section">
            <div class="kw-section-title">プロンプトへの質問指示追加</div>
            <div class="kw-question-desc">AIに対し、不明点があれば質問するよう指示する文言をチャット入力欄の先頭に追加します。</div>
            <button class="kw-secondary-btn" id="kw-prompt-append-btn">プロンプトに追加</button>
          </section>

          <section class="kw-section">
            <div class="kw-section-title">質問抽出</div>
            <div class="kw-question-desc">AIの最新の回答から質問形式に合致する質問を抽出し、選択肢として表示します。</div>
            <button class="kw-secondary-btn" id="kw-question-extract-btn">質問抽出</button>
            <div id="kw-question-list" class="kw-question-list"></div>
          </section>

          <section class="kw-section kw-btn-section">
            <button class="kw-primary-btn" id="kw-question-answer-btn">回答を貼り付け</button>
          </section>
        </div>

        <!-- 設定タブ -->
        <div id="kw-tab-panel-settings" class="kw-tab-panel" style="display:none">
          <section class="kw-section">
            <div class="kw-section-title">マスキング／アンマスキング</div>
            <div class="kw-setting-row">
              <div class="kw-setting-label">ループ出力を行う</div>
              <div class="kw-setting-desc">繰り返し同じパターンが出力される場合、ループ表記にしてコンテキスト・時間を節約します。低モデルでは、うまく解釈されないことがあります。</div>
              <div class="kw-setting-options">
                <label><input type="radio" name="kw-setting-loop-output" value="yes"> Yes</label>
                <label><input type="radio" name="kw-setting-loop-output" value="no"> No</label>
              </div>
            </div>
          </section>

          <section class="kw-section">
            <div class="kw-section-title">質問</div>
            <div class="kw-setting-empty">設定項目はまだありません。</div>
          </section>
        </div>

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
    _datasets  = (saved?.datasets?.length > 0 ? saved.datasets : [createDataset()]).map(normalizeDataset);
    _activeIdx = saved?.activeIdx ?? 0;
    renderDataset();

    // 生成対象復元
    if (saved?.targets?.length > 0) {
      saved.targets.forEach(t => addTarget(t));
    } else {
      DEFAULT_GENERATE_TARGET.forEach(t => addTarget(t));
      document.getElementById("kw-language").value = DEFAULT_GENERATE_LANGUAGE;
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
      document.getElementById('kw-language').value = DEFAULT_GENERATE_LANGUAGE;
      document.getElementById('kw-targets-container').innerHTML = '';
      DEFAULT_GENERATE_TARGET.forEach(t => addTarget(t));
      document.getElementById('kw-example').value = '';

      // 出力欄リセット
      document.getElementById('kw-output').value = '';

      debouncedSave();
      showStatus('入力項目をクリアしました。', 'success');
    });

    // エクスポート/インポートパネルトグル
    document.getElementById('kw-template-io-panel').style.display = 'none';
    document.getElementById('kw-template-io-btn').addEventListener('click', async () => {
      const panel   = document.getElementById('kw-template-io-panel');
      const editArea = document.getElementById('kw-template-edit-area');
      const saveForm = document.getElementById('kw-template-save-form');
      editArea.style.display = 'none';
      saveForm.style.display = 'none';
      const next = panel.style.display === 'none' ? 'block' : 'none';
      panel.style.display = next;
      if (next === 'block') await renderExportChecklist();
    });

    // エクスポート：パネル表示時にチェックリストを描画する
    async function renderExportChecklist() {
      const container = document.getElementById('kw-export-checklist');
      if (!container) return;
      const templates = await loadTemplates();
      if (templates.length === 0) {
        container.innerHTML = '<p class="kw-tmpl-empty">保存済みテンプレートはありません。</p>';
        return;
      }
      container.innerHTML = templates.map(t => `
        <label class="kw-export-check-row">
          <input type="checkbox" class="kw-export-checkbox" value="${escapeHtml(t.id)}" checked>
          <span>${escapeHtml(t.name)}</span>
        </label>
      `).join('');
    }

    // すべて選択 / すべて解除トグル
    document.getElementById('kw-export-select-all-btn').addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.kw-export-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => { cb.checked = !allChecked; });
      document.getElementById('kw-export-select-all-btn').textContent = allChecked ? 'すべて選択' : 'すべて解除';
    });

    // エクスポート
    document.getElementById('kw-export-btn').addEventListener('click', async () => {
      const selectedIds = new Set(
        Array.from(document.querySelectorAll('.kw-export-checkbox:checked')).map(cb => cb.value)
      );
      if (selectedIds.size === 0) {
        showStatus('エクスポートするテンプレートを1件以上選択してください。', 'warn'); return;
      }
      const templates = await loadTemplates();
      const selected = templates.filter(t => selectedIds.has(t.id));
      document.getElementById('kw-export-text').value = JSON.stringify(selected, null, 2);
      showStatus(`${selected.length}件のテンプレートをエクスポートしました。`, 'success');
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
      // 型・長さ・文字種を厳格に検証する
      const TEMPLATE_ID_RE   = /^[\w\-]{1,64}$/;
      const TEMPLATE_NAME_MAX = 100;
      const valid = imported.filter(t =>
        typeof t.id   === 'string' && TEMPLATE_ID_RE.test(t.id) &&
        typeof t.name === 'string' && t.name.trim().length > 0 && t.name.length <= TEMPLATE_NAME_MAX &&
        t.data !== null && typeof t.data === 'object' && !Array.isArray(t.data)
      );
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
    document.getElementById('kw-add-multi-table').addEventListener('click', addTableToCurrentDataset);

    document.getElementById('kw-add-target').addEventListener('click', () => { addTarget(); debouncedSave(); });
    document.getElementById('kw-mask-btn').addEventListener('click', handleMask);
    document.getElementById('kw-unmask-btn').addEventListener('click', handleUnmask);

    // タブ切り替え
    document.querySelectorAll('.kw-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 質問タブ
    document.getElementById('kw-prompt-append-btn').addEventListener('click', handlePromptAppend);
    document.getElementById('kw-question-extract-btn').addEventListener('click', handleQuestionExtract);
    document.getElementById('kw-question-answer-btn').addEventListener('click', handleQuestionAnswer);

    // 設定タブ（トグル。開いている場合はマスキング／質問タブのうち直前に表示していた方に戻る）
    document.getElementById('kw-settings-toggle-btn').addEventListener('click', () => {
      const isOpen = document.getElementById('kw-tab-panel-settings').style.display !== 'none';
      switchTab(isOpen ? _activeMainTab : 'settings');
    });

    // 設定：ループ出力設定を読み込んで反映
    _settings = await loadSettings();
    document.querySelectorAll('input[name="kw-setting-loop-output"]').forEach(radio => {
      radio.checked = (radio.value === 'yes') === _settings.loopOutput;
      radio.addEventListener('change', () => {
        _settings.loopOutput = document.querySelector('input[name="kw-setting-loop-output"]:checked').value === 'yes';
        saveSettings();
      });
    });

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

  let _maskedAndPending = false; // マスキング済みでアンマスキング前の状態

  /** マスキング実行後にフラグを立て、リロード時に警告する */
  function markMaskingDone() {
    _maskedAndPending = true;
    window.addEventListener('beforeunload', beforeUnloadHandler);
  }

  /** アンマスキング完了またはリセット時にフラグを解除する */
  function clearMaskingPending() {
    _maskedAndPending = false;
    window.removeEventListener('beforeunload', beforeUnloadHandler);
  }

  function beforeUnloadHandler(e) {
    if (_maskedAndPending) {
      e.preventDefault();
      // Chrome では returnValue を設定する必要がある
      e.returnValue = 'マスキング済みのデータが残っています。ページを離れると復元できなくなります。';
    }
  }

  return { init, show, hide, markMaskingDone, clearMaskingPending };
})();
