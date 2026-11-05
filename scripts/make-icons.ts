/**
 * Generates PWA icons (no dependencies): ink tile with three ascending green bars,
 * echoing the dashboard's bar charts. Run: npm run icons
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const INK = [0x1b, 0x1a, 0x17], GREEN = [0x2f, 0x6f, 0x4f], BG = [0xf4, 0xf2, 0xee], LIGHT = [0xf4, 0xf2, 0xee];

function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size: number, px: (x: number, y: number) => number[]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y);
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function icon(size: number, opts: { rounded: boolean; safe: number }) {
  const r = opts.rounded ? size * 0.2 : 0;
  const s = opts.safe; // fraction of size used by artwork
  const pad = (size * (1 - s)) / 2;
  const inner = size * s;
  const bars = [0.42, 0.62, 0.86]; // heights
  const bw = inner * 0.16, gap = inner * 0.1;
  const total = bw * 3 + gap * 2;
  const x0 = pad + (inner - total) / 2;
  const base = pad + inner * 0.8;
  const rr = bw * 0.18;
  return png(size, (x, y) => {
    // rounded tile mask
    if (r) {
      const cx = x < r ? r : x > size - r ? size - r : x;
      const cy = y < r ? r : y > size - r ? size - r : y;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) return BG;
    }
    for (let i = 0; i < 3; i++) {
      const bx = x0 + i * (bw + gap), top = base - inner * 0.6 * bars[i];
      if (x >= bx && x < bx + bw && y >= top && y < base) {
        // round the top corners
        const lx = x < bx + rr ? bx + rr : x > bx + bw - rr ? bx + bw - rr : x;
        if (y < top + rr && (x - lx) ** 2 + (y - (top + rr)) ** 2 > rr * rr) return INK;
        return i === 2 ? LIGHT : GREEN;
      }
    }
    // baseline
    if (y >= base + inner * 0.03 && y < base + inner * 0.03 + Math.max(2, inner * 0.02) && x >= x0 && x < x0 + total) return [0x4a, 0x47, 0x3f];
    return INK;
  });
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", icon(192, { rounded: true, safe: 0.8 }));
writeFileSync("public/icons/icon-512.png", icon(512, { rounded: true, safe: 0.8 }));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, { rounded: false, safe: 0.62 }));
writeFileSync("public/icons/apple-touch-icon.png", icon(180, { rounded: false, safe: 0.8 }));
writeFileSync("src/app/favicon.ico", icon(48, { rounded: true, safe: 0.85 })); // PNG-in-.ico is accepted by browsers
console.log("icons written");
