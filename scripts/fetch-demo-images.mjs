import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOM_TO_DIR = {
  LIVING: 'living',
  KITCHEN: 'kitchen',
  BATHROOM: 'bathroom',
  BEDROOM: 'bedroom',
  EXTERIOR: 'exterior',
  BALCONY: 'balcony',
};

const roomImagesPath = resolve(process.cwd(), 'scripts/assets/room_images.json');
const targetRoot = process.env.DEMO_IMAGES_PUBLIC_ROOT
  ? resolve(process.cwd(), process.env.DEMO_IMAGES_PUBLIC_ROOT)
  : resolve(process.cwd(), '../../my-real-state-front-end/my-real-state/public/demo-images');

function fileName(dirName, index) {
  return `${dirName}-${String(index).padStart(2, '0')}.jpg`;
}

async function download(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const raw = await readFile(roomImagesPath, 'utf8');
  const sourceByRoom = JSON.parse(raw);

  const summary = {};

  for (const [room, dirName] of Object.entries(ROOM_TO_DIR)) {
    const urls = Array.isArray(sourceByRoom[room]) ? sourceByRoom[room].slice(0, 30) : [];
    const outDir = resolve(targetRoot, dirName);
    await mkdir(outDir, { recursive: true });

    let ok = 0;
    let fail = 0;

    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i];
      const outFile = resolve(outDir, fileName(dirName, i + 1));
      try {
        const data = await download(url);
        await writeFile(outFile, data);
        ok += 1;
      } catch (err) {
        fail += 1;
        console.error(`[${room}] failed #${i + 1}: ${url} -> ${String(err?.message || err)}`);
      }
    }

    summary[room] = { downloaded: ok, failed: fail, total: urls.length };
  }

  console.log('Download complete.');
  console.log('Target root:', targetRoot);
  for (const [room, stats] of Object.entries(summary)) {
    console.log(`${room}: ${stats.downloaded}/${stats.total} downloaded, ${stats.failed} failed`);
  }
}

main().catch((err) => {
  console.error('demo:images:fetch failed', err);
  process.exit(1);
});
