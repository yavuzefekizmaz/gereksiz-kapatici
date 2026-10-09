// NSIS supports in-app updates. electron-updater does not replace portable EXEs.
const { launchUpdateInstaller } = require('./update-installer');

class UpdateManager {
  constructor({ app, updater, supported, notify = () => {}, beforeInstall = () => true,
    prepareToQuit = () => {}, launchInstaller = launchUpdateInstaller, logger = console }) {
    this.app = app;
    this.updater = updater;
    this.supported = supported;
    this.notify = notify;
    this.beforeInstall = beforeInstall;
    this.prepareToQuit = prepareToQuit;
    this.launchInstaller = launchInstaller;
    this.logger = logger;
    this.installing = false;
    this.downloadedInfo = null;
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
    updater.autoRunAppAfterInstall = true;
    updater.on('checking-for-update', () => this.setState({ status: 'checking', message: 'Güncelleme kontrol ediliyor...' }));
    updater.on('update-available', info => this.setState({ status: 'available', version: info.version,
      message: `Yeni sürüm hazır: ${info.version}` }));
    updater.on('update-not-available', () => this.setState({ status: 'current', message: 'En güncel sürümü kullanıyorsunuz.' }));
    updater.on('download-progress', info => this.setState({ status: 'downloading', progress: info.percent,
      message: `Güncelleme indiriliyor: %${Math.round(info.percent)}` }));
    updater.on('update-downloaded', info => {
      this.downloadedInfo = info;
      this.setState({ status: 'downloaded', version: info.version,
        message: 'Güncelleme indirildi. Kurulum tamamlanınca uygulama otomatik açılacak.' });
    });
    updater.on('error', err => this.setState({ status: 'error', message: `Güncelleme tamamlanamadı: ${err.message}` }));
  }

  setState(next) {
    this.state = { ...this.state, ...next };
    this.notify(this.state);
  }

  async check() {
    if (!this.supported || this.checking || this.downloading || this.installing || this.state.status === 'downloaded') return this.state;
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

  async install() {
    if (!this.supported || this.installing || this.state.status !== 'downloaded') return this.state;
    if (!this.beforeInstall()) {
      this.setState({ message: 'Güncellemeyi kurmadan önce açık oyunu kapatın.' });
      return this.state;
    }
    this.installing = true;
    this.setState({ status: 'installing', message: 'Kurulum dosyası doğrulanıyor ve güncelleme başlatılıyor...' });
    try {
      await this.launchInstaller(this.downloadedInfo, this.app.getPath('exe'));
      this.logger.info('Update installer started; quitting for silent installation and restart.');
      this.app.isQuitting = true;
      this.prepareToQuit();
      this.app.quit();
    } catch (err) {
      this.app.isQuitting = false;
      this.logger.error(`Update installer launch failed: ${err.message}`);
      this.setState({ status: 'downloaded', message: `Kurulum başlatılamadı: ${err.message} Uygulama açık tutuldu; tekrar deneyebilir veya setup dosyasını elle çalıştırabilirsiniz.` });
    } finally { this.installing = false; }
    return this.state;
  }
}

module.exports = UpdateManager;
