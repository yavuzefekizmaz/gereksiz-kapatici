const fs = require('node:fs');
const crypto = require('node:crypto');
const { launchUpdateInstaller } = require('../lib/update-installer');
const [installer, executable] = process.argv.slice(2);
const sha512 = crypto.createHash('sha512').update(fs.readFileSync(installer)).digest('base64');
launchUpdateInstaller({ downloadedFile: installer, files: [{ url: 'setup.exe', sha512 }] }, executable)
  .catch(err => { console.error(err); process.exitCode = 1; });
