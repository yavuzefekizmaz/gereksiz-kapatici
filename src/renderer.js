// Voldena UI Renderer Logic
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.voldenaAPI;

  // State arrays for Modal Tag Pickers
  let closeTargetsState = [];
  let launchTargetsState = [];
  let detailedProcessesCache = [];
  let selectedChecklistApps = new Set();

  // Custom Toast Notification System
  const showToast = (message, iconClass = 'fa-solid fa-circle-check') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="${iconClass}" style="color: var(--primary);"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 4000);
  };

  // Window Controls
  document.getElementById('btn-minimize')?.addEventListener('click', () => api.minimizeWindow());
  document.getElementById('btn-maximize')?.addEventListener('click', () => api.maximizeWindow());
  document.getElementById('btn-close')?.addEventListener('click', () => api.closeWindow());

  // Navigation Tabs
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      navItems.forEach(n => n.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      item.classList.add('active');
      const targetContent = document.getElementById(`tab-${tab}`);
      if (targetContent) targetContent.classList.add('active');
    });
  });

  // Render Memory Stats
  const updateMemoryUI = (stats) => {
    if (!stats) return;
    const usedGb = (stats.used / 1024).toFixed(1);
    const totalGb = (stats.total / 1024).toFixed(1);

    document.getElementById('val-ram-used').innerHTML = `${usedGb} <span class="metric-unit">GB / ${totalGb} GB</span>`;
    document.getElementById('val-ram-total').textContent = `${totalGb} GB`;
    document.getElementById('val-ram-percent').textContent = `${stats.percent}%`;
    document.getElementById('bar-ram-fill').style.width = `${stats.percent}%`;
  };

  const initialMemory = await api.getMemoryStats();
  updateMemoryUI(initialMemory);

  api.onMemoryUpdate((stats) => {
    updateMemoryUI(stats);
  });

  // Manual Actions
  document.getElementById('btn-quick-ram')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-quick-ram');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Temizleniyor...';
    await api.optimizeRam('low');
    const newStats = await api.getMemoryStats();
    updateMemoryUI(newStats);
    btn.innerHTML = '<i class="fa-solid fa-check"></i> RAM Temizlendi!';
    showToast('RAM çalışma kümesi (WorkingSet) başarıyla temizlendi.');
    setTimeout(() => {
      btn.innerHTML = '<i class="fa-solid fa-broom"></i> RAM\'i Anında Temizle (WorkingSet Trim)';
    }, 2000);
  });

  document.getElementById('btn-emergency-explorer')?.addEventListener('click', async () => {
    await api.startExplorer();
    showToast('Explorer.exe kabuğu yeniden başlatıldı.', 'fa-solid fa-window-restore');
  });

  // Status Change Listener
  api.onStatusChange((data) => {
    const dot = document.getElementById('status-dot');
    const statusLabel = document.getElementById('status-label');
    const ruleNameVal = document.getElementById('val-active-rule-name');
    const ruleSubVal = document.getElementById('val-active-rule-sub');

    if (data.status === 'active') {
      dot.className = 'status-dot active-game';
      statusLabel.textContent = `Ultra Oyun Modu: ${data.activeRule.alias || data.activeRule.name}`;
      ruleNameVal.textContent = data.activeRule.alias || data.activeRule.name;
      ruleNameVal.style.color = 'var(--danger)';
      ruleSubVal.textContent = `CPU Önceliği YÜKSEK • Kapatılan uygulama: ${data.closedApps ? data.closedApps.length : 0}`;
    } else {
      dot.className = 'status-dot';
      statusLabel.textContent = 'Arka Plan İzleniyor';
      ruleNameVal.textContent = 'Sistem Boşta';
      ruleNameVal.style.color = 'var(--primary)';
      ruleSubVal.textContent = 'Şu an arka planda izlenen oyun yok.';
    }
  });

  // Tag Picker Render Helper
  const renderPills = (containerId, itemsArray, onRemove) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    itemsArray.forEach((item, idx) => {
      const pill = document.createElement('div');
      pill.className = 'app-pill';
      pill.innerHTML = `
        <span>${item}</span>
        <i class="fa-solid fa-xmark app-pill-remove" data-idx="${idx}"></i>
      `;
      pill.querySelector('.app-pill-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(idx);
      });
      container.appendChild(pill);
    });
  };

  // Process Checklist Modal Logic
  const modalChecklist = document.getElementById('modal-checklist');
  const checklistContainer = document.getElementById('checklist-items-container');
  const inputChecklistFilter = document.getElementById('input-checklist-filter');
  const selectedCountLabel = document.getElementById('checklist-selected-count');

  const renderChecklistItems = (filterText = '') => {
    if (!checklistContainer) return;
    checklistContainer.innerHTML = '';

    const filter = filterText.toLowerCase().trim();
    const filtered = detailedProcessesCache.filter(p => p.name.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      checklistContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted); font-size: 13px; text-align: center;">Eşleşen arka plan süreci bulunamadı.</div>';
      return;
    }

    filtered.forEach(p => {
      const item = document.createElement('div');
      item.className = 'checklist-item';
      const isChecked = selectedChecklistApps.has(p.name);

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <input type="checkbox" class="chk-process-item" data-name="${p.name}" ${isChecked ? 'checked' : ''}>
          <div class="checklist-item-title">${p.name}</div>
        </div>
        <div class="checklist-item-ram">${p.memoryMb} MB RAM</div>
      `;

      const chk = item.querySelector('.chk-process-item');
      item.addEventListener('click', (e) => {
        if (e.target !== chk) {
          chk.checked = !chk.checked;
        }
        if (chk.checked) {
          selectedChecklistApps.add(p.name);
        } else {
          selectedChecklistApps.delete(p.name);
        }
        selectedCountLabel.textContent = `${selectedChecklistApps.size} uygulama seçildi`;
      });

      checklistContainer.appendChild(item);
    });

    selectedCountLabel.textContent = `${selectedChecklistApps.size} uygulama seçildi`;
  };

  document.getElementById('btn-open-checklist-close')?.addEventListener('click', async () => {
    modalChecklist.classList.add('active');
    checklistContainer.innerHTML = '<div style="padding: 20px; color: var(--text-muted); font-size: 13px; text-align: center;"><i class="fa-solid fa-spinner fa-spin"></i> Çalışan Windows süreçleri yükleniyor...</div>';
    
    detailedProcessesCache = await api.getDetailedProcesses();
    selectedChecklistApps = new Set(closeTargetsState);
    renderChecklistItems('');
  });

  inputChecklistFilter?.addEventListener('input', (e) => {
    renderChecklistItems(e.target.value);
  });

  document.getElementById('btn-checklist-select-all')?.addEventListener('click', () => {
    detailedProcessesCache.forEach(p => selectedChecklistApps.add(p.name));
    renderChecklistItems(inputChecklistFilter.value);
  });

  document.getElementById('btn-checklist-clear')?.addEventListener('click', () => {
    selectedChecklistApps.clear();
    renderChecklistItems(inputChecklistFilter.value);
  });

  const closeChecklistModal = () => modalChecklist.classList.remove('active');
  document.getElementById('btn-close-checklist')?.addEventListener('click', closeChecklistModal);
  document.getElementById('btn-cancel-checklist')?.addEventListener('click', closeChecklistModal);

  document.getElementById('btn-apply-checklist')?.addEventListener('click', () => {
    closeTargetsState = Array.from(selectedChecklistApps);
    renderPills('pills-close-list', closeTargetsState, (idx) => {
      closeTargetsState.splice(idx, 1);
      renderPills('pills-close-list', closeTargetsState, arguments.callee);
    });
    showToast(`${closeTargetsState.length} adet uygulama kurala eklendi.`);
    closeChecklistModal();
  });

  // File Browser Dialog Triggers
  document.getElementById('btn-browse-trigger-exe')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      const filename = selected.split('\\').pop().split('/').pop();
      document.getElementById('rule-form-trigger').value = filename || selected;
      showToast(`.exe dosyası seçildi: ${filename}`);
    }
  });

  document.getElementById('btn-browse-launch-exe')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      if (!launchTargetsState.includes(selected)) {
        launchTargetsState.push(selected);
        renderPills('pills-launch-list', launchTargetsState, (idx) => {
          launchTargetsState.splice(idx, 1);
          renderPills('pills-launch-list', launchTargetsState, arguments.callee);
        });
        showToast(`Açılacaklara eklendi: ${selected}`);
      }
    }
  });

  // Modal 1 Setup (Rule Creation / Edit)
  const modal = document.getElementById('modal-rule');
  const modalTitle = document.getElementById('modal-rule-title');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSaveRule = document.getElementById('btn-save-rule');
  const editingIdInput = document.getElementById('rule-form-editing-id');
  const chkKeepExplorer = document.getElementById('rule-form-keep-explorer');

  const openModal = async (ruleToEdit = null) => {
    modal.classList.add('active');

    if (ruleToEdit) {
      modalTitle.textContent = 'Kuralı / Oyun Ayarını Düzenle';
      editingIdInput.value = ruleToEdit.id;
      document.getElementById('rule-form-name').value = ruleToEdit.name || '';
      document.getElementById('rule-form-trigger').value = ruleToEdit.triggerProcess || '';
      document.getElementById('rule-form-level').value = ruleToEdit.optimizationLevel || 'medium';
      if (chkKeepExplorer) chkKeepExplorer.checked = !!ruleToEdit.keepExplorer;
      
      closeTargetsState = [...(ruleToEdit.closeTargets || [])];
      launchTargetsState = [...(ruleToEdit.launchTargets || [])];
    } else {
      modalTitle.textContent = 'Yeni Kural / Oyun Ayarı';
      editingIdInput.value = '';
      document.getElementById('rule-form-name').value = '';
      document.getElementById('rule-form-trigger').value = '';
      document.getElementById('rule-form-level').value = 'medium';
      if (chkKeepExplorer) chkKeepExplorer.checked = false;
      
      closeTargetsState = [];
      launchTargetsState = [];
    }

    renderPills('pills-close-list', closeTargetsState, (idx) => {
      closeTargetsState.splice(idx, 1);
      renderPills('pills-close-list', closeTargetsState, arguments.callee);
    });

    renderPills('pills-launch-list', launchTargetsState, (idx) => {
      launchTargetsState.splice(idx, 1);
      renderPills('pills-launch-list', launchTargetsState, arguments.callee);
    });
  };

  const closeModal = () => modal.classList.remove('active');
  btnCloseModal?.addEventListener('click', closeModal);
  btnCancelModal?.addEventListener('click', closeModal);

  document.querySelectorAll('.btn-open-modal-trigger').forEach(btn => {
    btn.addEventListener('click', () => openModal(null));
  });

  btnSaveRule?.addEventListener('click', async () => {
    const editingId = editingIdInput.value;
    const name = document.getElementById('rule-form-name').value.trim();
    const trigger = document.getElementById('rule-form-trigger').value.trim();
    const level = document.getElementById('rule-form-level').value;
    const keepExp = chkKeepExplorer ? chkKeepExplorer.checked : false;

    if (!name || !trigger) {
      alert('Lütfen kural adı ve tetikleyici süreç adını doldurun.');
      return;
    }

    const ruleData = {
      name,
      triggerProcess: trigger,
      alias: name,
      enabled: true,
      closeTargets: closeTargetsState,
      launchTargets: launchTargetsState,
      optimizationLevel: level,
      keepExplorer: keepExp
    };

    if (editingId) {
      await api.updateRule(editingId, ruleData);
      showToast(`${name} kuralı güncellendi.`);
    } else {
      await api.addRule(ruleData);
      showToast(`${name} kuralı eklendi.`);
    }

    closeModal();
    renderRules();
  });

  // Rules Rendering & Logic
  const renderRules = async () => {
    const rules = await api.getRules();
    const summaryContainer = document.getElementById('dashboard-rules-summary');
    const optContainer = document.getElementById('game-optimization-rules');
    const launchContainer = document.getElementById('launch-settings-rules');

    if (summaryContainer) summaryContainer.innerHTML = '';
    if (optContainer) optContainer.innerHTML = '';
    if (launchContainer) launchContainer.innerHTML = '';

    if (rules.length === 0) {
      if (summaryContainer) summaryContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Kural bulunmuyor.</div>';
      if (optContainer) optContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Henüz oyun optimizasyonu eklenmemiş.</div>';
      if (launchContainer) launchContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 13px;">Henüz açılış tetikleyicisi eklenmemiş.</div>';
      return;
    }

    rules.forEach(rule => {
      const levelBadge = rule.optimizationLevel === 'high'
        ? `<span class="badge badge-high">Sert Ultra FPS ${rule.keepExplorer ? '(Explorer Açık)' : ''}</span>`
        : rule.optimizationLevel === 'medium'
        ? '<span class="badge badge-medium">Orta Mod</span>'
        : '<span class="badge badge-low">Düşük Mod</span>';

      const ruleHTML = `
        <div class="rule-item">
          <div class="rule-info">
            <div class="rule-name">${rule.name}</div>
            <div class="rule-details">
              <span>Tetikleyici: <strong>${rule.triggerProcess}</strong></span>
              ${rule.closeTargets && rule.closeTargets.length > 0 ? `<span>• Kapatılacaklar: ${rule.closeTargets.length} adet</span>` : ''}
              ${rule.launchTargets && rule.launchTargets.length > 0 ? `<span>• Açılacaklar: ${rule.launchTargets.length} adet</span>` : ''}
              <span>•</span>
              ${levelBadge}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn btn-secondary btn-edit-rule" data-id="${rule.id}" style="padding: 6px 10px; color: var(--primary);" title="Kuralı Düzenle">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <label class="switch">
              <input type="checkbox" class="toggle-rule" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <button class="btn btn-secondary btn-delete-rule" data-id="${rule.id}" style="padding: 6px 10px; color: var(--danger);" title="Kuralı Sil">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;

      // Summary for Dashboard
      if (summaryContainer) {
        const summaryEl = document.createElement('div');
        summaryEl.className = 'rule-item interactive';
        summaryEl.style.padding = '12px 16px';
        summaryEl.setAttribute('data-id', rule.id);
        summaryEl.innerHTML = `
          <div class="rule-info">
            <div style="font-weight: 700; font-size: 14px; color: #fff;">${rule.name}</div>
            <div style="font-size: 11.5px; color: var(--text-muted);">Süreç: ${rule.triggerProcess} • Düzenlemek için tıklayın</div>
          </div>
          ${levelBadge}
        `;
        summaryEl.addEventListener('click', () => {
          openModal(rule);
        });
        summaryContainer.appendChild(summaryEl);
      }

      // Populate Optimization tab
      if (optContainer && (rule.closeTargets && rule.closeTargets.length > 0 || rule.optimizationLevel !== 'low')) {
        const div = document.createElement('div');
        div.innerHTML = ruleHTML;
        optContainer.appendChild(div.firstElementChild);
      }

      // Populate Launch Settings tab
      if (launchContainer) {
        const div = document.createElement('div');
        div.innerHTML = ruleHTML;
        launchContainer.appendChild(div.firstElementChild);
      }
    });

    // Attach Edit Listeners
    document.querySelectorAll('.btn-edit-rule').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        const rulesList = await api.getRules();
        const target = rulesList.find(r => r.id === id);
        if (target) {
          openModal(target);
        }
      });
    });

    // Attach Toggle & Delete Listeners
    document.querySelectorAll('.toggle-rule').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        const id = e.target.getAttribute('data-id');
        const rulesList = await api.getRules();
        const target = rulesList.find(r => r.id === id);
        if (target) {
          target.enabled = e.target.checked;
          await api.updateRule(id, target);
        }
      });
    });

    document.querySelectorAll('.btn-delete-rule').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = btn.getAttribute('data-id');
        if (confirm('Bu kuralı silmek istediğinize emin misiniz?')) {
          await api.deleteRule(id);
          showToast('Kural silindi.', 'fa-solid fa-trash');
          renderRules();
        }
      });
    });
  };

  await renderRules();

  // Presets Tab Selection
  const settings = await api.getSettings();
  let currentPreset = settings.activePreset || 'medium';

  const updatePresetCardsUI = (selectedLevel) => {
    document.querySelectorAll('.preset-card').forEach(card => {
      if (card.getAttribute('data-preset') === selectedLevel) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    const badgeVal = document.getElementById('val-active-preset-badge');
    if (selectedLevel === 'high') {
      badgeVal.innerHTML = '<span class="badge badge-high" style="font-size: 16px; padding: 6px 14px;">Sert Ultra FPS Modu</span>';
    } else if (selectedLevel === 'low') {
      badgeVal.innerHTML = '<span class="badge badge-low" style="font-size: 16px; padding: 6px 14px;">Düşük Mod</span>';
    } else {
      badgeVal.innerHTML = '<span class="badge badge-medium" style="font-size: 16px; padding: 6px 14px;">Orta Mod</span>';
    }
  };

  updatePresetCardsUI(currentPreset);

  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', async () => {
      const level = card.getAttribute('data-preset');
      currentPreset = level;
      updatePresetCardsUI(level);
      await api.updateSettings({ activePreset: level });
      showToast(`Optimizasyon seviyesi ${level.toUpperCase()} olarak değiştirildi.`);
    });
  });

  // Protected Apps Logic
  const renderProtectedApps = async () => {
    const apps = await api.getProtectedApps();
    const container = document.getElementById('protected-apps-list');
    if (!container) return;
    container.innerHTML = '';

    apps.forEach(app => {
      const tag = document.createElement('div');
      tag.style.cssText = 'background: rgba(0, 242, 254, 0.1); border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 20px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; display: flex; align-items: center; gap: 8px;';
      tag.innerHTML = `
        <i class="fa-solid fa-shield" style="color: var(--primary);"></i>
        <span>${app}</span>
        <i class="fa-solid fa-xmark remove-protected" data-app="${app}" style="cursor: pointer; opacity: 0.7;"></i>
      `;
      container.appendChild(tag);
    });

    document.querySelectorAll('.remove-protected').forEach(icon => {
      icon.addEventListener('click', async (e) => {
        const appName = icon.getAttribute('data-app');
        const currentList = await api.getProtectedApps();
        const updated = currentList.filter(a => a !== appName);
        await api.updateProtectedApps(updated);
        showToast(`${appName} korumalı listeden çıkarıldı.`);
        renderProtectedApps();
      });
    });
  };

  await renderProtectedApps();

  document.getElementById('btn-add-protected')?.addEventListener('click', async () => {
    const input = document.getElementById('input-protected-app');
    const val = input.value.trim().toLowerCase();
    if (!val) return;

    const currentList = await api.getProtectedApps();
    if (!currentList.includes(val)) {
      currentList.push(val);
      await api.updateProtectedApps(currentList);
      showToast(`${val} korumalı listeye eklendi.`);
      renderProtectedApps();
    }
    input.value = '';
  });

  // Settings Toggles
  const chkAutostart = document.getElementById('setting-autostart');
  const chkMinimized = document.getElementById('setting-minimized');
  const chkNotifications = document.getElementById('setting-notifications');
  const chkAutoRestore = document.getElementById('setting-auto-restore');
  const chkSmartSweep = document.getElementById('setting-smart-sweep');

  chkAutostart.checked = !!settings.autoStartOnBoot;
  chkMinimized.checked = !!settings.startMinimized;
  chkNotifications.checked = !!settings.notifyOnAction;
  if (chkAutoRestore) chkAutoRestore.checked = settings.autoRestoreOnExit !== false;
  if (chkSmartSweep) chkSmartSweep.checked = !!settings.smartSweep;

  chkAutostart.addEventListener('change', (e) => api.updateSettings({ autoStartOnBoot: e.target.checked }));
  chkMinimized.addEventListener('change', (e) => api.updateSettings({ startMinimized: e.target.checked }));
  chkNotifications.addEventListener('change', (e) => api.updateSettings({ notifyOnAction: e.target.checked }));
  chkAutoRestore?.addEventListener('change', (e) => api.updateSettings({ autoRestoreOnExit: e.target.checked }));
  chkSmartSweep?.addEventListener('change', (e) => {
    api.updateSettings({ smartSweep: e.target.checked });
    showToast(e.target.checked ? 'Smart-Sweep arka plan temizleyici aktifleştirildi.' : 'Smart-Sweep devre dışı bırakıldı.');
  });
});
