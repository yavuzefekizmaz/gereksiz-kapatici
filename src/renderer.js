// Voldena UI Renderer Logic
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.voldenaAPI;

  const renderUpdateStatus = state => {
    document.getElementById('update-version').textContent = `Mevcut sürüm: ${state.currentVersion}`;
    document.getElementById('update-message').textContent = state.message;
    document.getElementById('btn-check-update').disabled = ['unsupported', 'checking', 'downloading', 'downloaded', 'installing'].includes(state.status);
    document.getElementById('btn-download-update').hidden = state.status !== 'available';
    document.getElementById('btn-install-update').hidden = state.status !== 'downloaded';
  };
  api.onUpdateStatus(renderUpdateStatus);
  document.getElementById('btn-check-update').addEventListener('click', async () => renderUpdateStatus(await api.checkForUpdates()));
  document.getElementById('btn-download-update').addEventListener('click', async () => renderUpdateStatus(await api.downloadUpdate()));
  document.getElementById('btn-install-update').addEventListener('click', async () => renderUpdateStatus(await api.installUpdate()));
  document.getElementById('btn-release-page').addEventListener('click', () => api.openReleasePage());
  try { renderUpdateStatus(await api.getUpdateStatus()); } catch (err) { console.error(err); }

  try {
    const report = await api.getLastOptimizationReport();
    const summary = document.getElementById('last-optimization-summary');
    if (report) {
      const closed = (report.killed || []).join(', ') || 'yok';
      const failed = (report.failed || []).join(', ') || 'yok';
      const skipped = (report.skipped || []).filter(Boolean).join(', ') || 'yok';
      summary.textContent = `Son işlem — Kapanan: ${closed}. Kapatılamayan: ${failed}. Atlanan: ${skipped}.`;
    } else summary.textContent = 'Henüz tamamlanmış bir oyun işlemi yok.';
  } catch (err) { console.error(err); }

  // Global State
  let closeTargetsState = [];
  let launchTargetsState = [];
  let cachedPopularApps = [];
  let cachedInstalledApps = [];
  let cachedRunningApps = [];
  let cachedDiscoveredGames = [];
  let selectedInPicker = new Set();
  let pickerTargetMode = 'close'; // 'close', 'launch', 'trigger', 'protected'
  let pickerActiveTab = 'popular';

  // Toast Notification System (Anti-Spam Throttled & Max 3 Visible)
  let lastToastMsg = '';
  let lastToastTime = 0;

  const showToast = (message, iconClass = 'fa-solid fa-circle-check') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const now = Date.now();
    if (message === lastToastMsg && (now - lastToastTime < 2200)) {
      return; // Ignore duplicate spam
    }
    lastToastMsg = message;
    lastToastTime = now;

    // Limit to max 3 toasts on screen simultaneously
    while (container.children.length >= 3) {
      container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="${iconClass}" style="color: var(--primary);"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3200);
  };

  // Custom Dark Confirmation & Alert Dialog System
  const showConfirmDialog = ({
    title = 'Onay Gerekli',
    message = 'Bu işlemi gerçekleştirmek istediğinize emin misiniz?',
    icon = 'fa-solid fa-triangle-exclamation',
    confirmText = 'Evet, Devam Et',
    cancelText = 'Vazgeç',
    type = 'danger', // 'danger', 'warning', 'info', 'success'
    isAlert = false
  } = {}) => {
    return new Promise((resolve) => {
      const modal = document.getElementById('modal-confirm');
      const box = modal?.querySelector('.modal-box-confirm');
      const titleEl = document.getElementById('confirm-dialog-title');
      const msgEl = document.getElementById('confirm-dialog-message');
      const iconBox = document.getElementById('confirm-dialog-icon');
      const btnCancel = document.getElementById('btn-confirm-cancel');
      const btnAccept = document.getElementById('btn-confirm-accept');

      if (!modal || !titleEl || !msgEl || !btnAccept || !btnCancel) {
        resolve(window.confirm(message.replace(/<[^>]*>/g, '')));
        return;
      }

      titleEl.textContent = title;
      msgEl.innerHTML = message;

      if (box) {
        box.className = `modal-box modal-box-confirm theme-${type}`;
      }

      if (iconBox) {
        iconBox.className = `confirm-icon-box type-${type}`;
        iconBox.innerHTML = `<i class="${icon}"></i>`;
      }

      btnAccept.className = `btn btn-${type}`;
      if (isAlert) {
        btnCancel.style.display = 'none';
        btnAccept.innerHTML = `<i class="fa-solid fa-check"></i> ${confirmText || 'Tamam'}`;
      } else {
        btnCancel.style.display = 'inline-flex';
        btnCancel.textContent = cancelText || 'Vazgeç';
        const iconPrefix = type === 'danger' ? '<i class="fa-solid fa-trash"></i> ' : '<i class="fa-solid fa-check"></i> ';
        btnAccept.innerHTML = `${iconPrefix}${confirmText}`;
      }

      modal.classList.add('active');

      let resolved = false;
      const cleanUp = (result) => {
        if (resolved) return;
        resolved = true;
        modal.classList.remove('active');
        btnAccept.removeEventListener('click', onAccept);
        btnCancel.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKeyDown);
        modal.removeEventListener('click', onOverlayClick);
        resolve(result);
      };

      const onAccept = (e) => { e?.stopPropagation(); cleanUp(true); };
      const onCancel = (e) => { e?.stopPropagation(); cleanUp(false); };
      const onOverlayClick = (e) => {
        if (e.target === modal) cleanUp(false);
      };
      const onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanUp(false);
        } else if (e.key === 'Enter' && !e.repeat) {
          e.preventDefault();
          cleanUp(true);
        }
      };

      btnAccept.addEventListener('click', onAccept);
      btnCancel.addEventListener('click', onCancel);
      modal.addEventListener('click', onOverlayClick);
      document.addEventListener('keydown', onKeyDown);
    });
  };

  const showAlertDialog = (message, title = 'Bilgi', type = 'info', icon = null) => {
    let iconClass = icon;
    if (!iconClass) {
      if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation';
      else if (type === 'danger') iconClass = 'fa-solid fa-circle-exclamation';
      else if (type === 'success') iconClass = 'fa-solid fa-circle-check';
      else iconClass = 'fa-solid fa-circle-info';
    }
    return showConfirmDialog({
      title,
      message,
      icon: iconClass,
      confirmText: 'Tamam',
      type,
      isAlert: true
    });
  };

  // Update Admin Badge in Titlebar
  const updateAdminStatusUI = async () => {
    try {
      if (api.isAdmin) {
        const isAdmin = await api.isAdmin();
        const badge = document.getElementById('titlebar-admin-badge');
        if (badge) {
          if (isAdmin) {
            badge.className = 'brand-tag brand-admin';
            badge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> YÖNETİCİ MODU';
            badge.title = 'Tüm süreç ve hizmetler tek seferde yönetici olarak kontrol ediliyor';
          } else {
            badge.className = 'brand-tag brand-admin standard';
            badge.innerHTML = '<i class="fa-solid fa-user"></i> STANDART MOD';
            badge.title = 'Uygulama standart kullanıcı haklarıyla çalışıyor';
          }
        }
      }
    } catch (e) {}
  };
  updateAdminStatusUI();

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

  // Live Memory Stats Update
  const updateMemoryUI = (stats) => {
    if (!stats) return;
    const usedGb = (stats.used / 1024).toFixed(1);
    const totalGb = (stats.total / 1024).toFixed(1);

    const ramUsedEl = document.getElementById('val-ram-used');
    const ramTotalEl = document.getElementById('val-ram-total');
    const ramPercentEl = document.getElementById('val-ram-percent');
    const barRamFill = document.getElementById('bar-ram-fill');

    if (ramUsedEl) ramUsedEl.innerHTML = `${usedGb} <span class="metric-unit">GB / ${totalGb} GB</span>`;
    if (ramTotalEl) ramTotalEl.textContent = `${totalGb} GB`;
    if (ramPercentEl) ramPercentEl.textContent = `${stats.percent}%`;
    if (barRamFill) barRamFill.style.width = `${stats.percent}%`;
  };

  try {
    const initialMemory = await api.getMemoryStats();
    updateMemoryUI(initialMemory);
  } catch (e) {}

  api.onMemoryUpdate((stats) => {
    updateMemoryUI(stats);
  });

  // Quick Action Buttons
  document.getElementById('btn-quick-ram')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-quick-ram');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Temizleniyor...';
    
    try {
      const res = await api.optimizeRam('low');
      await showAlertDialog(res.message, 'RAM Yönetimi', 'info', 'fa-solid fa-shield-halved');
    } catch (err) {
      await showAlertDialog('RAM temizliği sırasında bir hata oluştu: ' + err.message, 'Hata', 'danger');
    }

    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1000);
  });

  document.getElementById('btn-emergency-explorer')?.addEventListener('click', async () => {
    await api.startExplorer();
    showToast('Explorer.exe kabuğu yeniden başlatıldı.', 'fa-solid fa-window-restore');
  });

  // Initial Status Check on App Load
  try {
    const initialStatus = await api.getStatus();
    if (initialStatus && initialStatus.activeRule) {
      const dot = document.getElementById('status-dot');
      const statusLabel = document.getElementById('status-label');
      const ruleNameVal = document.getElementById('val-active-rule-name');
      const ruleSubVal = document.getElementById('val-active-rule-sub');
      if (dot) dot.className = 'status-dot active-game';
      if (statusLabel) statusLabel.textContent = `Oyun Modu: ${initialStatus.activeRule.alias || initialStatus.activeRule.name}`;
      if (ruleNameVal) {
        ruleNameVal.textContent = initialStatus.activeRule.alias || initialStatus.activeRule.name;
        ruleNameVal.style.color = 'var(--danger)';
      }
      if (ruleSubVal) {
        ruleSubVal.textContent = `Normal Kapatma • Kapatılan: ${initialStatus.closedApps ? initialStatus.closedApps.length : 0} uygulama`;
      }
    }
  } catch (e) {}

  // Status Change Listener
  api.onStatusChange((data) => {
    const dot = document.getElementById('status-dot');
    const statusLabel = document.getElementById('status-label');
    const ruleNameVal = document.getElementById('val-active-rule-name');
    const ruleSubVal = document.getElementById('val-active-rule-sub');

    if (data.status === 'active') {
      if (dot) dot.className = 'status-dot active-game';
      if (statusLabel) statusLabel.textContent = `Oyun Modu: ${data.activeRule.alias || data.activeRule.name}`;
      if (ruleNameVal) {
        ruleNameVal.textContent = data.activeRule.alias || data.activeRule.name;
        ruleNameVal.style.color = 'var(--danger)';
      }
      if (ruleSubVal) {
        ruleSubVal.textContent = `Normal Kapatma • Kapatılan: ${data.closedApps ? data.closedApps.length : 0} uygulama ${data.isAutoDetected ? '(Otomatik Oyun Algılama)' : ''}`;
      }
    } else {
      if (dot) dot.className = 'status-dot';
      if (statusLabel) statusLabel.textContent = 'Arka Plan İzleniyor';
      if (ruleNameVal) {
        ruleNameVal.textContent = 'Sistem Boşta';
        ruleNameVal.style.color = 'var(--text-main)';
      }
      if (ruleSubVal) {
        ruleSubVal.textContent = 'Şu an arka planda izlenen aktif oyun yok.';
      }
    }
  });

  // Tag Pills Renderer
  const renderPills = (containerId, itemsArray, onRemoveCallback) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (itemsArray.length === 0) {
      container.innerHTML = '<span style="color: var(--text-dim); font-size: 12px; padding: 4px 6px;">Henüz uygulama eklenmedi.</span>';
      return;
    }

    itemsArray.forEach((item, idx) => {
      const pill = document.createElement('div');
      pill.className = 'app-pill';
      
      const isUrl = item.startsWith('http://') || item.startsWith('https://');
      const iconClass = isUrl ? 'fa-solid fa-link' : 'fa-solid fa-cube';

      pill.innerHTML = `
        <i class="${iconClass}" style="font-size: 11px; opacity: 0.7;"></i>
        <span>${item}</span>
        <i class="fa-solid fa-xmark app-pill-remove" title="Listeden Çıkar"></i>
      `;

      pill.querySelector('.app-pill-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        onRemoveCallback(idx);
      });

      container.appendChild(pill);
    });
  };

  const updateCloseTargetsPills = () => {
    renderPills('pills-close-list', closeTargetsState, (idx) => {
      closeTargetsState.splice(idx, 1);
      updateCloseTargetsPills();
    });
  };

  const updateLaunchTargetsPills = () => {
    renderPills('pills-launch-list', launchTargetsState, (idx) => {
      launchTargetsState.splice(idx, 1);
      updateLaunchTargetsPills();
    });
  };

  // Manual Add Handlers inside Rule Modal
  document.getElementById('btn-add-manual-close')?.addEventListener('click', () => {
    const input = document.getElementById('input-manual-close');
    const val = input.value.trim();
    if (!val) return;

    const clean = val.endsWith('.exe') || val.includes('\\') || val.includes('/') ? val : `${val}.exe`;
    if (!closeTargetsState.includes(clean)) {
      closeTargetsState.push(clean);
      updateCloseTargetsPills();
      showToast(`${clean} kapatılacaklara eklendi.`);
    }
    input.value = '';
  });

  document.getElementById('input-manual-close')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-add-manual-close').click();
    }
  });

  document.getElementById('btn-add-manual-launch')?.addEventListener('click', () => {
    const input = document.getElementById('input-manual-launch');
    const val = input.value.trim();
    if (!val) return;

    if (!launchTargetsState.includes(val)) {
      launchTargetsState.push(val);
      updateLaunchTargetsPills();
      showToast(`${val} açılacaklara eklendi.`);
    }
    input.value = '';
  });

  document.getElementById('input-manual-launch')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-add-manual-launch').click();
    }
  });

  // File Browser Buttons in Rule Modal
  document.getElementById('btn-browse-trigger-exe')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      const filename = selected.split('\\').pop().split('/').pop();
      document.getElementById('rule-form-trigger').value = filename || selected;
      showToast(`Tetikleyici seçildi: ${filename}`);
    }
  });

  document.getElementById('btn-browse-close-exe')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      const filename = selected.split('\\').pop().split('/').pop();
      const target = filename || selected;
      if (!closeTargetsState.includes(target)) {
        closeTargetsState.push(target);
        updateCloseTargetsPills();
        showToast(`Kapatılacaklara eklendi: ${target}`);
      }
    }
  });

  document.getElementById('btn-browse-launch-exe')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      if (!launchTargetsState.includes(selected)) {
        launchTargetsState.push(selected);
        updateLaunchTargetsPills();
        showToast(`Açılacaklara eklendi: ${selected}`);
      }
    }
  });

  // ==========================================
  // DISCOVERED GAMES & AUTO GAME ENGINE
  // ==========================================
  const renderDiscoveredGames = (filter = '') => {
    const container = document.getElementById('discovered-games-container');
    const countLabel = document.getElementById('count-discovered-games');
    if (!container) return;
    container.innerHTML = '';

    const filterText = filter.toLowerCase().trim();
    const filtered = cachedDiscoveredGames.filter(g => 
      g.name.toLowerCase().includes(filterText) || g.path.toLowerCase().includes(filterText) || (g.platform && g.platform.toLowerCase().includes(filterText))
    );

    if (countLabel) countLabel.textContent = cachedDiscoveredGames.length;

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-dim); font-size: 13px;">Eşleşen oyun bulunamadı. "Kütüphaneleri Otomatik Tara" butonuna basabilir veya eksik oyununuzu manuel ekleyebilirsiniz.</div>';
      return;
    }

    filtered.forEach(game => {
      const card = document.createElement('div');
      card.className = 'discovered-game-card';

      let platformClass = 'platform-custom';
      const platLower = (game.platform || '').toLowerCase();
      if (platLower.includes('steam')) platformClass = 'platform-steam';
      else if (platLower.includes('epic')) platformClass = 'platform-epic';
      else if (platLower.includes('riot')) platformClass = 'platform-riot';
      else if (platLower.includes('xbox')) platformClass = 'platform-xbox';

      card.innerHTML = `
        <div class="discovered-game-left">
          <div class="discovered-game-icon"><i class="fa-solid fa-gamepad"></i></div>
          <div class="discovered-game-info">
            <div class="discovered-game-title">${game.name}</div>
            <div class="discovered-game-path">${game.path}</div>
          </div>
        </div>
        <div class="discovered-game-right">
          <span class="platform-badge ${platformClass}">${game.platform || 'Oyun'}</span>
          ${game.platform === 'Özel / Manuel' ? `
            <button class="btn btn-secondary btn-delete-custom-game" style="padding: 4px 8px; color: var(--danger); font-size: 11px;" title="Listeden Kaldır">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      `;

      if (game.platform === 'Özel / Manuel') {
        card.querySelector('.btn-delete-custom-game')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const confirmed = await showConfirmDialog({
            title: 'Oyunu Listeden Kaldır',
            message: `<strong>"${game.name}"</strong> oyununu taranan oyunlar listesinden kaldırmak istediğinize emin misiniz?`,
            icon: 'fa-solid fa-trash-can',
            confirmText: 'Evet, Kaldır',
            cancelText: 'Vazgeç',
            type: 'danger'
          });
          if (confirmed) {
            await api.removeCustomGamePath(game.path);
            await loadDiscoveredGames(true);
            showToast(`${game.name} kütüphaneden kaldırıldı.`);
          }
        });
      }

      container.appendChild(card);
    });
  };

  const loadDiscoveredGames = async (forceRefresh = false) => {
    try {
      cachedDiscoveredGames = await api.getDiscoveredGames(forceRefresh);
      renderDiscoveredGames(document.getElementById('input-search-discovered-games')?.value || '');
    } catch (e) {
      console.error('Oyunlar yüklenemedi:', e);
    }
  };

  await loadDiscoveredGames();

  api.onGamesScanned((games) => {
    if (games && Array.isArray(games)) {
      cachedDiscoveredGames = games;
      renderDiscoveredGames(document.getElementById('input-search-discovered-games')?.value || '');
    }
  });

  // Search in Discovered Games
  document.getElementById('input-search-discovered-games')?.addEventListener('input', (e) => {
    renderDiscoveredGames(e.target.value);
  });

  // Scan Libraries Button
  document.getElementById('btn-scan-game-libraries')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-scan-game-libraries');
    const original = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Taranıyor...';
    
    await api.scanGameLibraries();
    await loadDiscoveredGames(true);
    
    btn.innerHTML = '<i class="fa-solid fa-check"></i> Tarandı!';
    showToast(`${cachedDiscoveredGames.length} adet oyun başarıyla tespit edildi.`);
    
    setTimeout(() => {
      btn.innerHTML = original;
    }, 2000);
  });

  // Verify All Games ("Tüm Oyunlarım Bunlar")
  document.getElementById('btn-verify-all-games')?.addEventListener('click', async () => {
    await api.saveVerifiedGames(cachedDiscoveredGames);
    const statusLbl = document.getElementById('lbl-verified-status');
    if (statusLbl) {
      statusLbl.innerHTML = '<span style="color: var(--success);"><i class="fa-solid fa-circle-check"></i> Oyun listeniz doğrulandı ve kaydedildi!</span>';
    }
    showToast('Tüm oyunlarınız doğrulandı ve kaydedildi!', 'fa-solid fa-circle-check');
  });

  // Missing Game Choice Modal
  const modalMissingGame = document.getElementById('modal-missing-game');
  const openMissingModal = () => modalMissingGame.classList.add('active');
  const closeMissingModal = () => modalMissingGame.classList.remove('active');

  document.getElementById('btn-missing-game-add')?.addEventListener('click', openMissingModal);
  document.getElementById('btn-close-missing-modal')?.addEventListener('click', closeMissingModal);
  document.getElementById('btn-cancel-missing-modal')?.addEventListener('click', closeMissingModal);

  // Add Game by .exe File
  document.getElementById('btn-add-game-by-file')?.addEventListener('click', async () => {
    closeMissingModal();
    const selected = await api.selectFile();
    if (selected) {
      await api.addCustomGamePath(selected);
      await loadDiscoveredGames(true);
      showToast(`Oyun başarıyla eklendi: ${path.basename(selected)}`);
    }
  });

  // Add Game by Folder
  document.getElementById('btn-add-game-by-folder')?.addEventListener('click', async () => {
    closeMissingModal();
    const selected = await api.selectFolder();
    if (selected) {
      await api.addCustomGamePath(selected);
      await loadDiscoveredGames(true);
      showToast(`Oyun klasörü kütüphaneye eklendi: ${selected}`);
    }
  });

  // ==========================================
  // UNIVERSAL APP & PROCESS PICKER MODAL
  // ==========================================
  const modalAppPicker = document.getElementById('modal-app-picker');
  const inputPickerSearch = document.getElementById('input-app-picker-search');
  const btnClearPickerSearch = document.getElementById('btn-clear-picker-search');
  const pickerSelectedCountLabel = document.getElementById('picker-selected-count-label');
  const pickerTitle = document.getElementById('picker-modal-title');

  // Load Apps Dataset
  const loadAppsData = async (forceRefresh = false, runningOnly = false) => {
    const runningList = document.getElementById('list-running-apps');
    runningList.innerHTML = '<div style="padding:20px;text-align:center;">Çalışan uygulamalar yükleniyor...</div>';
    const filter = () => inputPickerSearch.value.toLowerCase().trim();
    await window.voldenaPickerData.refreshPickerData(api, {
      running: data => {
        cachedRunningApps = data;
        document.getElementById('count-running').textContent = data.length;
        renderRunningPane(filter());
      },
      popular: data => { cachedPopularApps = data; renderPopularPane(filter()); },
      installed: data => {
        cachedInstalledApps = data;
        document.getElementById('count-installed').textContent = data.length;
        renderInstalledPane(filter());
      },
      error: (kind, error) => {
        console.error(`Uygulama listesi alınamadı (${kind}):`, error);
        if (kind === 'running') {
          cachedRunningApps = [];
          runningList.innerHTML = '<div style="padding:20px;text-align:center;">Çalışan uygulamalar alınamadı. Yenile ile tekrar deneyebilirsiniz.</div>';
        }
      }
    }, {
      loadPopular: !runningOnly && (forceRefresh || cachedPopularApps.length === 0),
      loadInstalled: !runningOnly && (forceRefresh || cachedInstalledApps.length === 0),
      forceRefresh
    });
    if (pickerSelectedCountLabel) pickerSelectedCountLabel.textContent = `${selectedInPicker.size} uygulama seçildi`;
  };

  // Render Popular Apps Pane
  const renderPopularPane = (filter = '') => {
    const container = document.getElementById('grid-popular-apps');
    if (!container) return;
    container.innerHTML = '';

    const filtered = cachedPopularApps.filter(a => 
      a.name.toLowerCase().includes(filter) || a.exe.toLowerCase().includes(filter) || a.category.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
      container.innerHTML = '<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--text-dim);">Eşleşen popüler uygulama bulunamadı.</div>';
      return;
    }

    filtered.forEach(app => {
      const isChecked = selectedInPicker.has(app.exe);
      const card = document.createElement('div');
      card.className = `picker-item ${isChecked ? 'selected' : ''}`;
      card.innerHTML = `
        <div class="picker-item-left">
          <div class="picker-item-icon"><i class="${app.icon || 'fa-solid fa-gamepad'}"></i></div>
          <div class="picker-item-text">
            <div class="picker-item-name">${app.name}</div>
            <div class="picker-item-sub">${app.category} • ${app.exe}</div>
          </div>
        </div>
        <div class="picker-item-right">
          <input type="checkbox" class="picker-checkbox" ${isChecked ? 'checked' : ''}>
        </div>
      `;

      card.addEventListener('click', () => {
        if (pickerTargetMode === 'trigger') {
          selectedInPicker.clear();
          selectedInPicker.add(app.exe);
          renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
          return;
        }

        if (selectedInPicker.has(app.exe)) {
          selectedInPicker.delete(app.exe);
        } else {
          selectedInPicker.add(app.exe);
        }
        renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
      });

      container.appendChild(card);
    });
  };

  // Render Installed Apps Pane
  const renderInstalledPane = (filter = '') => {
    const container = document.getElementById('list-installed-apps');
    if (!container) return;
    container.innerHTML = '';

    const filtered = cachedInstalledApps.filter(a => 
      a.name.toLowerCase().includes(filter) || (a.exe && a.exe.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dim);">Eşleşen yüklü program bulunamadı.</div>';
      return;
    }

    filtered.forEach(app => {
      const exeKey = app.exe || app.name;
      const isChecked = selectedInPicker.has(exeKey);

      const item = document.createElement('div');
      item.className = `picker-item ${isChecked ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="picker-item-left">
          <div class="picker-item-icon"><i class="fa-solid fa-window-maximize"></i></div>
          <div class="picker-item-text">
            <div class="picker-item-name">${app.name}</div>
            <div class="picker-item-sub">${app.exe ? app.exe : (app.publisher || 'Yüklü Program')}</div>
          </div>
        </div>
        <div class="picker-item-right">
          <input type="checkbox" class="picker-checkbox" ${isChecked ? 'checked' : ''}>
        </div>
      `;

      item.addEventListener('click', () => {
        if (pickerTargetMode === 'trigger') {
          selectedInPicker.clear();
          selectedInPicker.add(exeKey);
          renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
          return;
        }

        if (selectedInPicker.has(exeKey)) {
          selectedInPicker.delete(exeKey);
        } else {
          selectedInPicker.add(exeKey);
        }
        renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
      });

      container.appendChild(item);
    });
  };

  // Render Running Processes Pane
  const renderRunningPane = (filter = '') => {
    const container = document.getElementById('list-running-apps');
    if (!container) return;
    container.innerHTML = '';

    const filtered = cachedRunningApps.filter(p => 
      p.name.toLowerCase().includes(filter) || (p.title && p.title.toLowerCase().includes(filter))
    );

    if (filtered.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-dim);">Eşleşen çalışan süreç bulunamadı.</div>';
      return;
    }

    filtered.forEach(p => {
      const isChecked = selectedInPicker.has(p.name);
      const isCritical = p.dangerLevel === 'critical';
      const isWarning = p.dangerLevel === 'warning';

      let dangerClass = '';
      let dangerBadge = '';
      let iconClass = 'fa-solid fa-gear';

      if (isCritical) {
        dangerClass = 'danger-critical';
        iconClass = 'fa-solid fa-ban';
        dangerBadge = `<span class="danger-badge-critical" title="Bu işlem güvenli kapatma kapsamında desteklenmiyor."><i class="fa-solid fa-ban"></i> Kapatma Desteklenmiyor</span>`;
      } else if (isWarning) {
        dangerClass = 'danger-warning';
        iconClass = 'fa-solid fa-triangle-exclamation';
        dangerBadge = `<span class="danger-badge-warning" title="Windows arayüz veya servis bileşenidir. Kapatılırsa ses, arama veya arayüzde sorun çıkabilir."><i class="fa-solid fa-triangle-exclamation"></i> Sistem Bileşeni (Kapatılması Sorun Yaratabilir)</span>`;
      }

      // If in 'close' mode and process is critical, disable selection
      const isSelectionDisabled = isCritical && pickerTargetMode === 'close';

      const item = document.createElement('div');
      item.className = `picker-item ${dangerClass} ${isChecked ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="picker-item-left">
          <div class="picker-item-icon"><i class="${iconClass}"></i></div>
          <div class="picker-item-text">
            <div class="picker-item-name" style="display: flex; align-items: center; gap: 8px;">
              <span>${p.name}</span>
              ${dangerBadge}
            </div>
            <div class="picker-item-sub">
              <span>PID: ${p.pid}</span>
              ${p.title ? `<span>• ${p.title}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="picker-item-right">
          <span class="picker-item-ram">${p.memoryMb} MB RAM</span>
          <input type="checkbox" class="picker-checkbox" ${isChecked ? 'checked' : ''} ${isSelectionDisabled ? 'disabled title="Kritik sistem süreçleri kapatılamaz"' : ''}>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (isSelectionDisabled) {
          showToast(`${p.name} kapatılmasına izin verilen uygulamalar arasında değil.`, 'fa-solid fa-ban');
          return;
        }

        if (pickerTargetMode === 'trigger') {
          selectedInPicker.clear();
          selectedInPicker.add(p.name);
          renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
          return;
        }

        if (selectedInPicker.has(p.name)) {
          selectedInPicker.delete(p.name);
        } else {
          selectedInPicker.add(p.name);
          if (isWarning) {
            showToast(`${p.name} bir sistem bileşenidir. Kapatıldığında bazı Windows özellikleri etkilenebilir.`, 'fa-solid fa-triangle-exclamation');
          }
        }
        renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
      });

      container.appendChild(item);
    });
  };

  const renderAllPickerPanes = (filter = '') => {
    renderPopularPane(filter);
    renderInstalledPane(filter);
    renderRunningPane(filter);

    if (pickerSelectedCountLabel) {
      pickerSelectedCountLabel.textContent = `${selectedInPicker.size} uygulama seçildi`;
    }
  };

  // Open App Picker Modal
  const openAppPicker = async (mode = 'close') => {
    pickerTargetMode = mode;
    modalAppPicker.classList.add('active');

    if (mode === 'close') {
      pickerTitle.textContent = 'Kapatılacak Uygulamaları Seç';
      selectedInPicker = new Set(closeTargetsState);
    } else if (mode === 'launch') {
      pickerTitle.textContent = 'Otomatik Açılacak Yan Uygulamaları Seç';
      selectedInPicker = new Set(launchTargetsState);
    } else if (mode === 'trigger') {
      pickerTitle.textContent = 'Tetikleyici Oyun / Ana Süreç Seç';
      const currentTrigger = document.getElementById('rule-form-trigger').value.trim();
      selectedInPicker = new Set(currentTrigger ? [currentTrigger] : []);
    } else if (mode === 'protected') {
      pickerTitle.textContent = 'Korumalı Listeye Eklenecek Uygulamaları Seç';
      const currentProtected = await api.getProtectedApps();
      selectedInPicker = new Set(currentProtected);
    }

    inputPickerSearch.value = '';
    if (btnClearPickerSearch) btnClearPickerSearch.style.display = 'none';

    renderPopularPane('');
    renderInstalledPane('');
    await loadAppsData();
  };

  const closeAppPicker = () => {
    modalAppPicker.classList.remove('active');
  };

  document.getElementById('btn-close-app-picker')?.addEventListener('click', closeAppPicker);
  document.getElementById('btn-cancel-app-picker')?.addEventListener('click', closeAppPicker);

  // Picker Tab Switching
  const pickerTabBtns = document.querySelectorAll('.picker-tab-btn');
  const pickerTabPanes = document.querySelectorAll('.picker-tab-pane');

  pickerTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');
      pickerActiveTab = tab;

      pickerTabBtns.forEach(b => b.classList.remove('active'));
      pickerTabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(`pane-${tab}`);
      if (targetPane) targetPane.classList.add('active');
      if (tab === 'running') loadAppsData(false, true);
    });
  });

  // Search Input in Picker
  inputPickerSearch?.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase().trim();
    if (btnClearPickerSearch) {
      btnClearPickerSearch.style.display = val ? 'block' : 'none';
    }
    renderAllPickerPanes(val);
  });

  btnClearPickerSearch?.addEventListener('click', () => {
    inputPickerSearch.value = '';
    btnClearPickerSearch.style.display = 'none';
    renderAllPickerPanes('');
  });

  // Refresh Apps
  document.getElementById('btn-refresh-apps')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-refresh-apps');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    await loadAppsData(true);
    btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Yenile';
    showToast('Uygulama ve süreç listesi güncellendi.');
  });

  // Select All & Clear All in Picker
  document.getElementById('btn-picker-select-all')?.addEventListener('click', () => {
    if (pickerTargetMode === 'trigger') return;

    if (pickerActiveTab === 'popular') {
      cachedPopularApps.forEach(a => selectedInPicker.add(a.exe));
    } else if (pickerActiveTab === 'installed') {
      cachedInstalledApps.forEach(a => selectedInPicker.add(a.exe || a.name));
    } else if (pickerActiveTab === 'running') {
      cachedRunningApps.forEach(p => selectedInPicker.add(p.name));
    }
    renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
  });

  document.getElementById('btn-picker-clear-all')?.addEventListener('click', () => {
    selectedInPicker.clear();
    renderAllPickerPanes(inputPickerSearch.value.toLowerCase().trim());
  });

  // Manual Tab inside Picker
  document.getElementById('btn-picker-manual-add')?.addEventListener('click', () => {
    const input = document.getElementById('input-picker-manual-text');
    const val = input.value.trim();
    if (!val) return;

    const clean = val.endsWith('.exe') || val.includes('\\') || val.includes('/') ? val : `${val}.exe`;
    selectedInPicker.add(clean);
    input.value = '';
    renderAllPickerPanes('');
    showToast(`${clean} seçilenlere eklendi.`);
  });

  document.getElementById('btn-picker-browse-file')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      const filename = selected.split('\\').pop().split('/').pop();
      const target = filename || selected;
      selectedInPicker.add(target);
      renderAllPickerPanes('');
      showToast(`Dosya seçildi ve eklendi: ${target}`);
    }
  });

  // Apply Picker Selection
  document.getElementById('btn-apply-app-picker')?.addEventListener('click', async () => {
    const selectedArray = Array.from(selectedInPicker);

    if (pickerTargetMode === 'close') {
      closeTargetsState = selectedArray;
      updateCloseTargetsPills();
      showToast(`${closeTargetsState.length} adet uygulama kapatılacaklar listesine eklendi.`);
    } else if (pickerTargetMode === 'launch') {
      launchTargetsState = selectedArray;
      updateLaunchTargetsPills();
      showToast(`${launchTargetsState.length} adet uygulama açılış listesine eklendi.`);
    } else if (pickerTargetMode === 'trigger') {
      if (selectedArray.length > 0) {
        document.getElementById('rule-form-trigger').value = selectedArray[0];
        showToast(`Tetikleyici olarak ${selectedArray[0]} seçildi.`);
      }
    } else if (pickerTargetMode === 'protected') {
      await api.updateProtectedApps(selectedArray);
      await renderProtectedApps();
      showToast(`Korumalı uygulamalar listesi güncellendi (${selectedArray.length} adet).`);
    }

    closeAppPicker();
  });

  // Picker Trigger Buttons
  document.getElementById('btn-open-picker-close')?.addEventListener('click', () => openAppPicker('close'));
  document.getElementById('btn-open-picker-launch')?.addEventListener('click', () => openAppPicker('launch'));
  document.getElementById('btn-picker-trigger')?.addEventListener('click', () => openAppPicker('trigger'));
  document.getElementById('btn-browse-protected-picker')?.addEventListener('click', () => openAppPicker('protected'));

  // ==========================================
  // RULE CREATION & EDIT MODAL
  // ==========================================
  const modalRule = document.getElementById('modal-rule');
  const modalRuleTitle = document.getElementById('modal-rule-title');
  const editingIdInput = document.getElementById('rule-form-editing-id');
  const chkKeepExplorer = document.getElementById('rule-form-keep-explorer');

  const openRuleModal = (ruleToEdit = null) => {
    modalRule.classList.add('active');

    if (ruleToEdit) {
      modalRuleTitle.textContent = 'Kuralı / Oyun Ayarını Düzenle';
      editingIdInput.value = ruleToEdit.id;
      document.getElementById('rule-form-name').value = ruleToEdit.name || '';
      document.getElementById('rule-form-trigger').value = ruleToEdit.triggerProcess || '';
      document.getElementById('rule-form-level').value = ruleToEdit.optimizationLevel || 'medium';
      if (chkKeepExplorer) chkKeepExplorer.checked = true;

      closeTargetsState = [...(ruleToEdit.closeTargets || [])];
      launchTargetsState = [...(ruleToEdit.launchTargets || [])];
    } else {
      modalRuleTitle.textContent = 'Yeni Oyun Kuralı Ekle';
      editingIdInput.value = '';
      document.getElementById('rule-form-name').value = '';
      document.getElementById('rule-form-trigger').value = '';
      document.getElementById('rule-form-level').value = 'medium';
      if (chkKeepExplorer) chkKeepExplorer.checked = true;

      closeTargetsState = [];
      launchTargetsState = [];
    }

    updateCloseTargetsPills();
    updateLaunchTargetsPills();
  };

  const closeRuleModal = () => {
    modalRule.classList.remove('active');
  };

  document.getElementById('btn-close-modal')?.addEventListener('click', closeRuleModal);
  document.getElementById('btn-cancel-modal')?.addEventListener('click', closeRuleModal);

  document.querySelectorAll('.btn-open-rule-modal').forEach(btn => {
    btn.addEventListener('click', () => openRuleModal(null));
  });

  // Save Rule
  document.getElementById('btn-save-rule')?.addEventListener('click', async () => {
    const editingId = editingIdInput.value;
    const name = document.getElementById('rule-form-name').value.trim();
    const trigger = document.getElementById('rule-form-trigger').value.trim();
    const level = document.getElementById('rule-form-level').value;
    const keepExp = chkKeepExplorer ? chkKeepExplorer.checked : true;

    if (!name || !trigger) {
      await showAlertDialog('Lütfen kural adı ve tetikleyici oyun (.exe) adını girin.', 'Eksik Bilgi', 'warning');
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

    closeRuleModal();
    renderRules();
  });

  // ==========================================
  // RULES RENDERING & MANAGEMENT
  // ==========================================
  const renderRules = async () => {
    const rules = await api.getRules();
    const summaryContainer = document.getElementById('dashboard-rules-summary');
    const optContainer = document.getElementById('game-optimization-rules');

    if (summaryContainer) summaryContainer.innerHTML = '';
    if (optContainer) optContainer.innerHTML = '';

    if (rules.length === 0) {
      const welcomeHtml = `
        <div class="welcome-hero-card">
          <div class="welcome-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <div class="welcome-title">Voldena'ya Hoş Geldiniz! 👋</div>
          <p class="welcome-desc">
            Hangi oyunu hızlandırmak istersiniz? İster yukarıdaki <strong>"Yeni Oyun Profili Ekle"</strong> butonuyla özel profil oluşturun, isterseniz bilgisayarınızdaki tüm oyunları tek tıkla otomatik algılatın.
          </p>
          <div class="welcome-actions">
            <button class="btn btn-primary btn-open-rule-modal" data-mode="new">
              <i class="fa-solid fa-plus"></i> Yeni Oyun Profili Ekle
            </button>
            <button class="btn btn-secondary" id="btn-welcome-scan-games">
              <i class="fa-solid fa-rotate-right"></i> Oyunları Otomatik Tara
            </button>
          </div>
        </div>
      `;

      if (summaryContainer) {
        summaryContainer.innerHTML = welcomeHtml;
        summaryContainer.querySelector('.btn-open-rule-modal')?.addEventListener('click', () => openRuleModal(null));
        summaryContainer.querySelector('#btn-welcome-scan-games')?.addEventListener('click', () => {
          document.querySelector('.nav-item[data-tab="auto-game-engine"]')?.click();
          document.getElementById('btn-scan-game-libraries')?.click();
        });
      }

      if (optContainer) optContainer.innerHTML = '<div style="color: var(--text-dim); font-size: 13px; padding: 20px; text-align: center;">Henüz özel kural tanımlanmamış. Yukarıdaki butondan yeni oyun profili ekleyebilirsiniz.</div>';
      return;
    }

    rules.forEach(rule => {
      const levelBadge = rule.optimizationLevel === 'high'
        ? `<span class="badge badge-high">Güvenli Kapatma</span>`
        : rule.optimizationLevel === 'medium'
        ? '<span class="badge badge-medium">Orta Mod</span>'
        : '<span class="badge badge-low">Düşük Mod</span>';

      // Summary Card for Dashboard
      if (summaryContainer) {
        const summaryEl = document.createElement('div');
        summaryEl.className = 'rule-item interactive';
        summaryEl.innerHTML = `
          <div class="rule-info">
            <div class="rule-name">${rule.name}</div>
            <div class="rule-details">
              <span>Tetikleyici: <strong>${rule.triggerProcess}</strong></span>
              ${rule.closeTargets && rule.closeTargets.length > 0 ? `<span>• Kapatılacak: <strong>${rule.closeTargets.length}</strong></span>` : ''}
              ${rule.launchTargets && rule.launchTargets.length > 0 ? `<span>• Açılacak: <strong>${rule.launchTargets.length}</strong></span>` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${levelBadge}
            <label class="switch" onclick="event.stopPropagation();">
              <input type="checkbox" class="toggle-rule" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
        `;

        summaryEl.addEventListener('click', () => openRuleModal(rule));
        summaryContainer.appendChild(summaryEl);
      }

      // Full Rule Card for Optimization Profiles Tab
      const createRuleCard = () => {
        const itemEl = document.createElement('div');
        itemEl.className = 'rule-item';
        itemEl.innerHTML = `
          <div class="rule-info">
            <div class="rule-name">${rule.name}</div>
            <div class="rule-details">
              <span>Tetikleyici: <strong>${rule.triggerProcess}</strong></span>
              <span>• Kapatılacak: <strong>${rule.closeTargets ? rule.closeTargets.length : 0}</strong></span>
              <span>• Açılacak: <strong>${rule.launchTargets ? rule.launchTargets.length : 0}</strong></span>
              <span>•</span>
              ${levelBadge}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button class="btn btn-secondary btn-edit-rule" data-id="${rule.id}" style="padding: 6px 10px; color: var(--primary);" title="Düzenle">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <label class="switch">
              <input type="checkbox" class="toggle-rule" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
            <button class="btn btn-secondary btn-delete-rule" data-id="${rule.id}" style="padding: 6px 10px; color: var(--danger);" title="Sil">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;

        itemEl.querySelector('.btn-edit-rule').addEventListener('click', () => openRuleModal(rule));
        itemEl.querySelector('.btn-delete-rule').addEventListener('click', async () => {
          const confirmed = await showConfirmDialog({
            title: 'Kuralı Sil',
            message: `<strong>"${rule.name}"</strong> kuralını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
            icon: 'fa-solid fa-trash-can',
            confirmText: 'Evet, Sil',
            cancelText: 'Vazgeç',
            type: 'danger'
          });
          if (confirmed) {
            await api.deleteRule(rule.id);
            showToast(`${rule.name} silindi.`, 'fa-solid fa-trash');
            await renderRules();
          }
        });
        itemEl.querySelector('.toggle-rule').addEventListener('change', async (e) => {
          rule.enabled = e.target.checked;
          await api.updateRule(rule.id, rule);
          showToast(`${rule.name} ${rule.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`);
        });

        return itemEl;
      };

      if (optContainer) optContainer.appendChild(createRuleCard());
    });
  };

  await renderRules();

  // ==========================================
  // PRESETS TAB & SETTINGS PRESET CARDS
  // ==========================================
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
    if (badgeVal) {
      if (selectedLevel === 'high') {
        badgeVal.innerHTML = '<span class="badge badge-high">Güvenli Kapatma</span>';
      } else if (selectedLevel === 'low') {
        badgeVal.innerHTML = '<span class="badge badge-low">Düşük Mod</span>';
      } else {
        badgeVal.innerHTML = '<span class="badge badge-medium">Orta Mod</span>';
      }
    }
  };

  updatePresetCardsUI(currentPreset);

  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', async () => {
      const level = card.getAttribute('data-preset');
      if (level === currentPreset) return; // Prevent spamming when already selected!

      currentPreset = level;
      updatePresetCardsUI(level);
      await api.updateSettings({ activePreset: level });
      showToast(`Varsayılan optimizasyon seviyesi ${level.toUpperCase()} yapıldı.`);
    });
  });

  // ==========================================
  // PROTECTED APPS (WHITELIST)
  // ==========================================
  const renderProtectedApps = async () => {
    const apps = await api.getProtectedApps();
    const container = document.getElementById('protected-apps-list');
    if (!container) return;
    container.innerHTML = '';

    if (apps.length === 0) {
      container.innerHTML = '<span style="color: var(--text-dim); font-size: 13px;">Korumalı uygulama bulunmuyor.</span>';
      return;
    }

    apps.forEach(app => {
      const tag = document.createElement('div');
      tag.className = 'protected-tag';
      tag.innerHTML = `
        <i class="fa-solid fa-shield-halved" style="color: var(--primary);"></i>
        <span>${app}</span>
        <i class="fa-solid fa-xmark protected-tag-remove" data-app="${app}" title="Listeden Kaldır"></i>
      `;

      tag.querySelector('.protected-tag-remove').addEventListener('click', async () => {
        const currentList = await api.getProtectedApps();
        const updated = currentList.filter(a => a.toLowerCase() !== app.toLowerCase());
        await api.updateProtectedApps(updated);
        showToast(`${app} korumalı listeden kaldırıldı.`);
        renderProtectedApps();
      });

      container.appendChild(tag);
    });
  };

  await renderProtectedApps();

  document.getElementById('btn-add-protected')?.addEventListener('click', async () => {
    const input = document.getElementById('input-protected-app');
    const val = input.value.trim().toLowerCase();
    if (!val) return;

    const clean = val.endsWith('.exe') ? val : `${val}.exe`;
    const currentList = await api.getProtectedApps();
    if (!currentList.some(a => a.toLowerCase() === clean)) {
      currentList.push(clean);
      await api.updateProtectedApps(currentList);
      showToast(`${clean} korumalı listeye eklendi.`);
      renderProtectedApps();
    }
    input.value = '';
  });

  document.getElementById('btn-browse-protected-file')?.addEventListener('click', async () => {
    const selected = await api.selectFile();
    if (selected) {
      const filename = selected.split('\\').pop().split('/').pop().toLowerCase();
      const currentList = await api.getProtectedApps();
      if (!currentList.some(a => a.toLowerCase() === filename)) {
        currentList.push(filename);
        await api.updateProtectedApps(currentList);
        showToast(`${filename} korumalı listeye eklendi.`);
        renderProtectedApps();
      }
    }
  });

  document.querySelectorAll('.quick-add-protected').forEach(btn => {
    btn.addEventListener('click', async () => {
      const app = btn.getAttribute('data-app');
      const currentList = await api.getProtectedApps();
      if (!currentList.some(a => a.toLowerCase() === app.toLowerCase())) {
        currentList.push(app);
        await api.updateProtectedApps(currentList);
        showToast(`${app} korumalı listeye eklendi.`);
        renderProtectedApps();
      } else {
        showToast(`${app} zaten korumalı listede.`);
      }
    });
  });

  document.getElementById('input-protected-app')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btn-add-protected').click();
    }
  });

  // ==========================================
  // SETTINGS TOGGLES
  // ==========================================
  const chkAutostart = document.getElementById('setting-autostart');
  const chkMinimized = document.getElementById('setting-minimized');
  const chkNotifications = document.getElementById('setting-notifications');
  const chkAutoRestore = document.getElementById('setting-auto-restore');
  const chkExitAfterOptimization = document.getElementById('setting-exit-after-optimization');
  const chkForceTrayApps = document.getElementById('setting-force-tray-apps');
  const chkSmartSweep = document.getElementById('setting-smart-sweep');
  const chkAutoGameDetection = document.getElementById('setting-auto-game-detection');
  const chkAutoGameDetectionSettings = document.getElementById('setting-auto-game-detection-settings');
  const chkKeepExplorerSettings = document.getElementById('setting-keep-explorer');

  if (chkAutostart) chkAutostart.checked = !!settings.autoStartOnBoot;
  if (chkMinimized) chkMinimized.checked = !!settings.startMinimized;
  if (chkNotifications) chkNotifications.checked = !!settings.notifyOnAction;
  if (chkAutoRestore) {
    chkAutoRestore.checked = settings.exitAfterOptimization === false && settings.autoRestoreOnExit === true;
    chkAutoRestore.disabled = settings.exitAfterOptimization !== false;
  }
  if (chkExitAfterOptimization) chkExitAfterOptimization.checked = settings.exitAfterOptimization !== false;
  if (chkForceTrayApps) chkForceTrayApps.checked = settings.forceCloseSelectedTrayApps !== false;
  chkExitAfterOptimization?.addEventListener('change', async e => {
    await api.updateSettings({ exitAfterOptimization: e.target.checked, autoRestoreOnExit: false });
    if (chkAutoRestore) { chkAutoRestore.checked = false; chkAutoRestore.disabled = e.target.checked; }
    showToast(e.target.checked ? 'İşlemler bitince Voldena tamamen kapanacak.' : 'Voldena oyun sırasında açık kalacak.');
  });
  chkForceTrayApps?.addEventListener('change', e => api.updateSettings({ forceCloseSelectedTrayApps: e.target.checked }));
  if (chkSmartSweep) { chkSmartSweep.checked = false; chkSmartSweep.disabled = true; }
  if (chkAutoGameDetection) chkAutoGameDetection.checked = settings.autoGameDetection !== false;
  if (chkAutoGameDetectionSettings) chkAutoGameDetectionSettings.checked = settings.autoGameDetection !== false;
  if (chkKeepExplorerSettings) { chkKeepExplorerSettings.checked = true; chkKeepExplorerSettings.disabled = true; }

  chkAutostart?.addEventListener('change', (e) => {
    api.updateSettings({ autoStartOnBoot: e.target.checked });
    showToast(e.target.checked ? 'Windows başlangıcında otomatik başlatma açıldı.' : 'Başlangıçta çalıştırma kapatıldı.');
  });
  chkMinimized?.addEventListener('change', (e) => {
    api.updateSettings({ startMinimized: e.target.checked });
    showToast(e.target.checked ? 'Kapatıldığında sistem tepsisine küçülecek.' : 'Kapatıldığında doğrudan sonlandırılacak.');
  });
  chkNotifications?.addEventListener('change', (e) => {
    api.updateSettings({ notifyOnAction: e.target.checked });
    showToast(e.target.checked ? 'Masaüstü bildirimleri açıldı.' : 'Masaüstü bildirimleri kapatıldı.');
  });
  chkAutoRestore?.addEventListener('change', (e) => {
    api.updateSettings({ autoRestoreOnExit: e.target.checked });
    showToast(e.target.checked ? 'Otomatik geri açma (Auto-restore) etkinleştirildi.' : 'Otomatik geri açma devre dışı bırakıldı.');
  });
  chkSmartSweep?.addEventListener('change', (e) => {
    api.updateSettings({ smartSweep: e.target.checked });
    showToast(e.target.checked ? 'Smart-Sweep arka plan temizliği etkinleştirildi.' : 'Smart-Sweep devre dışı bırakıldı.');
  });
  chkAutoGameDetection?.addEventListener('change', (e) => {
    api.updateSettings({ autoGameDetection: e.target.checked });
    if (chkAutoGameDetectionSettings) chkAutoGameDetectionSettings.checked = e.target.checked;
    showToast(e.target.checked ? 'Akıllı Otomatik Oyun Algılama etkinleştirildi.' : 'Otomatik Oyun Algılama devre dışı bırakıldı.');
  });
  chkAutoGameDetectionSettings?.addEventListener('change', (e) => {
    api.updateSettings({ autoGameDetection: e.target.checked });
    if (chkAutoGameDetection) chkAutoGameDetection.checked = e.target.checked;
    showToast(e.target.checked ? 'Akıllı Otomatik Oyun Algılama etkinleştirildi.' : 'Otomatik Oyun Algılama devre dışı bırakıldı.');
  });
  chkKeepExplorerSettings?.addEventListener('change', (e) => {
    api.updateSettings({ keepExplorer: e.target.checked });
    showToast(e.target.checked ? 'Ultra modda Explorer.exe açık tutulacak.' : 'Ultra modda Explorer.exe durdurulacak.');
  });
});
