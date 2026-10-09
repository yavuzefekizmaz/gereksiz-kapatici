const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

async function launchUpdateInstaller(info, executablePath, spawnProcess = spawn) {
  const installer = info?.downloadedFile;
  if (!installer || !path.isAbsolute(installer) || path.extname(installer).toLowerCase() !== '.exe') {
    throw new Error('İndirilen kurulum dosyası bulunamadı. Güncellemeyi yeniden indirin.');
  }
  const metadata = info.files?.find(file => /\.exe$/i.test(file.url)) || info;
  if (!metadata.sha512) throw new Error('Kurulum dosyasının doğrulama bilgisi bulunamadı.');
  const handle = await fs.promises.open(installer, 'r');
  try {
    const header = Buffer.alloc(2);
    await handle.read(header, 0, 2, 0);
    if (header.toString() !== 'MZ') throw new Error('Kurulum dosyası geçerli bir Windows uygulaması değil.');
  } finally { await handle.close(); }
  const hash = crypto.createHash('sha512');
  for await (const chunk of fs.createReadStream(installer)) hash.update(chunk);
  if (hash.digest('base64') !== metadata.sha512) {
    throw new Error('Kurulum dosyası doğrulanamadı. Güncellemeyi yeniden indirin.');
  }
  // /D must be last for NSIS. Pass arguments directly, without shell quoting.
  // Assisted NSIS installers only automatically restart in silent mode.
  const args = ['--updated', '/S', '--force-run', `/D=${path.dirname(executablePath)}`];
  await new Promise((resolve, reject) => {
    const child = spawnProcess(installer, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

module.exports = { launchUpdateInstaller };
