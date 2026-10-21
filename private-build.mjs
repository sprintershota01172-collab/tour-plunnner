// Migration staging only: output contains runtime files, not GitHub metadata, docs or server secrets.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
const files = [
  [
    "dist/index.html",
    "index.html"
  ],
  [
    "dist/app.js",
    "app.js"
  ],
  [
    "dist/styles.css",
    "styles.css"
  ],
  [
    "dist/sw.js",
    "sw.js"
  ],
  [
    "dist/manifest.webmanifest",
    "manifest.webmanifest"
  ],
  [
    "dist/accounts.js",
    "accounts.js"
  ],
  [
    "dist/account-ui.js",
    "account-ui.js"
  ],
  [
    "dist/account.css",
    "account.css"
  ],
  [
    "dist/sync.js",
    "sync.js"
  ],
  [
    "dist/i18n.js",
    "i18n.js"
  ],
  [
    "dist/notifications.js",
    "notifications.js"
  ],
  [
    "dist/date-range.js",
    "date-range.js"
  ],
  [
    "dist/mobile-input.js",
    "mobile-input.js"
  ],
  [
    "dist/line-share.html",
    "line-share.html"
  ],
  [
    "dist/line-share.js",
    "line-share.js"
  ],
  [
    "dist/line-invite.js",
    "line-invite.js"
  ],
  [
    "dist/line-config.json",
    "line-config.json"
  ],
  [
    "dist/icon-192.png",
    "icon-192.png"
  ],
  [
    "dist/icon-512.png",
    "icon-512.png"
  ],
  [
    "dist/apple-touch-icon.png",
    "apple-touch-icon.png"
  ],
  [
    "dist/icon.svg",
    "icon.svg"
  ],
  [
    "dist/flight-mark.svg",
    "flight-mark.svg"
  ],
  [
    "dist/invite-card-art.png",
    "invite-card-art.png"
  ],
  [
    "dist/invite-card-art.svg",
    "invite-card-art.svg"
  ]
];
const output = 'private-dist';
rmSync(output, { recursive: true, force: true });
for (const [source, target] of files) {
  if (!existsSync(source)) throw new Error('Required runtime asset missing: ' + source);
  const destination = join(output, target);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}
if (!existsSync(join(output, 'index.html'))) throw new Error('index.html missing');
console.log('Prepared ' + files.length + ' allowlisted app assets');
