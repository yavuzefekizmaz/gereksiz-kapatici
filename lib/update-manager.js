// NSIS supports in-app updates. electron-updater does not replace portable EXEs.
class UpdateManager {
  constructor({ app, updater, supported, notify = () => {}, beforeInstall = () => true }) {
    this.app = app;
    this.updater = updater;
    this.supported = supported;
    this.notify = notify;
    this.beforeInstall = beforeInstall;
    this.checking = false;
    this.downloading = false;
    this.state = {
      status: supported ? 'idle' : 'unsupported',
      currentVersion: app.getVersion(),
      message: supported ? 'Güncellemeler GitHub üzerinden kontrol edilir.' :
        'Portable sürümde güncellemek için yeni EXE indirilir. Uygulama içinden kurulum setup sürümünde desteklenir.'
    };
    if (!supported) return;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.on('checking-for-update', () => this.setState({ status: 'checking', message: 'Güncelleme kontrol ediliyor...' }));
    updater.on('update-available', info => this.setState({ status: 'available', version: info.version,
      message: `Yeni sürüm hazır: ${info.version}` }));
    updater.on('update-not-available', () => this.setState({ status: 'current', message: 'En güncel sürümü kullanıyorsunuz.' }));
    updater.on('download-progress', info => this.setState({ status: 'downloading', progress: info.percent,
      message: `Güncelleme indiriliyor: %${Math.round(info.percent)}` }));
    updater.on('update-downloaded', info => this.setState({ status: 'downloaded', version: info.version,
      message: 'Güncelleme indirildi. Kurulum için uygulama yeniden başlatılacak.' }));
    updater.on('error', err => this.setState({ status: 'error', message: `Güncelleme tamamlanamadı: ${err.message}` }));
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this.notify(this.state);
  }

  async check() {
    if (!this.supported || this.checking || this.downloading || this.state.status === 'downloaded') return this.state;
    this.checking = true;
    try {
      await this.updater.checkForUpdates();
    } catch (err) {
      this.setState({ status: 'error', message: `Güncelleme kontrol edilemedi: ${err.message}` });
    } finally { this.checking = false; }
    return this.state;
  }

  async download() {
    if (!this.supported || this.downloading || this.state.status !== 'available') return this.state;
    this.downloading = true;
    this.setState({ status: 'downloading', progress: 0, message: 'Güncelleme indiriliyor...' });
    try {
      await this.updater.downloadUpdate();
    } catch (err) {
      this.setState({ status: 'error', message: `Güncelleme indirilemedi: ${err.message}` });
    } finally { this.downloading = false; }
    return this.state;
  }

  install() {
    if (!this.supported || this.state.status !== 'downloaded') return this.state;
    if (!this.beforeInstall()) {
      this.setState({ message: 'Güncellemeyi kurmadan önce açık oyunu kapatın.' });
      return this.state;
    }
    this.app.isQuitting = true;
    this.updater.quitAndInstall(false, true);
    return this.state;
  }
}

module.exports = UpdateManager;
