// Local screenshot beautifier for changelog images.
// Embeds a PNG in an HTML template and renders it with headless Chrome —
// perspective tilt (or flat), soft gradient backdrop, rounded corners, shadow.
// Fully local: no network, no upload (safe for shots with internal data).
//
// Usage:  bun beautify-screenshot.ts <in.png> <out.png> [tilt|flat] [x,y,w,h]
//   x,y,w,h  optional crop rectangle in source pixels — zoom into the feature
//            instead of framing the whole window.
// Needs:  Google Chrome (or set CHROME=/path/to/chrome). Compress the output
//         afterwards, e.g. `pngquant --quality=58-84 out.png`.

import { rmSync } from "node:fs";
import { resolve } from "node:path";

const [inPath, outPathArg, style = "tilt", cropArg] = process.argv.slice(2);
if (!inPath || !outPathArg) {
	console.error(
		"usage: bun beautify-screenshot.ts <in.png> <out.png> [tilt|flat] [x,y,w,h]",
	);
	process.exit(2);
}
const outPath = resolve(outPathArg);
const CHROME =
	process.env.CHROME ??
	"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCALE = 2;
// Bigger frame + tighter canvas = the UI reads larger, less dead background.
const CANVAS_W = 1600;
const CANVAS_H = style === "tilt" ? 1040 : 980;
const FRAME_FRAC = style === "tilt" ? 0.86 : 0.92;
const tilt =
	style === "tilt"
		? "perspective(2600px) rotateY(-8deg) rotateX(3deg) rotateZ(-0.6deg)"
		: "none";

const bytes = new Uint8Array(await Bun.file(inPath).arrayBuffer());
const W0 =
	((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
const H0 =
	((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
const img = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

// Either show the whole image, or crop into a feature region via background-position.
let shot: string;
let aspect = W0 / H0;
if (cropArg) {
	const segs = cropArg.split(",");
	const nums = segs.map((s) => Number(s.trim()));
	if (
		segs.length !== 4 ||
		segs.some((s) => s.trim() === "") ||
		nums.some((n) => !Number.isFinite(n))
	) {
		console.error(
			`invalid crop "${cropArg}" — expected four numbers x,y,w,h (source px)`,
		);
		process.exit(2);
	}
	const [cx, cy, cw, ch] = nums;
	aspect = cw / ch;
	const sizeW = ((W0 / cw) * 100).toFixed(3);
	const posX = W0 - cw > 0 ? ((cx / (W0 - cw)) * 100).toFixed(3) : "0";
	const posY = H0 - ch > 0 ? ((cy / (H0 - ch)) * 100).toFixed(3) : "0";
	shot = `<div class="shot" style="aspect-ratio:${cw}/${ch};
		background-image:url(${img}); background-size:${sizeW}% auto;
		background-position:${posX}% ${posY}%; background-repeat:no-repeat;"></div>`;
} else {
	shot = `<img src="${img}">`;
}

// Contain-fit: constrain the frame by BOTH width and height so tall/narrow
// crops float as a bordered card on the backdrop instead of overflowing the
// canvas and getting cut off top/bottom.
const frameW = Math.round(
	Math.min(CANVAS_W * FRAME_FRAC, CANVAS_H * FRAME_FRAC * aspect),
);

const html = `<!doctype html><html><head><meta charset="utf8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${CANVAS_W}px; height:${CANVAS_H}px; overflow:hidden; }
  .stage {
    position:relative; width:${CANVAS_W}px; height:${CANVAS_H}px;
    background:#050505; display:flex; align-items:center; justify-content:center;
  }
  /* soft out-of-focus highlights, like light on dark marble */
  .glow { position:absolute; border-radius:50%; filter:blur(120px); }
  .g1 { width:900px; height:520px; left:-160px; top:-140px; background:#6b6f78; opacity:.38; }
  .g2 { width:760px; height:760px; left:-220px; bottom:-320px; background:#3a3d44; opacity:.55; }
  .g3 { width:820px; height:560px; right:-200px; bottom:-200px; background:#585c66; opacity:.32; }
  .g4 { width:520px; height:520px; right:-120px; top:-160px; background:#2a2c31; opacity:.6; }
  .noise { position:absolute; inset:0; opacity:.045; mix-blend-mode:screen; }
  .frame {
    position:relative; width:${frameW}px; transform:${tilt}; transform-origin:center;
    border-radius:16px; overflow:hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,.4),
                0 40px 80px -20px rgba(0,0,0,.75),
                0 80px 160px -40px rgba(0,0,0,.65),
                0 0 0 1px rgba(255,255,255,.06) inset;
  }
  .frame img, .frame .shot { display:block; width:100%; height:auto; }
</style></head><body>
  <div class="stage">
    <div class="glow g1"></div><div class="glow g2"></div>
    <div class="glow g3"></div><div class="glow g4"></div>
    <svg class="noise" xmlns="http://www.w3.org/2000/svg"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2"/></filter><rect width="100%" height="100%" filter="url(#n)"/></svg>
    <div class="frame">${shot}</div>
  </div>
</body></html>`;

// Temp path independent of the output filename (never collides with outPath).
const htmlPath = `${outPath}.beautify-${process.pid}.html`;
await Bun.write(htmlPath, html);

// Unique profile per run; a stale SingletonLock otherwise hangs Chrome.
const profile = `/tmp/chrome-beautify-${process.pid}`;
const proc = Bun.spawnSync(
	[
		CHROME,
		"--headless=new",
		"--disable-gpu",
		"--hide-scrollbars",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--disable-background-networking",
		"--virtual-time-budget=4000",
		`--force-device-scale-factor=${SCALE}`,
		`--window-size=${CANVAS_W},${CANVAS_H}`,
		`--user-data-dir=${profile}`,
		`--screenshot=${outPath}`,
		`file://${htmlPath}`, // absolute file:// required
	],
	{ timeout: 30000 },
);

rmSync(htmlPath, { force: true });
rmSync(profile, { recursive: true, force: true });

if (proc.exitCode !== 0) {
	console.error("chrome failed", proc.exitCode, proc.stderr.toString());
	process.exit(1);
}
console.log("wrote", outPath);
