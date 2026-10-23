// Voldena UI Renderer Logic
document.addEventListener('DOMContentLoaded', async () => {
  const api = window.voldenaAPI;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let exitDeadline = null;
  function renderSessionResults(state) {
    exitDeadline=state.exitDeadline;const container=document.getElementById('session-results');
    container.replaceChildren();const report=state.report;container.hidden=!report;if(!report)return;
    const closed=report.closedApps?.length||0,opened=report.launches?.filter(item=>item.launched).length||0;
    container.textContent=closed+' uygulama kapatıldı · '+opened+' yardımcı uygulama başlatıldı'+(report.failed?.length?' · '+report.failed.length+' işlem tamamlanamadı':'')+'.';
    const button=document.createElement('button');button.type='button';button.className='btn-link';button.textContent='İşlem Günlükleri';button.onclick=()=>{document.querySelector('.nav-item[data-tab="settings"]')?.click();const logs=document.getElementById('operation-logs');if(logs){logs.open=true;logs.scrollIntoView({block:'start'});}};container.appendChild(button);
  }
  api.onStatusChange(renderSessionResults);

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
      const btnClose = document.getElementById('btn-close-confirm');

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
        btnClose?.removeEventListener('click', onCancel);
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
          cleanUp(isAlert || document.activeElement===btnAccept);
        }
      };

      btnAccept.addEventListener('click', onAccept);
      btnCancel.addEventListener('click', onCancel);
      btnClose?.addEventListener('click', onCancel);
      (isAlert?btnAccept:btnCancel).focus();
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

      if (tab === 'disk' && typeof loadDiskTabContent === 'function') {
        loadDiskTabContent();
      }
    });
  });

  // Live Hardware & Memory Stats Update
  const updateHardwareUI = (stats) => {
    if (!stats) return;
    const usedGb = (stats.used / 1024).toFixed(1);
    const totalGb = (stats.total / 1024).toFixed(1);

    // 1. RAM Metric
    const ramUsedEl = document.getElementById('val-ram-used');
    const ramTotalEl = document.getElementById('val-ram-total');
    const ramPercentEl = document.getElementById('val-ram-percent');
    const barRamFill = document.getElementById('bar-ram-fill');

    if (ramUsedEl) ramUsedEl.innerHTML = `${usedGb} <span class="metric-unit">GB / ${totalGb} GB</span>`;
    if (ramTotalEl) ramTotalEl.textContent = `${totalGb} GB`;
    if (ramPercentEl) ramPercentEl.textContent = `${stats.percent}%`;
    if (barRamFill) barRamFill.style.width = `${stats.percent}%`;

    // 2. CPU Metric
    const cpuPercentEl = document.getElementById('val-cpu-percent-text');
    const barCpuFill = document.getElementById('bar-cpu-fill');
    const cpuCoresEl = document.getElementById('val-cpu-cores-text');
    const cpuModelEl = document.getElementById('val-cpu-model-text');

    if (stats.cpuPercent !== undefined) {
      if (cpuPercentEl) cpuPercentEl.textContent = stats.cpuPercent === null ? 'Ölçülüyor…' : `${stats.cpuPercent}%`;
      if (barCpuFill) barCpuFill.style.width = `${stats.cpuPercent}%`;
    }
    if (stats.cpuCores && cpuCoresEl) {
      cpuCoresEl.textContent = `${stats.cpuCores} Çekirdek`;
    }
    if (stats.cpuModel && cpuModelEl) {
      cpuModelEl.textContent = stats.cpuModel;
      cpuModelEl.title = stats.cpuModel;
    }

    // 3. GPU Metric
    const gpuPercentEl = document.getElementById('val-gpu-percent-text');
    const barGpuFill = document.getElementById('bar-gpu-fill');
    const gpuModelEl = document.getElementById('val-gpu-model-text');
    const gpuVramEl = document.getElementById('val-gpu-vram-text');

    if (stats.gpuPercent !== undefined) {
      if (gpuPercentEl) gpuPercentEl.textContent = `${stats.gpuPercent}%`;
      if (barGpuFill) barGpuFill.style.width = `${stats.gpuPercent}%`;
    }
    if (stats.gpuModel && gpuModelEl) {
      gpuModelEl.textContent = stats.gpuModel;
      gpuModelEl.title = stats.gpuModel;
    }
    if (stats.gpuVramTotalGb && gpuVramEl) {
      gpuVramEl.textContent = `${stats.gpuVramUsedGb || 0} / ${stats.gpuVramTotalGb} GB VRAM`;
    }
  };

  const refreshHardware = async () => {
    try {
      const hw = await api.getHardwareStats();
      updateHardwareUI(hw);
    } catch (e) {
      try {
        const mem = await api.getMemoryStats();
        updateHardwareUI(mem);
      } catch (e2) {}
    }
  };

  refreshHardware();
  // Main-process hardware updates provide the live samples.

  api.onMemoryUpdate((stats) => {
    updateHardwareUI(stats);
  });

  // Quick Action Buttons
  document.getElementById('btn-quick-ram')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-quick-ram');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Önizleme...';

    try {
      const res = await api.optimizeRam('low');
      await refreshHardware();
      await showAlertDialog(escapeHTML(res?.message||'İşlem tamamlanamadı.'),'RAM yükünü azalt',res?.success?'success':'info');
    } catch (err) {
      await showAlertDialog('RAM temizliği sırasında bir hata oluştu: ' + err.message, 'Hata', 'danger');
    }

    setTimeout(() => {
      btn.innerHTML = originalText;
    }, 1000);
  });

  document.getElementById('btn-emergency-explorer')?.addEventListener('click', async () => {
    const started=await api.startExplorer();
    showToast(started?'Explorer açık veya yeniden başlatma isteği tamamlandı.':'Explorer başlatılamadı; Ctrl+Shift+Esc → Yeni görev → explorer.exe kullanabilirsiniz.', 'fa-solid fa-window-restore');
  });

  // Manual Detect & Boost Button & Choice Modal
  const btnManualBoost = document.getElementById('btn-manual-boost');
  const modalManualBoost = document.getElementById('modal-manual-boost');
  const manualBoostList = document.getElementById('manual-boost-options-list');

  document.getElementById('btn-close-manual-boost')?.addEventListener('click', () => {
    modalManualBoost?.classList.remove('active');
  });
  document.getElementById('btn-cancel-manual-boost')?.addEventListener('click', () => {
    modalManualBoost?.classList.remove('active');
  });

  const renderManualBoostChoices = (rules) => {
    if (!manualBoostList) return;
    manualBoostList.innerHTML = '';

    // 1. General Quick Clean Option
    const generalItem = document.createElement('div');
    generalItem.className = 'manual-boost-card';
    generalItem.innerHTML = `
      <div class="manual-boost-left">
        <div class="manual-boost-icon" style="background: rgba(0, 240, 255, 0.15); color: var(--primary);">
          <i class="fa-solid fa-bolt-lightning"></i>
        </div>
        <div class="manual-boost-info">
          <div class="manual-boost-name">Genel Hızlı Oyun Modu</div>
          <div class="manual-boost-meta">
            <span class="chip-sm chip-primary"><i class="fa-solid fa-broom"></i> Hızlı Temizlik</span>
            <span class="chip-sm"><i class="fa-solid fa-memory"></i> Seçili uygulamalar</span>
          </div>
        </div>
      </div>
      <button class="btn-boost-start" type="button">
        <i class="fa-solid fa-play"></i> Başlat
      </button>
    `;
    generalItem.addEventListener('click', async () => {
      modalManualBoost?.classList.remove('active');
      await api.forceApplyRule(null);
      showToast('Seçili uygulamalar işlendi. Gerçek sonuçları ayarlarda inceleyin.', 'fa-solid fa-bolt-lightning');
    });
    manualBoostList.appendChild(generalItem);

    // 2. Defined User Rules List
    rules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'manual-boost-card';
      const closeCount = rule.closeTargets ? rule.closeTargets.length : 0;
      const launchCount = rule.launchTargets ? rule.launchTargets.length : 0;
      const trigger = rule.triggerProcess || 'Manuel';

      item.innerHTML = `
        <div class="manual-boost-left">
          <div class="manual-boost-icon">
            <i class="fa-solid fa-gamepad"></i>
          </div>
          <div class="manual-boost-info">
            <div class="manual-boost-name">${rule.alias || rule.name}</div>
            <div class="manual-boost-meta">
              <span class="chip-sm chip-primary"><i class="fa-solid fa-crosshairs"></i> ${trigger}</span>
              <span class="chip-sm"><i class="fa-solid fa-power-off"></i> ${closeCount} Kapatılacak</span>
              ${launchCount > 0 ? `<span class="chip-sm"><i class="fa-solid fa-rocket"></i> ${launchCount} Açılacak</span>` : ''}
            </div>
          </div>
        </div>
        <button class="btn-boost-start" type="button">
          <i class="fa-solid fa-play"></i> Başlat
        </button>
      `;
      item.addEventListener('click', async () => {
        modalManualBoost?.classList.remove('active');
        await api.forceApplyRule(rule.id);
        showToast(`${rule.alias || rule.name} optimizasyonu zorla uygulandı!`, 'fa-solid fa-gamepad');
      });
      manualBoostList.appendChild(item);
    });
  };

  btnManualBoost?.addEventListener('click', async () => {
    const originalHtml = btnManualBoost.innerHTML;
    btnManualBoost.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Taranıyor...';

    try {
      const result = await api.manualDetectAndBoost();
      if (result && result.detected) {
        showToast(`${result.rule.alias || result.rule.name} algılandı ve optimizasyon uygulandı. (${result.closedCount || 0} uygulama kapatıldı)`, 'fa-solid fa-gamepad');
      } else {
        renderManualBoostChoices(result.rules || []);
        const continueManually=await showConfirmDialog({title:'Oyun algılanamadı',message:'Oyununuz otomatik olarak algılanamadı. Manuel başlatmayı deneyebilirsiniz. Kapat düğmesi profil seçimini açar.',confirmText:'Kapat',cancelText:'Vazgeç',type:'danger'});
        if(continueManually)modalManualBoost?.classList.add('active');
      }
    } catch (err) {
      showToast('Oyun algılama sırasında hata: ' + err.message, 'fa-solid fa-triangle-exclamation');
    } finally {
      btnManualBoost.innerHTML = originalHtml;
    }
  });

  // Initial Status Check on App Load
  try {
    const initialStatus = await api.getStatus();
    if (initialStatus) renderSessionResults(initialStatus);
    if (initialStatus && initialStatus.activeRule) {
      const dot = document.getElementById('status-dot');
      const statusLabel = document.getElementById('status-label');
      const ruleNameVal = document.getElementById('val-active-rule-name');
      const ruleSubVal = document.getElementById('val-active-rule-sub');
      if (dot) dot.className = 'status-dot active-game';
      if (statusLabel) statusLabel.textContent = `Optimizasyon: ${initialStatus.activeRule.alias || initialStatus.activeRule.name}`;
      if (ruleNameVal) {
        ruleNameVal.textContent = initialStatus.activeRule.alias || initialStatus.activeRule.name;
        ruleNameVal.style.color = 'var(--danger)';
      }
      if (ruleSubVal) {
        ruleSubVal.textContent = `Profil işlemleri tamamlandı. Ayrıntılar İşlem Günlüklerinde.`;
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
      if (statusLabel) statusLabel.textContent = `Optimizasyon: ${data.activeRule.alias || data.activeRule.name}`;
      if (ruleNameVal) {
        ruleNameVal.textContent = data.activeRule.alias || data.activeRule.name;
        ruleNameVal.style.color = 'var(--danger)';
      }
      if (ruleSubVal) {
        ruleSubVal.textContent = `Profil işlemleri tamamlandı. Ayrıntılar İşlem Günlüklerinde.`;
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
        <span>${escapeHTML(item)}</span>
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

      card.tabIndex=0;card.setAttribute('role','button');card.title='Ayarlarını düzenlemek için tıklayın';
      card.addEventListener('click',event=>{if(!event.target.closest('button'))void editDiscoveredGame(game);});
      card.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();void editDiscoveredGame(game);}});
      card.innerHTML = `
        <div class="discovered-game-left">
          <div class="discovered-game-icon"><i class="fa-solid fa-gamepad"></i></div>
          <div class="discovered-game-info">
            <div class="discovered-game-title">${escapeHTML(game.name)}</div>
            <div class="discovered-game-path">${escapeHTML(game.path)}</div>
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

  void loadDiscoveredGames();

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
    await loadDiscoveredGames(false);

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
  const loadAppsData = (forceRefresh = false) => window.voldenaPickerData.refreshPickerData(api, {
    running: data => {cachedRunningApps=data;document.getElementById('count-running').textContent=data.length;renderRunningPane(inputPickerSearch.value.toLowerCase());},
    popular: data => {cachedPopularApps=data;renderPopularPane(inputPickerSearch.value.toLowerCase());},
    installed: data => {cachedInstalledApps=data;document.getElementById('count-installed').textContent=data.length;renderInstalledPane(inputPickerSearch.value.toLowerCase());},
    error: (kind, error) => {const el=document.getElementById(kind==='running'?'list-running-apps':'list-installed-apps');if(el)el.textContent='Liste alınamadı: '+error.message;}
  }, {loadPopular:forceRefresh||!cachedPopularApps.length,loadInstalled:forceRefresh||!cachedInstalledApps.length,forceRefresh});

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
            <div class="picker-item-name">${escapeHTML(app.name)}</div>
            <div class="picker-item-sub">${app.category} • ${escapeHTML(app.exe)}</div>
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
            <div class="picker-item-name">${escapeHTML(app.name)}</div>
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
        dangerBadge = `<span class="danger-badge-critical" title="Bu süreç Windows için hayati önem taşır. Kapatılamaz, kapatılırsa bilgisayar çöker/yeniden başlar."><i class="fa-solid fa-ban"></i> Kritik Sistem (Kapatılamaz - PC Çöker)</span>`;
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
          showToast(`${p.name} kritik bir sistem sürecidir. Bilgisayarınızın çökmesini engellemek için kapatılamaz!`, 'fa-solid fa-ban');
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

    renderAllPickerPanes('');
    void loadAppsData();
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
      if (tab === 'running') void loadAppsData();
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
      const target = (pickerTargetMode === 'launch') ? selected : (filename || selected);
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
      document.getElementById('search-protected')?.addEventListener('input',()=>void renderProtectedApps());
  window.addEventListener('protected-apps-changed',()=>void renderProtectedApps());
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
      editingIdInput.value = ruleToEdit.id || '';
      document.getElementById('rule-form-name').value = ruleToEdit.name || '';
      document.getElementById('rule-form-trigger').value = ruleToEdit.triggerProcess || '';
      document.getElementById('rule-form-level').value = ruleToEdit.optimizationLevel || 'medium';
      if (chkKeepExplorer) chkKeepExplorer.checked = ruleToEdit.keepExplorer !== false || ruleToEdit.desktopClosureConsentVersion!==1;

      closeTargetsState = [...(ruleToEdit.closeTargets || [])];
      launchTargetsState = [...(ruleToEdit.launchTargets || [])];
      document.getElementById('rule-form-exit-launch').value=(ruleToEdit.exitLaunchTargets||[]).join('\n');
    } else {
      modalRuleTitle.textContent = 'Yeni Oyun Kuralı Ekle';
      editingIdInput.value = '';
      document.getElementById('rule-form-name').value = '';
      document.getElementById('rule-form-trigger').value = '';
      document.getElementById('rule-form-level').value = 'medium';
      if (chkKeepExplorer) chkKeepExplorer.checked = true;

      closeTargetsState = [];
      launchTargetsState = [];
      document.getElementById('rule-form-exit-launch').value='';
    }

    updateCloseTargetsPills();
    updateLaunchTargetsPills();
  };
  let editingDiscoveredGame=false;
  document.getElementById('btn-browse-exit-launch')?.addEventListener('click',async()=>{const file=await api.selectFile();if(file&&/\.exe$/i.test(file)){const input=document.getElementById('rule-form-exit-launch');input.value=[...new Set([...input.value.split('\n').filter(Boolean),file])].join('\n');}});
  async function editDiscoveredGame(game) {
    const executables=[...new Set([game.exe,...(game.executables||[])].filter(exe=>typeof exe==='string'&&/\.exe$/i.test(exe)&&!/(crash|unins|setup|wallpaper|launcher|service)/i.test(exe)))];
    const existing=(await api.getRules()).find(rule=>executables.some(exe=>exe.toLowerCase()===rule.triggerProcess?.toLowerCase()));
    let trigger=existing?.triggerProcess||executables[0];
    if(!trigger){const selected=await api.selectFile();if(!selected||!/\.exe$/i.test(selected))return;trigger=selected.split(/[\\/]/).at(-1);}
    editingDiscoveredGame=true;
    openRuleModal(existing||{name:game.name,triggerProcess:trigger,optimizationLevel:'medium',keepExplorer:true,closeTargets:[],launchTargets:[]});
  }
  const desktopWarning={title:'Explorer kapatılsın mı?',message:'Görev çubuğu, masaüstü ve açık Dosya Gezgini pencereleri geçici olarak kapanır. Pencereler arası geçiş etkilenebilir; açık dosya kopyalamalarını önce bitirin.<br><br>Oyun/uygulama bittiğinde veya Voldena kapanırsa ayrı kurtarma görevi Explorer’ı geri açar. Ana sayfadaki Explorer Başlat, tepsi menüsü veya <strong>Ctrl+Alt+R</strong> ile de açabilirsiniz. Bu seçenek varsayılan kapalıdır; otomatik Voldena çıkışı kapatılır.',confirmText:'Evet, devam et',cancelText:'Hayır, geri dön',type:'danger'};
  chkKeepExplorer?.addEventListener('change',async event=>{if(!event.target.checked&&!await showConfirmDialog(desktopWarning))event.target.checked=true;});
  document.querySelectorAll('[data-desktop-info]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();void showAlertDialog(desktopWarning.message,'Explorer koruması','info');}));

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
    const exitTargets=document.getElementById('rule-form-exit-launch').value.split('\n').map(value=>value.trim()).filter(Boolean);
    if(exitTargets.length>20||exitTargets.some(target=>!/\.exe$/i.test(target)||target.split(/[\\/]/).at(-1).toLowerCase()===trigger.toLowerCase())){
      await showAlertDialog('Oyun bitişi listesine en fazla 20 uygulama EXE’si ekleyin; oyunun kendisini yeniden başlatma hedefi yapmayın.','Bitiş uygulamaları','warning');return;
    }

    const ruleData = {
      name,
      triggerProcess: trigger,
      alias: name,
      enabled: true,
      closeTargets: closeTargetsState,
      launchTargets: launchTargetsState,
      exitLaunchTargets:exitTargets,
      optimizationLevel: level,
      keepExplorer: keepExp,
      desktopClosureConsentVersion:keepExp?0:1
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
    if(editingDiscoveredGame){document.querySelector('.nav-item[data-tab="game-optimization"]')?.click();editingDiscoveredGame=false;}
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
        ? `<span class="badge badge-high">Seçili Uygulamalar ${rule.keepExplorer ? '(Explorer Açık)' : ''}</span>`
        : rule.optimizationLevel === 'medium'
        ? '<span class="badge badge-medium">Orta Mod</span>'
        : '<span class="badge badge-low">Düşük Mod</span>';

      // Summary Card for Dashboard
      if (summaryContainer) {
        const summaryEl = document.createElement('div');
        summaryEl.className = 'rule-item interactive';
        summaryEl.innerHTML = `
          <div class="rule-info">
            <div class="rule-name">${escapeHTML(rule.name)}</div>
            <div class="rule-details">
              <span>Tetikleyici: <strong>${escapeHTML(rule.triggerProcess)}</strong></span>
              ${rule.closeTargets && rule.closeTargets.length > 0 ? `<span>• Kapatılacak: <strong>${rule.closeTargets.length}</strong></span>` : ''}
              ${rule.launchTargets && rule.launchTargets.length > 0 ? `<span>• Açılacak: <strong>${rule.launchTargets.length}</strong></span>` : ''}
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${levelBadge}
            <label class="switch">
              <input type="checkbox" class="toggle-rule" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''}>
              <span class="slider"></span>
            </label>
          </div>
        `;

        summaryEl.addEventListener('click', event => {if(!event.target.closest('label,button,input'))openRuleModal(rule);});
        summaryContainer.appendChild(summaryEl);
      }

      // Full Rule Card for Optimization Profiles Tab
      const createRuleCard = () => {
        const itemEl = document.createElement('div');
        itemEl.className = 'rule-item';
        itemEl.innerHTML = `
          <div class="rule-info">
            <div class="rule-name">${escapeHTML(rule.name)}</div>
            <div class="rule-details">
              <span>Tetikleyici: <strong>${escapeHTML(rule.triggerProcess)}</strong></span>
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
            message: `<strong>"${escapeHTML(rule.name)}"</strong> kuralını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
            icon: 'fa-solid fa-trash-can',
            confirmText: 'Evet, Sil',
            cancelText: 'Vazgeç',
            type: 'danger'
          });
          if (confirmed) {
            await api.deleteRule(rule.id);
            showToast(`${escapeHTML(rule.name)} silindi.`, 'fa-solid fa-trash');
            await renderRules();
          }
        });
        itemEl.querySelector('.toggle-rule').addEventListener('change', async (e) => {
          rule.enabled = e.target.checked;
          await api.updateRule(rule.id, rule);
          showToast(`${escapeHTML(rule.name)} ${rule.enabled ? 'etkinleştirildi' : 'devre dışı bırakıldı'}.`);
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
        badgeVal.innerHTML = '<span class="badge badge-high">Seçili Uygulamalar</span>';
      } else if (selectedLevel === 'low') {
        badgeVal.innerHTML = '<span class="badge badge-low">Düşük Mod</span>';
      } else {
        badgeVal.innerHTML = '<span class="badge badge-medium">Orta Mod</span>';
      }
    }
  };

  updatePresetCardsUI(currentPreset);

  document.querySelectorAll('.preset-card').forEach(card => {
    card.addEventListener('click', async event => {
      if(event.target.closest('.preset-sub-toggle'))return;
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

    apps.filter(app=>app.toLowerCase().includes((document.getElementById('search-protected')?.value||'').toLowerCase())).forEach(app => {
      const tag = document.createElement('div');
      tag.className = 'protected-tag';
      tag.innerHTML = `
        <i class="fa-solid fa-shield-halved" style="color: var(--primary);"></i>
        <span>${escapeHTML(app)}</span>
        <button type="button" class="protected-tag-remove" aria-label="Korumadan çıkar">×</button>
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
  const chkAutoExit = document.getElementById('setting-auto-exit');
  const chkMinimized = document.getElementById('setting-minimized');
  const chkNotifications = document.getElementById('setting-notifications');
  const chkAutoRestore = document.getElementById('setting-auto-restore');
  const chkSmartSweep = document.getElementById('setting-smart-sweep');
  const chkAutoGameDetection = document.getElementById('setting-auto-game-detection');
  const chkAutoGameDetectionSettings = document.getElementById('setting-auto-game-detection-settings');
  const chkKeepExplorerSettings = document.getElementById('setting-keep-explorer');

  if (chkAutostart) chkAutostart.checked = !!settings.autoStartOnBoot;
  if (chkAutoExit) chkAutoExit.checked=settings.exitAfterOptimization!==false;
  chkAutoExit?.addEventListener('change',async e=>{const updated=await api.updateSettings({exitAfterOptimization:e.target.checked});if(!e.target.checked)exitDeadline=null;if(chkAutoRestore){chkAutoRestore.disabled=false;chkAutoRestore.checked=updated.autoRestoreOnExit;}});
  if (chkMinimized) chkMinimized.checked = !!settings.startMinimized;
  if (chkNotifications) chkNotifications.checked = !!settings.notifyOnAction;
  if (chkAutoRestore) {chkAutoRestore.checked = settings.autoRestoreOnExit === true && settings.exitAfterOptimization === false;chkAutoRestore.disabled=false;}
  if (chkSmartSweep) chkSmartSweep.checked = settings.selectedBulkCloseEnabled === true;
  if (chkAutoGameDetection) chkAutoGameDetection.checked = settings.autoGameDetection !== false;
  if (chkAutoGameDetectionSettings) chkAutoGameDetectionSettings.checked = settings.autoGameDetection !== false;
  if (chkKeepExplorerSettings) chkKeepExplorerSettings.checked = settings.keepExplorer !== false;

  chkAutostart?.addEventListener('change', async e => {
    const requested=e.target.checked;e.target.disabled=true;
    try {await api.updateSettings({autoStartOnBoot:requested});showToast(requested?'Windows başlangıcı açıldı; tepside başlayacak.':'Windows başlangıcı kapatıldı.');}
    catch(err){e.target.checked=!requested;await showAlertDialog('Başlangıç kaydı değiştirilemedi: '+err.message,'Başlangıç ayarı','danger');}
    finally{e.target.disabled=false;}
  });
  chkMinimized?.addEventListener('change', (e) => {
    api.updateSettings({ startMinimized: e.target.checked });
    showToast(e.target.checked ? 'Kapatıldığında sistem tepsisine küçülecek.' : 'Kapatıldığında doğrudan sonlandırılacak.');
  });
  chkNotifications?.addEventListener('change', (e) => {
    api.updateSettings({ notifyOnAction: e.target.checked });
    showToast(e.target.checked ? 'Masaüstü bildirimleri açıldı.' : 'Masaüstü bildirimleri kapatıldı.');
  });
  chkAutoRestore?.addEventListener('change', async (e) => {
    const updated = await api.updateSettings({ autoRestoreOnExit: e.target.checked });
    e.target.checked = updated.autoRestoreOnExit;
    if(chkAutoExit)chkAutoExit.checked=updated.exitAfterOptimization!==false;
    showToast(e.target.checked ? 'Otomatik geri açma (Auto-restore) etkinleştirildi.' : 'Otomatik geri açma devre dışı bırakıldı.');
  });
  chkSmartSweep?.addEventListener('change', (e) => {
    api.updateSettings({ selectedBulkCloseEnabled: e.target.checked });
    showToast(e.target.checked ? 'Seçili uygulamalar topluca kapatılacak.' : 'Ek toplu kapatma kapatıldı.');
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
  chkKeepExplorerSettings?.addEventListener('change', async e => {
    if(!e.target.checked&&!await showConfirmDialog(desktopWarning)){e.target.checked=true;return;}
    const updated=await api.updateSettings({ keepExplorer: e.target.checked,desktopClosureConsentVersion:e.target.checked?0:1 });
    if(chkAutoExit)chkAutoExit.checked=updated.exitAfterOptimization!==false;
    showToast(e.target.checked ? 'Explorer.exe korunacak.' : 'Açılan uygulamada Explorer kurtarma korumasıyla geçici kapatılabilecek.');
  });

  // ==========================================
  // ==========================================
  // CLOUD & LOCAL UPDATER SYSTEM
  // ==========================================
  const appVersionBadge = document.getElementById('app-current-version-badge');
  const updateStatusBadge = document.getElementById('update-status-badge');
  const btnCheckGithubUpdate = document.getElementById('btn-check-github-update');
  const btnCheckUpdate = document.getElementById('btn-check-local-update');
  const btnApplyUpdate = document.getElementById('btn-apply-local-update');
  const btnPickUpdate = document.getElementById('btn-pick-local-update');
  const updateDetailsBox = document.getElementById('update-details-box');
  const githubProgressContainer = document.getElementById('github-download-progress-container');
  const githubProgressBar = document.getElementById('github-download-bar');
  const githubPercentage = document.getElementById('github-download-percentage');
  const githubDownloadInfo = document.getElementById('github-download-info');

  let pendingUpdateFilePath = '';
  let pendingGithubDownloadUrl = '';
  let pendingGithubFileName = '';

  // Load current app version
  try {
    const currentVer = await api.getAppVersion();
    if (appVersionBadge) appVersionBadge.textContent = `v${currentVer}`;
  } catch (e) {}

  // Listen for live GitHub download progress
  api.onGithubUpdateProgress((data) => {
    if (!data) return;
    if (githubProgressContainer) githubProgressContainer.style.display = 'block';
    if (githubProgressBar) githubProgressBar.style.width = `${data.percent || 0}%`;
    if (githubPercentage) githubPercentage.textContent = `%${data.percent || 0}`;
    if (githubDownloadInfo) {
      if (data.ready) {
        githubDownloadInfo.innerHTML = '<span style="color: var(--success);"><i class="fa-solid fa-circle-check"></i> İndirme tamamlandı! Yükleyici başlatılıyor...</span>';
      } else {
        githubDownloadInfo.textContent = `${data.downloadedMb || 0} MB / ${data.totalMb || 0} MB indirildi`;
      }
    }
  });

  const handleUpdateCheckResult = (res, isGithub = false) => {
    if (!res) return;
    if(res.portable) { if(updateDetailsBox){updateDetailsBox.style.display='block';updateDetailsBox.textContent='Portable kopya: yeni EXE için GitHub sürüm sayfasını açın.';} if(btnApplyUpdate)btnApplyUpdate.style.display='none'; return; }

    if (githubProgressContainer) githubProgressContainer.style.display = 'none';

    if (res.hasUpdate) {
      if (isGithub && res.downloadUrl) {
        pendingGithubDownloadUrl = res.downloadUrl;
        pendingGithubFileName = res.fileName;
        pendingUpdateFilePath = '';
      } else if (res.filePath) {
        pendingUpdateFilePath = res.filePath;
        pendingGithubDownloadUrl = '';
        pendingGithubFileName = '';
      }

      if (updateStatusBadge) {
        updateStatusBadge.textContent = `Yeni Sürüm: v${res.latestVersion}`;
        updateStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        updateStatusBadge.style.color = 'var(--success)';
        updateStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      }
      if (btnApplyUpdate) {
        btnApplyUpdate.style.display = 'inline-flex';
        btnApplyUpdate.innerHTML = isGithub
          ? `<i class="fa-solid fa-cloud-arrow-down"></i> GitHub'dan v${res.latestVersion} İndir & Kur`
          : `<i class="fa-solid fa-download"></i> v${res.latestVersion} Kur & Yeniden Başlat`;
      }
      if (updateDetailsBox) {
        updateDetailsBox.style.display = 'block';
        updateDetailsBox.innerHTML = `
          <div style="font-weight: 700; color: #fff; margin-bottom: 6px;">
            <i class="fa-solid fa-circle-check" style="color: var(--success); margin-right: 6px;"></i>Yeni Güncelleme Mevcut: v${res.latestVersion}
          </div>
          <div style="color: var(--text-main); margin-bottom: 4px;"><strong>Paket:</strong> ${res.fileName} (${res.sizeMb} MB)</div>
          <div style="color: var(--text-dim); font-size: 11.5px; margin-bottom: 8px;">Kaynak: ${isGithub ? 'GitHub Releases (' + (res.publishedAt || 'Yeni') + ')' : (res.filePath || 'Yerel')}</div>
          ${res.releaseNotes ? `
            <div style="background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; margin-top: 6px; border: 1px solid var(--border-subtle);">
              <div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase; margin-bottom: 4px;">Sürüm Yenilikleri:</div>
              <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4; white-space: pre-wrap;">${escapeHTML(res.releaseNotes)}</div>
            </div>
          ` : ''}
        `;
      }
      showToast(`Yeni sürüm bulundu: v${res.latestVersion}! Güncelle butonuna basarak yükleyebilirsiniz.`, 'fa-solid fa-cloud-arrow-down');
    } else {
      pendingUpdateFilePath = '';
      pendingGithubDownloadUrl = '';
      pendingGithubFileName = '';

      if (updateStatusBadge) {
        updateStatusBadge.textContent = 'Kontrol Sonucu';
        updateStatusBadge.style.background = 'rgba(0, 240, 255, 0.1)';
        updateStatusBadge.style.color = 'var(--primary)';
        updateStatusBadge.style.borderColor = 'rgba(0, 240, 255, 0.3)';
      }
      if (btnApplyUpdate) btnApplyUpdate.style.display = 'none';
      if (updateDetailsBox) {
        updateDetailsBox.style.display = 'block';
        updateDetailsBox.innerHTML = `
          <div style="color: var(--text-muted);">
            <i class="fa-solid fa-check-double" style="color: var(--primary); margin-right: 6px;"></i>${res.message || `Uygulamanız şu anda en güncel sürümde (v${res.currentVersion}).`}
          </div>
        `;
      }
      showToast(res.message || 'Uygulamanız güncel. Yeni bir sürüm paketi bulunamadı.');
    }
  };

  btnCheckGithubUpdate?.addEventListener('click', async () => {
    const origHtml = btnCheckGithubUpdate.innerHTML;
    btnCheckGithubUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> GitHub Taranıyor...';

    try {
      const res = await api.checkGithubUpdate();
      handleUpdateCheckResult(res, true);
    } catch (err) {
      showToast('GitHub güncelleme kontrolünde hata: ' + err.message, 'fa-solid fa-triangle-exclamation');
    } finally {
      btnCheckGithubUpdate.innerHTML = origHtml;
    }
  });

  btnCheckUpdate?.addEventListener('click', async () => {
    const origHtml = btnCheckUpdate.innerHTML;
    btnCheckUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Klasör Taranıyor...';

    try {
      const res = await api.checkLocalUpdate();
      handleUpdateCheckResult(res, false);
    } catch (err) {
      showToast('Yerel güncelleme kontrolünde hata: ' + err.message, 'fa-solid fa-triangle-exclamation');
    } finally {
      btnCheckUpdate.innerHTML = origHtml;
    }
  });

  btnApplyUpdate?.addEventListener('click', async () => {
    if (!pendingUpdateFilePath && !pendingGithubDownloadUrl) return;

    const isCloud = !!pendingGithubDownloadUrl;
    const confirmed = await showConfirmDialog({
      title: isCloud ? 'GitHub Güncellemesi İndirilsin mi?' : 'Uygulama Güncellensin mi?',
      message: isCloud
        ? 'Yeni sürüm GitHub üzerinden indirilecek ve doğrudan eski sürümün üzerine kurulacaktır. Devam edilsin mi?'
        : 'Voldena kapatılacak, yeni sürüm doğrudan eski sürümün üzerine kurulacak ve uygulama otomatik olarak yeniden açılacaktır. Devam edilsin mi?',
      confirmText: isCloud ? 'Evet, İndir ve Kur' : 'Evet, Güncelle & Başlat',
      cancelText: 'Vazgeç',
      icon: 'fa-solid fa-download',
      type: 'success'
    });

    if (confirmed) {
      if (isCloud) {
        showToast('GitHub indirmesi başlatılıyor...', 'fa-solid fa-cloud-arrow-down');
        if (btnApplyUpdate) {
          btnApplyUpdate.disabled = true;
          btnApplyUpdate.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İndiriliyor...';
        }
        if (githubProgressContainer) githubProgressContainer.style.display = 'block';

        const result = await api.downloadAndApplyGithubUpdate(pendingGithubDownloadUrl, pendingGithubFileName);
        if (result && !result.success) {
          showToast('İndirme / Kurulum hatası: ' + result.error, 'fa-solid fa-circle-exclamation');
          if (btnApplyUpdate) {
            btnApplyUpdate.disabled = false;
            btnApplyUpdate.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Tekrar Dene';
          }
        }
      } else {
        showToast('Güncelleme yükleme ekranı açılıyor, lütfen bekleyin...', 'fa-solid fa-arrows-rotate fa-spin');
        if (btnApplyUpdate) {
          btnApplyUpdate.disabled = true;
          btnApplyUpdate.innerHTML = '<i class="fa-solid fa-arrows-rotate fa-spin"></i> Yükleme Ekranı Açılıyor...';
        }
        setTimeout(async () => {
          const result = await api.applyLocalUpdate(pendingUpdateFilePath);
          if (result && !result.success) {
            showToast('Güncelleme başlatılamadı: ' + result.error, 'fa-solid fa-circle-exclamation');
            if (btnApplyUpdate) btnApplyUpdate.disabled = false;
          }
        }, 300);
      }
    }
  });

  btnPickUpdate?.addEventListener('click', async () => {
    const file = await api.selectUpdateFile();
    if (file && file.filePath) {
      handleUpdateCheckResult({
        hasUpdate: true,
        currentVersion: await api.getAppVersion(),
        latestVersion: file.fileVersion,
        filePath: file.filePath,
        fileName: file.fileName,
        sizeMb: file.sizeMb,
        date: 'Seçilen Dosya'
      }, false);
    }
  });

  // ==========================================================================
  // DISK CLEANER & STORAGE MANAGEMENT
  // ==========================================================================
  let currentSelectedDrive = 'C:';
  let cachedDrives = [];
  const diskScanCache = new window.DiskScanCache();

  const switchToDiskTab = (driveLetter = null) => {
    navItems.forEach(n => n.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));

    const diskNav = document.querySelector('.nav-item[data-tab="disk"]');
    const diskTab = document.getElementById('tab-disk');
    if (diskNav) diskNav.classList.add('active');
    if (diskTab) diskTab.classList.add('active');

    loadDiskTabContent(driveLetter);
  };

  // 1. Dashboard Drives Widget
  const loadDashboardDrives = async () => {
    const container = document.getElementById('dashboard-drives-container');
    if (!container) return;

    try {
      const drives = await api.getDrivesInfo();
      cachedDrives = drives;
      if (!drives || drives.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); font-size: 11.5px; padding: 6px 0;">Sürücü bilgisi alınamadı.</div>';
        return;
      }

      container.innerHTML = '';
      drives.forEach(drive => {
        const row = document.createElement('div');
        row.className = 'dash-drive-row';
        row.title = `${drive.name} - Tıklayarak detaylı temizlik menüsünde aç`;

        let barColor = 'linear-gradient(135deg, #00f0ff 0%, #0077ff 100%)';
        if (drive.usedPercent >= 90) {
          barColor = 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)';
        } else if (drive.usedPercent >= 80) {
          barColor = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        }

        row.innerHTML = `
          <div class="dash-drive-left">
            <span class="dash-drive-letter">${drive.letter}</span>
            <div class="dash-drive-bar-wrapper">
              <div class="dash-drive-bar-fill" style="width: ${drive.usedPercent}%; background: ${barColor};"></div>
            </div>
          </div>
          <span class="dash-drive-stats">${drive.freeGb} GB Boş <span style="color: var(--text-dim); font-size: 10px;">/ ${drive.totalGb} GB</span></span>
        `;

        row.addEventListener('click', () => {
          switchToDiskTab(drive.letter);
        });

        container.appendChild(row);
      });
    } catch (err) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 11.5px; padding: 6px 0;">Disk bilgileri alınamadı.</div>';
    }
  };

  // Dashboard quick disk clean button
  document.getElementById('btn-quick-disk-clean')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-quick-disk-clean');
    const origHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Önizleme...';
    btn.disabled = true;

    try {
      const res = await window.openCleanupPreview();
      if (!res.success) { showToast(res.message || res.error || 'İptal edildi.'); return; }
      showToast(res.message || 'Disk çöp ve geçici dosyaları başarıyla temizlendi!', 'fa-solid fa-broom');
      await loadDashboardDrives();
      if (document.getElementById('tab-disk')?.classList.contains('active')) {
        await loadDiskTabContent(currentSelectedDrive);
      }
    } catch (err) {
      showToast('Disk temizleme hatası: ' + err.message, 'fa-solid fa-triangle-exclamation');
    } finally {
      btn.innerHTML = origHtml;
      btn.disabled = false;
    }
  });

  document.getElementById('btn-open-disk-tab')?.addEventListener('click', () => {
    switchToDiskTab();
  });

  // 2. Full Disk Tab Logic
  const loadDiskTabContent = async (targetDrive = null) => {
    try {
      const drives = await api.getDrivesInfo();
      cachedDrives = drives;

      if (targetDrive) {
        currentSelectedDrive = targetDrive;
      } else if (!currentSelectedDrive && drives.length > 0) {
        currentSelectedDrive = drives[0].letter;
      }

      renderDiskDrivesGrid(drives);
      updateActiveDriveHeader();
      await loadJunkSummary();
      await scanLargeFilesForCurrentDrive();
    } catch (err) {
      console.error('Disk tab yüklenirken hata:', err);
    }
  };

  const renderDiskDrivesGrid = (drives) => {
    const container = document.getElementById('disk-drives-list');
    if (!container) return;
    container.innerHTML = '';

    if (!drives || drives.length === 0) {
      container.innerHTML = '<div class="text-muted" style="font-size: 13px;">Takılı sabit disk bulunamadı.</div>';
      return;
    }

    drives.forEach(d => {
      const card = document.createElement('div');
      card.className = `disk-drive-card ${d.letter.toUpperCase() === currentSelectedDrive.toUpperCase() ? 'active-drive-card' : ''}`;

      let barColor = 'linear-gradient(135deg, #00f0ff 0%, #0077ff 100%)';
      let statusBadge = `<span class="badge badge-low">%${d.usedPercent} Dolu</span>`;
      if (d.usedPercent >= 90) {
        barColor = 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)';
        statusBadge = `<span class="badge badge-high" style="color: #fff; background: rgba(244, 63, 94, 0.25);">%${d.usedPercent} Dolu (Kritik)</span>`;
      } else if (d.usedPercent >= 80) {
        barColor = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)';
        statusBadge = `<span class="badge badge-medium">%${d.usedPercent} Dolu</span>`;
      }

      card.innerHTML = `
        <div class="disk-drive-card-header">
          <div class="disk-drive-title-box">
            <div class="disk-drive-icon">
              <i class="fa-solid fa-hard-drive"></i>
            </div>
            <div>
              <div class="disk-drive-name">${d.name}</div>
              <div class="disk-drive-letter-badge">Sürücü ${d.letter}</div>
            </div>
          </div>
          ${statusBadge}
        </div>

        <div class="disk-capacity-bar-bg">
          <div class="disk-capacity-bar-fill" style="width: ${d.usedPercent}%; background: ${barColor};"></div>
        </div>

        <div class="disk-drive-foot">
          <span><strong>${d.freeGb} GB</strong> Boş</span>
          <span>${d.usedGb} GB / ${d.totalGb} GB</span>
        </div>
      `;

      card.addEventListener('click', () => {
        currentSelectedDrive = d.letter;
        document.querySelectorAll('.disk-drive-card').forEach(c => c.classList.remove('active-drive-card'));
        card.classList.add('active-drive-card');
        updateActiveDriveHeader();
        scanLargeFilesForCurrentDrive();
      });

      container.appendChild(card);
    });
  };

  const updateActiveDriveHeader = () => {
    const titleEl = document.getElementById('disk-active-drive-title');
    const subEl = document.getElementById('disk-active-drive-subtitle');
    const selected = cachedDrives.find(d => d.letter.toUpperCase() === currentSelectedDrive.toUpperCase());

    if (titleEl) {
      titleEl.innerHTML = `<i class="fa-solid fa-broom"></i> Çöp & Geçici Sistem Dosyaları (${currentSelectedDrive})`;
    }
    if (subEl) {
      if (selected) {
        subEl.textContent = 'Kullanıcı Temp ve CrashDumps klasörlerindeki eski geçici dosyalar incelenir. Windows, oyunlar ve geri dönüşüm kutusu kapsam dışıdır.';
      } else {
        subEl.textContent = `Seçili sürücü: ${currentSelectedDrive}`;
      }
    }
  };

  const loadJunkSummary = async () => {
    const container = document.getElementById('disk-junk-categories');
    if (!container) return;

    container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 10px 0;"><i class="fa-solid fa-spinner fa-spin"></i> Çöp dosya boyutları taranıyor...</div>';

    try {
      const summary = await api.getJunkSummary();
      container.innerHTML = '';

      if (summary && summary.categories) {
        summary.categories.forEach(cat => {
          const item = document.createElement('div');
          item.className = 'junk-cat-card';
          item.innerHTML = `
            <div class="junk-cat-icon">
              <i class="${cat.icon}"></i>
            </div>
            <div class="junk-cat-info">
              <div class="junk-cat-name">${cat.name}</div>
              <div class="junk-cat-size">${cat.displaySize}</div>
            </div>
          `;
          container.appendChild(item);
        });

        // Add Recycle bin item
        const trashItem = document.createElement('div');
        trashItem.className = 'junk-cat-card';
        trashItem.innerHTML = `
          <div class="junk-cat-icon">
            <i class="fa-solid fa-trash-arrow-up"></i>
          </div>
          <div class="junk-cat-info">
            <div class="junk-cat-name">Windows Geri Dönüşüm Kutusu</div>
            <div class="junk-cat-size">Kapsam dışı</div>
          </div>
        `;
        // Recycle Bin is deliberately outside cleanup scope.
      }
    } catch (e) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px;">Çöp dosya detayları alınamadı.</div>';
    }
  };

  // Detailed junk clean button inside tab
  const handleJunkCleaning = async (buttonId) => {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Önizleme...';
    btn.disabled = true;

    try {
      const res = await window.openCleanupPreview();
      if (!res.success) { showToast(res.message || res.error || 'İptal edildi.'); return; }
      await showAlertDialog(
        `Çöp ve geçici dosyalar başarıyla temizlendi!<br><br><strong>${res.message}</strong>`,
        'Disk Temizliği Başarılı',
        'success',
        'fa-solid fa-check-double'
      );
      await loadDashboardDrives();
      await loadDiskTabContent(currentSelectedDrive);
    } catch (err) {
      showToast('Disk temizleme hatası: ' + err.message, 'fa-solid fa-triangle-exclamation');
    } finally {
      btn.innerHTML = origText;
      btn.disabled = false;
    }
  };

  document.getElementById('btn-clean-junk-detailed')?.addEventListener('click', () => {
    handleJunkCleaning('btn-clean-junk-detailed');
  });
  document.getElementById('btn-disk-tab-quick-clean')?.addEventListener('click', () => {
    handleJunkCleaning('btn-disk-tab-quick-clean');
  });

  // 3. Large Files Scanner (Always sorted descending by size)
  const scanLargeFilesForCurrentDrive = async (force = false) => {
    const container = document.getElementById('large-files-container');
    const selectMinSize = document.getElementById('select-large-file-min-size');
    const minMb = parseInt(selectMinSize?.value || '100', 10);

    if (!container) return;
    const drive = currentSelectedDrive;
    const cacheKey = drive+':'+minMb;
    if(!force && !diskScanCache.has(cacheKey)) {
      container.textContent='Bu kapsam henüz taranmadı. Başlatmak için Diski Tara düğmesine basın. Sekme değiştirirken önceki sonuçlar korunur.';
      return;
    }
    container.innerHTML = `
      <div style="padding: 34px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; color: var(--primary); margin-bottom: 10px; display: block;"></i>
        <span><strong>${currentSelectedDrive}</strong> sürücüsündeki büyük dosyalar taranıyor (${minMb} MB ve üzeri)...</span>
      </div>
    `;

    try {
      const files = await diskScanCache.get(cacheKey,force,()=>api.scanLargeFiles(drive,minMb));
      if(currentSelectedDrive!==drive || Number(selectMinSize?.value||100)!==minMb)return;
      container.innerHTML = '';

      if (!files || files.length === 0) {
        container.innerHTML = `
          <div style="padding: 38px 20px; text-align: center; color: var(--text-muted); font-size: 13px;">
            <i class="fa-solid fa-circle-check" style="font-size: 26px; color: var(--success); margin-bottom: 8px; display: block;"></i>
            <span>Taranan kullanıcı klasörlerinde ${minMb} MB ve üzeri dosya bulunamadı. Erişilemeyen ve kapsam dışındaki klasörler dahil değildir.</span>
          </div>
        `;
        return;
      }

      files.forEach(file => {
        const row = document.createElement('div');
        row.className = 'large-file-row';

        row.innerHTML = `
          <div class="large-file-left">
            <div class="large-file-icon-box">
              <i class="${file.icon}"></i>
            </div>
            <div class="large-file-details">
              <div class="large-file-name" title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</div>
              <div class="large-file-path" title="${escapeHTML(file.path)}">${escapeHTML(file.path)}</div>
            </div>
          </div>
          <div class="large-file-right">
            <span class="chip-sm">${file.typeBadge || 'Dosya'}</span>
            ${file.date ? `<span class="large-file-date">${file.date}</span>` : ''}
            <span class="large-file-size-badge">${file.displaySize}</span>
            <button class="btn btn-secondary large-file-btn btn-open-folder" title="Dosya Gezgini'nde Konumu Göster">
              <i class="fa-solid fa-folder-open"></i>
            </button>
            <button class="btn btn-danger large-file-btn btn-delete-file" title="Geri dönüşüm kutusuna taşı">
              <i class="fa-solid fa-trash"></i> Sil
            </button>
          </div>
        `;

        row.querySelector('.btn-open-folder')?.addEventListener('click', () => {
          api.showItemInFolder(file.path);
        });

        row.querySelector('.btn-delete-file')?.addEventListener('click', async () => {
          const confirmed = await showConfirmDialog({
            title: 'Dosyayı Silmek İstediğinize Emin misiniz?',
            message: `<strong>${escapeHTML(file.name)}</strong> (${file.displaySize})<br><br>Bu dosya geri dönüşüm kutusuna taşınacaktır. Devam etmek istiyor musunuz?`,
            icon: 'fa-solid fa-triangle-exclamation',
            confirmText: 'Evet, Dosyayı Sil',
            cancelText: 'Vazgeç',
            type: 'danger'
          });

          if (confirmed) {
            try {
              const res = await api.deleteTargetFile(file.path);
              if (res && res.success) {
                showToast('Dosya geri dönüşüm kutusuna taşındı. Alan, kutu boşaltıldığında açılır.', 'fa-solid fa-trash');
                diskScanCache.remove(file.path);
                row.remove();
                await loadDashboardDrives();
                const updatedDrives = await api.getDrivesInfo();
                renderDiskDrivesGrid(updatedDrives);
              } else {
                showToast('Dosya silinemedi: ' + (res?.error || 'Dosya kullanımda olabilir.'), 'fa-solid fa-triangle-exclamation');
              }
            } catch (err) {
              showToast('Silme hatası: ' + err.message, 'fa-solid fa-triangle-exclamation');
            }
          }
        });

        container.appendChild(row);
      });
    } catch (err) {
      container.innerHTML = `
        <div style="padding: 24px; text-align: center; color: var(--danger); font-size: 13px;">
          <i class="fa-solid fa-triangle-exclamation"></i> Büyük dosyalar taranırken hata: ${err.message}
        </div>
      `;
    }
  };

  document.getElementById('btn-scan-large-files')?.addEventListener('click', () => {
    scanLargeFilesForCurrentDrive(true);
  });
  document.getElementById('select-large-file-min-size')?.addEventListener('change', () => {
    scanLargeFilesForCurrentDrive();
  });

  // Initial dashboard drives load
  loadDashboardDrives();
  document.body.dataset.ready='true';
});
