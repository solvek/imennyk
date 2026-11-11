// Cuts the two pages of a confession spread into overlapping horizontal strips, with a ruler of scan
// pixels (a tick every 50 px, a label every 100) on the left edge, so the reader can say where a row is.
//   node tools/scan-crops/crops.mjs <scan.jpg> <outdir> [name]
// Writes <outdir>/<name>L1.jpg, L2, L3, R1, R2, R3 (strips of the left and the right page).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const [img, outdir, nameArg] = process.argv.slice(2);
const name = nameArg ?? path.basename(img, '.jpg');
fs.mkdirSync(outdir, { recursive: true });
const [W, H] = execFileSync('magick', ['identify', '-format', '%w %h', img]).toString().split(' ').map(Number);
// Page table x range as a fraction of the width, y range of the table body.
const pages = { L: [0.115, 0.52], R: [0.53, 0.935] };
const top = Math.round(H * 0.1), bottom = Math.round(H * 0.96), strip = 1500, step = 1350;
for (const [p, [a, b]] of Object.entries(pages)) {
  const x0 = Math.round(W * a), w = Math.round(W * (b - a));
  let k = 1;
  for (let y = top; y < bottom - 200; y += step, k++) {
    const h = Math.min(strip, bottom - y);
    const args = [img, '-crop', `${w}x${h}+${x0}+${y}`, '+repage', '-fill', 'red', '-stroke', 'red'];
    for (let t = Math.ceil(y / 50) * 50; t < y + h; t += 50) {
      const ty = t - y; const len = t % 100 === 0 ? 60 : 30;
      args.push('-strokewidth', '4', '-draw', `line 0,${ty} ${len},${ty}`);
      if (t % 100 === 0) args.push('-stroke', 'none', '-pointsize', '34', '-annotate', `+66+${ty + 12}`, String(t), '-stroke', 'red');
    }
    args.push('-resize', '66%', '-quality', '85', path.join(outdir, `${name}${p}${k}.jpg`));
    execFileSync('magick', args);
    args.length = 0;
  }
  console.log(`${p}: x ${x0}..${x0 + w}`);
}
