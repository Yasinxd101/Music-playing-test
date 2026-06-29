/* Assembles the static web app into ./www so Capacitor can bundle it into the APK.
 * Keeps the APK payload to just the app shell (no node_modules / android project). */

import { mkdirSync, copyFileSync, rmSync } from 'node:fs';

const OUT = 'www';
const FILES = ['index.html', 'app.js', 'styles.css', 'manifest.json', 'sw.js'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const f of FILES) {
  copyFileSync(f, `${OUT}/${f}`);
  console.log(`copied ${f} -> ${OUT}/${f}`);
}

console.log(`\nBuilt web bundle into ./${OUT}`);
