const UITemplate = (() => {
  const TEMPLATE_KEY = 'kw_templates';

  async function loadTemplates() {
    return await Storage.getItem(TEMPLATE_KEY, []);
  }

  async function persistTemplates(templates) {
    await Storage.setItem(TEMPLATE_KEY, templates);
  }

  async function saveAsTemplate(name) {
    UI.saveCurrentToState();
    const templates = await loadTemplates();
    templates.push({
      id:   Date.now().toString(),
      name: name.trim(),
      data: {
        mainSingles: UI.mainSingles,
        datasets:    UI.datasets,
        activeIdx:   UI.activeIdx,
        language:    document.getElementById('kw-language')?.value || '',
        targets:     UI.collectTargets(),
        example:     document.getElementById('kw-example')?.value || '',
      },
    });
    await persistTemplates(templates);
    await refreshTemplateSelect();
    UI.showStatus(`テンプレート「${name}」を保存しました。`, 'success');
  }

  async function applyTemplate(id) {
    const templates = await loadTemplates();
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;

    const d = tmpl.data;
    UI.mainSingles = d.mainSingles ?? [];
    UI.datasets    = (d.datasets?.length > 0 ? d.datasets : [UI.createDataset()]).map(UI.normalizeDataset);
    UI.activeIdx   = d.activeIdx ?? 0;

    const mainContainer = document.getElementById('kw-main-singles-container');
    mainContainer.innerHTML = '';
    (UI.mainSingles.length > 0 ? UI.mainSingles : [{ label: '', value: '', secret: true }])
      .forEach(({ label, value, secret }) => UI.addSingleRow('kw-main-singles-container', label, value, secret));

    UI.datasets.forEach(ds => {
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

    UI.renderDataset();

    if (d.language) document.getElementById('kw-language').value = d.language;
    const targetsContainer = document.getElementById('kw-targets-container');
    targetsContainer.innerHTML = '';
    (d.targets?.length > 0 ? d.targets : UI.DEFAULT_GENERATE_TARGET).forEach(t => UI.addTarget(t));
    if (d.example != null) document.getElementById('kw-example').value = d.example;

    UI.debouncedSave();
    UI.showStatus(`テンプレート「${tmpl.name}」を反映しました。`, 'success');
  }

  async function deleteTemplate(id) {
    const templates = (await loadTemplates()).filter(t => t.id !== id);
    await persistTemplates(templates);
    await refreshTemplateSelect();
    await renderTemplateEditArea();
  }

  async function renameTemplate(id, newName) {
    const templates = (await loadTemplates()).map(t => t.id === id ? { ...t, name: newName.trim() } : t);
    await persistTemplates(templates);
    await refreshTemplateSelect();
    await renderTemplateEditArea();
  }

  async function refreshTemplateSelect() {
    const sel = document.getElementById('kw-template-select');
    if (!sel) return;
    const current = sel.value;
    const templates = await loadTemplates();
    sel.innerHTML = '<option value="">-- テンプレートを選択 --</option>'
      + templates.map(t => `<option value="${Utils.escapeHtml(t.id)}">${Utils.escapeHtml(t.name)}</option>`).join('');
    if (templates.find(t => t.id === current)) sel.value = current;
  }

  async function renderTemplateEditArea() {
    const area = document.getElementById('kw-template-edit-area');
    if (!area || area.style.display === 'none') return;
    const templates = await loadTemplates();
    if (templates.length === 0) {
      area.innerHTML = '<p class="kw-tmpl-empty">保存済みテンプレートはありません。</p>';
      return;
    }
    area.innerHTML = templates.map(t => `
      <div class="kw-tmpl-edit-row" data-id="${Utils.escapeHtml(t.id)}">
        <input type="text" class="kw-tmpl-name-input" value="${Utils.escapeHtml(t.name)}">
        <button class="kw-secondary-btn kw-tmpl-rename-btn">名称変更</button>
        <button class="kw-remove-btn kw-tmpl-delete-btn" title="削除">削除</button>
      </div>
    `).join('');

    area.querySelectorAll('.kw-tmpl-rename-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.kw-tmpl-edit-row');
        const newName = row.querySelector('.kw-tmpl-name-input').value.trim();
        if (!newName) { UI.showStatus('テンプレート名を入力してください。', 'warn'); return; }
        await renameTemplate(row.dataset.id, newName);
        UI.showStatus('名称を変更しました。', 'success');
      });
    });
    area.querySelectorAll('.kw-tmpl-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.kw-tmpl-edit-row');
        const templates = await loadTemplates();
        const tmpl = templates.find(t => t.id === row.dataset.id);
        if (!confirm(`テンプレート「${tmpl?.name}」を削除しますか？`)) return;
        await deleteTemplate(row.dataset.id);
        UI.showStatus('テンプレートを削除しました。', 'success');
      });
    });
  }

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
        <input type="checkbox" class="kw-export-checkbox" value="${Utils.escapeHtml(t.id)}" checked>
        <span>${Utils.escapeHtml(t.name)}</span>
      </label>
    `).join('');
  }

  function initEvents() {
    document.getElementById('kw-template-toggle-btn').addEventListener('click', () => {
      const bar = document.getElementById('kw-template-bar');
      bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
    });

    document.getElementById('kw-template-apply-btn').addEventListener('click', async () => {
      const id = document.getElementById('kw-template-select').value;
      if (!id) { UI.showStatus('テンプレートを選択してください。', 'warn'); return; }
      if (!confirm('現在の入力内容をテンプレートの内容で上書きします。よろしいですか？')) return;
      await applyTemplate(id);
    });

    document.getElementById('kw-template-save-btn').addEventListener('click', () => {
      const form     = document.getElementById('kw-template-save-form');
      const editArea = document.getElementById('kw-template-edit-area');
      const ioPanel  = document.getElementById('kw-template-io-panel');
      editArea.style.display = 'none';
      ioPanel.style.display  = 'none';
      form.style.display = form.style.display === 'none' ? 'flex' : 'none';
      if (form.style.display === 'flex') document.getElementById('kw-template-name-input').focus();
    });

    document.getElementById('kw-template-save-confirm').addEventListener('click', async () => {
      const name = document.getElementById('kw-template-name-input').value.trim();
      if (!name) { UI.showStatus('テンプレート名を入力してください。', 'warn'); return; }
      await saveAsTemplate(name);
      document.getElementById('kw-template-name-input').value = '';
      document.getElementById('kw-template-save-form').style.display = 'none';
    });

    document.getElementById('kw-template-save-cancel').addEventListener('click', () => {
      document.getElementById('kw-template-save-form').style.display = 'none';
    });

    document.getElementById('kw-template-clear-btn').addEventListener('click', () => {
      if (!confirm('すべての入力項目をクリアします。よろしいですか？')) return;
      UI.mainSingles = [];
      document.getElementById('kw-main-singles-container').innerHTML = '';
      UI.addSingleRow('kw-main-singles-container');
      UI.datasets  = [UI.createDataset()];
      UI.activeIdx = 0;
      UI.renderDataset();
      document.getElementById('kw-language').value = UI.DEFAULT_GENERATE_LANGUAGE;
      document.getElementById('kw-targets-container').innerHTML = '';
      UI.DEFAULT_GENERATE_TARGET.forEach(t => UI.addTarget(t));
      document.getElementById('kw-example').value = '';
      document.getElementById('kw-output').value  = '';
      UI.debouncedSave();
      UI.showStatus('入力項目をクリアしました。', 'success');
    });

    document.getElementById('kw-template-io-btn').addEventListener('click', async () => {
      const panel    = document.getElementById('kw-template-io-panel');
      const editArea = document.getElementById('kw-template-edit-area');
      const saveForm = document.getElementById('kw-template-save-form');
      editArea.style.display = 'none';
      saveForm.style.display = 'none';
      const next = panel.style.display === 'none' ? 'block' : 'none';
      panel.style.display = next;
      if (next === 'block') await renderExportChecklist();
    });

    document.getElementById('kw-export-select-all-btn').addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.kw-export-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => { cb.checked = !allChecked; });
      document.getElementById('kw-export-select-all-btn').textContent = allChecked ? 'すべて選択' : 'すべて解除';
    });

    document.getElementById('kw-export-btn').addEventListener('click', async () => {
      const selectedIds = new Set(
        Array.from(document.querySelectorAll('.kw-export-checkbox:checked')).map(cb => cb.value)
      );
      if (selectedIds.size === 0) { UI.showStatus('エクスポートするテンプレートを1件以上選択してください。', 'warn'); return; }
      const templates = await loadTemplates();
      const selected  = templates.filter(t => selectedIds.has(t.id));
      document.getElementById('kw-export-text').value = JSON.stringify(selected, null, 2);
      UI.showStatus(`${selected.length}件のテンプレートをエクスポートしました。`, 'success');
    });

    document.getElementById('kw-export-copy-btn').addEventListener('click', () => {
      const text = document.getElementById('kw-export-text').value;
      if (!text.trim()) { UI.showStatus('先にエクスポートボタンを押してください。', 'warn'); return; }
      navigator.clipboard.writeText(text).then(() => UI.showStatus('クリップボードにコピーしました。', 'success'));
    });

    document.getElementById('kw-import-btn').addEventListener('click', async () => {
      const raw = document.getElementById('kw-import-text').value.trim();
      if (!raw) { UI.showStatus('JSONを入力してください。', 'warn'); return; }
      let imported;
      try {
        imported = JSON.parse(raw);
      } catch (_) {
        UI.showStatus('JSONの形式が正しくありません。', 'error'); return;
      }
      if (!Array.isArray(imported)) { UI.showStatus('テンプレートの配列形式である必要があります。', 'error'); return; }
      const TEMPLATE_ID_RE    = /^[\w\-]{1,64}$/;
      const TEMPLATE_NAME_MAX = 100;
      const valid = imported.filter(t =>
        typeof t.id   === 'string' && TEMPLATE_ID_RE.test(t.id) &&
        typeof t.name === 'string' && t.name.trim().length > 0 && t.name.length <= TEMPLATE_NAME_MAX &&
        t.data !== null && typeof t.data === 'object' && !Array.isArray(t.data)
      );
      if (valid.length === 0) { UI.showStatus('有効なテンプレートが見つかりませんでした。', 'warn'); return; }
      const existing    = await loadTemplates();
      const existingIds = new Set(existing.map(t => t.id));
      const merged = [...existing];
      let added = 0, updated = 0;
      valid.forEach(t => {
        if (existingIds.has(t.id)) { merged[merged.findIndex(e => e.id === t.id)] = t; updated++; }
        else { merged.push(t); added++; }
      });
      await persistTemplates(merged);
      await refreshTemplateSelect();
      document.getElementById('kw-import-text').value = '';
      UI.showStatus(`インポート完了：新規 ${added}件、更新 ${updated}件`, 'success');
    });

    document.getElementById('kw-template-edit-btn').addEventListener('click', async () => {
      const editArea = document.getElementById('kw-template-edit-area');
      const form     = document.getElementById('kw-template-save-form');
      const ioPanel  = document.getElementById('kw-template-io-panel');
      form.style.display    = 'none';
      ioPanel.style.display = 'none';
      const next = editArea.style.display === 'none' ? 'block' : 'none';
      editArea.style.display = next;
      if (next === 'block') await renderTemplateEditArea();
    });
  }

  return { initEvents, refreshTemplateSelect };
})();
