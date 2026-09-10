// Local screenshot beautifier for changelog images.
// Embeds a PNG in an HTML template and renders it with headless Chrome —
// perspective tilt (or flat), a dithered-shader backdrop (the same
// @paper-design/shaders Dithering effect the marketing site and desktop
// welcome cards use), rounded corners, shadow, optional feature highlight.
// Fully local: no network, no upload (safe for shots with internal data).
//
// Usage:  bun beautify-screenshot.ts <in.png> <out.png> [card|flat|corner|tilt] [x,y,w,h] [flags]
//   card               the changelog default (Linear-style): flat product card
//                      with a hairline border on a near-black backdrop, no
//                      dither, no perspective. Pair with --bleed for heroes.
//   corner             social-post framing (Figma-style): the window sits
//                      top-left, oversized, and runs off the right and bottom
//                      edges; the backdrop is whatever --bg says (glow by
//                      default). First used for the 17-languages launch.
//   flat / tilt        the older dithered-backdrop looks; tilt is retired for
//                      heroes (Kiet, 2026-08-23: no slanted heroes).
//   x,y,w,h            optional crop rectangle in source pixels — zoom into the
//                      feature instead of framing the whole window.
//
// Flags (all optional):
//   --bg <preset>      backdrop palette: flame (default) | ember | moss |
//                      indigo | violet | glow (the marketing hero's ember
//                      stage lighting on near-black, no shader; default for
//                      corner) | plain (legacy glow, no shader) |
//                      random (seeded pick)
//   --glow <n>         glow backdrop strength 0-1 (default 0.4)
//   --transparent      drop the backdrop entirely and write a PNG with alpha
//                      (window + shadow only), for compositing over video or
//                      an animated glow. Uses the style's layout.
//   --accent <hex>     custom shader ink color, overrides the preset hue
//   --seed <n>         vary the dither pattern phase/placement deterministically;
//                      same seed = same output. Use different seeds across one
//                      changelog entry so backgrounds don't repeat exactly.
//   --shape <name>     dither pattern: warp (site default) | simplex | dots |
//                      wave | ripple | swirl | sphere
//   --px <n>           dither dot size in px (default 3.5; the site UI uses 2,
//                      but backdrops read better chunkier)
//   --bg-opacity <n>   shader layer opacity 0-1 (default 0.34)
//   --highlight x,y,w,h  draw a glowing accent ring around a region (source px,
//                      same space as the crop rect) and dim everything else in
//                      the frame — points the reader at the feature.
//   --hl-dim <n>       how much to dim outside the highlight, 0-1 (default
//                      0.42; use ~0.2 when the dimmed area must stay readable)
//   --bleed            (card only) anchor the card near the top and let it run
//                      off the bottom edge under a fade, the way Linear frames
//                      a tall surface; the crop should be taller than 16:10
//
// Needs:  Google Chrome (or set CHROME=/path/to/chrome). Compress the output
//         afterwards, e.g. `pngquant --quality=58-84 out.png`.

import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const flags = new Map<string, string>();
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
	const a = args[i];
	if (a.startsWith("--")) {
		flags.set(a.slice(2), args[++i] ?? "");
	} else {
		positional.push(a);
	}
}
const [inPath, outPathArg, style = "card", cropArg] = positional;
const isCard = style === "card";
const isCorner = style === "corner";
const bleed = isCard && flags.has("bleed");
if (!inPath || !outPathArg) {
	console.error(
		"usage: bun beautify-screenshot.ts <in.png> <out.png> [card|flat|tilt] [x,y,w,h] [--bleed] [--bg preset] [--seed n] [--highlight x,y,w,h]",
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
const CANVAS_H = isCard ? 925 : style === "tilt" ? 1040 : isCorner ? 925 : 980;
// corner: wider than the canvas so the window runs off the right edge.
const FRAME_FRAC = isCard ? 0.84 : style === "tilt" ? 0.86 : isCorner ? 1.06 : 0.92;
const tilt =
	style === "tilt"
		? "perspective(2600px) rotateY(-8deg) rotateX(3deg) rotateZ(-0.6deg)"
		: "none";

// Backdrop palettes lifted from the site: marketing FeaturesSection ramps and
// the desktop import-wizard / flip-notice warm cover (#f97316).
const PRESETS: Record<string, string> = {
	flame: "#f97316",
	ember: "#991b1b",
	moss: "#047857",
	indigo: "#1e40af",
	violet: "#7c3aed",
};
const seed = Number(flags.get("seed") ?? "1") || 1;
// Small deterministic PRNG so --seed varies pattern phase and placement.
const rand = (() => {
	let s = (seed * 2654435761) >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
})();
let bgName = flags.get("bg") ?? (isCorner ? "glow" : "flame");
if (bgName === "random") {
	const names = Object.keys(PRESETS);
	bgName = names[Math.floor(rand() * names.length)];
}
const isGlow = bgName === "glow";
const usePlain = bgName === "plain" || bgName === "glow" || isCard;
if (!usePlain && !PRESETS[bgName]) {
	console.error(
		`unknown --bg "${bgName}" — use ${Object.keys(PRESETS).join("|")}|plain|random`,
	);
	process.exit(2);
}
const accent = flags.get("accent") ?? PRESETS[bgName] ?? PRESETS.flame;
const glowStrength = Number(flags.get("glow") ?? "0.4") || 0.4;
const transparent = flags.has("transparent");
const shape = flags.get("shape") ?? "warp";
const pxSize = Number(flags.get("px") ?? "3.5") || 3.5;
const bgOpacity = Number(flags.get("bg-opacity") ?? "0.34") || 0.34;

const bytes = new Uint8Array(await Bun.file(inPath).arrayBuffer());
const W0 =
	((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
const H0 =
	((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
const img = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;

const parseRect = (raw: string, label: string): number[] => {
	const segs = raw.split(",");
	const nums = segs.map((s) => Number(s.trim()));
	if (
		segs.length !== 4 ||
		segs.some((s) => s.trim() === "") ||
		nums.some((n) => !Number.isFinite(n))
	) {
		console.error(
			`invalid ${label} "${raw}" — expected four numbers x,y,w,h (source px)`,
		);
		process.exit(2);
	}
	return nums;
};

// Either show the whole image, or crop into a feature region via background-position.
let shot: string;
let aspect = W0 / H0;
// Region of the source shown in the frame (defaults to the full image).
let view = [0, 0, W0, H0];
if (cropArg) {
	const [cx, cy, cw, ch] = parseRect(cropArg, "crop");
	view = [cx, cy, cw, ch];
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
	bleed || isCorner
		? CANVAS_W * FRAME_FRAC
		: Math.min(CANVAS_W * FRAME_FRAC, CANVAS_H * FRAME_FRAC * aspect),
);

// Optional highlight: accent ring + dim outside, in source-pixel coordinates.
let highlight = "";
if (flags.has("highlight")) {
	const [hx, hy, hw, hh] = parseRect(flags.get("highlight") ?? "", "highlight");
	const k = frameW / view[2]; // source px -> frame px
	const x = (hx - view[0]) * k;
	const y = (hy - view[1]) * k;
	highlight = `<div class="hl" style="left:${x.toFixed(1)}px; top:${y.toFixed(1)}px;
		width:${(hw * k).toFixed(1)}px; height:${(hh * k).toFixed(1)}px;"></div>`;
}

// Shader mount script: bundle the vanilla @paper-design/shaders package (the
// dep of the shaders-react package both apps use) into an inline module.
let shaderScript = "";
if (!usePlain) {
	const reactPkg = Bun.resolveSync(
		"@paper-design/shaders-react",
		resolve(import.meta.dir, "../../apps/marketing"),
	);
	const shadersPkg = Bun.resolveSync(
		"@paper-design/shaders",
		dirname(reactPkg),
	);
	const frame = Math.floor(rand() * 120000);
	const offsetX = (rand() * 2 - 1) * 0.4;
	const offsetY = (rand() * 2 - 1) * 0.4;
	const rotation = Math.floor(rand() * 360);
	const entry = `
		import {
			ShaderMount, ditheringFragmentShader, getShaderColorFromString,
			DitheringShapes, DitheringTypes,
		} from ${JSON.stringify(shadersPkg)};
		const host = document.getElementById("dither");
		try {
			new ShaderMount(host, ditheringFragmentShader, {
				u_colorBack: getShaderColorFromString("#00000000"),
				u_colorFront: getShaderColorFromString(${JSON.stringify(accent)}),
				u_shape: DitheringShapes[${JSON.stringify(shape)}] ?? DitheringShapes.warp,
				u_type: DitheringTypes["4x4"],
				u_pxSize: ${pxSize},
				u_fit: 2, u_scale: 1, u_rotation: ${rotation},
				u_originX: 0.5, u_originY: 0.5,
				u_offsetX: ${offsetX.toFixed(3)}, u_offsetY: ${offsetY.toFixed(3)},
				u_worldWidth: 0, u_worldHeight: 0,
			}, undefined, 0, ${frame});
		} catch (e) {
			// No WebGL (e.g. bare CI runner): fall back to the plain glow backdrop.
			document.body.classList.add("no-shader");
		}
	`;
	const entryPath = `${outPath}.dither-entry-${process.pid}.ts`;
	await Bun.write(entryPath, entry);
	const build = await Bun.build({
		entrypoints: [entryPath],
		target: "browser",
		format: "esm",
		minify: true,
	});
	rmSync(entryPath, { force: true });
	if (!build.success) {
		console.error("shader bundle failed", build.logs);
		process.exit(1);
	}
	shaderScript = `<script type="module">${await build.outputs[0].text()}</script>`;
}

const html = `<!doctype html><html><head><meta charset="utf8"><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  html,body { width:${CANVAS_W}px; height:${CANVAS_H}px; overflow:hidden; }
  .stage {
    position:relative; width:${CANVAS_W}px; height:${CANVAS_H}px;
    background:#050505; display:flex; align-items:center; justify-content:center;
  }
  /* dithered shader backdrop (site identity) + vignette to keep edges dark */
  #dither { position:absolute; inset:0; opacity:${bgOpacity}; mix-blend-mode:screen; }
  .vignette { position:absolute; inset:0; background:
    radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 30%, rgba(0,0,0,.62) 100%),
    linear-gradient(to bottom, rgba(0,0,0,.12), rgba(0,0,0,.3)); }
  .tint { position:absolute; inset:0; background:
    radial-gradient(ellipse 62% 48% at 50% 46%, ${accent}14, transparent 70%); }
  /* legacy plain backdrop — used when --bg plain or WebGL is unavailable */
  .glow { position:absolute; border-radius:50%; filter:blur(120px); display:${usePlain ? "block" : "none"}; }
  body.no-shader .glow { display:block; }
  body.no-shader #dither { display:none; }
  .g1 { width:900px; height:520px; left:-160px; top:-140px; background:#6b6f78; opacity:.38; }
  .g2 { width:760px; height:760px; left:-220px; bottom:-320px; background:#3a3d44; opacity:.55; }
  .g3 { width:820px; height:560px; right:-200px; bottom:-200px; background:#585c66; opacity:.32; }
  .g4 { width:520px; height:520px; right:-120px; top:-160px; background:#2a2c31; opacity:.6; }
  .frame {
    position:relative; width:${frameW}px; transform:${tilt}; transform-origin:center;
    border-radius:12px; overflow:hidden;
    /* marketing AppMockup: hairline border-border + the hero's three-layer drop */
    box-shadow: 0 0 0 1px rgba(255,255,255,.11),
                0 1px 1px rgba(0,0,0,.4),
                0 16px 40px -12px rgba(0,0,0,.6),
                0 32px 90px -24px rgba(0,0,0,.75);
  }
  /* edge lighting from the site: inset ring + a brighter hairline along the top */
  .frame::before {
    content:""; position:absolute; inset:0; border-radius:12px; pointer-events:none; z-index:2;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,.06),
                inset 0 1px 0 rgba(255,255,255,.14),
                inset 0 2px 0 rgba(255,255,255,.03);
  }
  /* --bg glow: the marketing ProductDemo stage lighting, ember radial on
     near-black, no shader. */
  body.emberstage .stage { background:#0a0a0b; }
  body.emberstage .glow, body.emberstage .tint, body.emberstage .vignette, body.emberstage #dither { display:none; }
  body.emberstage .ember { position:absolute; inset:-30% -25% 0; pointer-events:none; background:
    radial-gradient(ellipse 42% 38% at 50% 34%, rgba(232,128,74,${glowStrength}), rgba(232,128,74,${(glowStrength * 0.3).toFixed(3)}) 55%, transparent 78%); }
  body.emberstage .floor { position:absolute; inset:0; pointer-events:none; background:
    linear-gradient(to bottom, rgba(0,0,0,0) 60%, rgba(0,0,0,.35)); }
  /* --transparent: no stage at all, only the window and its shadow */
  body.transparent, body.transparent .stage { background:transparent; }
  body.transparent .sheen, body.transparent .ember, body.transparent #dither, body.transparent .tint,
  body.transparent .vignette, body.transparent .glow, body.transparent .floor, body.transparent .fade { display:none; }
  /* corner: pin the window top-left and let it run off right and bottom */
  body.corner .stage { align-items:flex-start; justify-content:flex-start; }
  body.corner .frame { flex:none; margin-left:${Math.round(CANVAS_W * 0.065)}px; margin-top:${Math.round(CANVAS_H * 0.13)}px; }
  body.corner .ember { inset:-20% -25% 0; background:
    radial-gradient(ellipse 46% 40% at 44% 26%, rgba(232,128,74,${glowStrength}), rgba(232,128,74,${(glowStrength * 0.3).toFixed(3)}) 55%, transparent 78%); }
  /* card: Linear-style flat product card. Near-black stage with a faint top
     glow, hairline border, quiet shadow. --bleed pins it high and fades the
     bottom edge into the backdrop. */
  body.card .stage { background:#0a0a0b; align-items:${bleed ? "flex-start" : "center"}; }
  body.card .glow, body.card .tint, body.card .vignette, body.card #dither { display:none; }
  body.card .sheen { position:absolute; inset:0; background:
    radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255,255,255,.045), transparent 70%); }
  body.card .frame {
    margin-top:${bleed ? Math.round(CANVAS_H * 0.09) : 0}px;
    border-radius:14px; background:#111113;
    border:1px solid rgba(255,255,255,.09);
    box-shadow: 0 1px 0 rgba(255,255,255,.04) inset,
                0 24px 60px -24px rgba(0,0,0,.8),
                0 0 0 1px rgba(0,0,0,.6);
  }
  body.card .fade { position:absolute; left:0; right:0; bottom:0; height:${Math.round(CANVAS_H * 0.32)}px;
    display:${bleed ? "block" : "none"};
    background:linear-gradient(to bottom, rgba(10,10,11,0), rgba(10,10,11,.92) 70%, #0a0a0b); }
  .frame img, .frame .shot { display:block; width:100%; height:auto; }
  /* highlight ring: dim everything outside via a huge spread shadow (clipped
     by the frame's overflow:hidden), accent ring + soft glow on the region */
  .hl {
    position:absolute; border-radius:10px; pointer-events:none;
    border:2px solid ${accent};
    box-shadow: 0 0 0 9999px rgba(0,0,0,${Number(flags.get("hl-dim") ?? "0.42") || 0.42}),
                0 0 22px 2px ${accent}66,
                inset 0 0 14px ${accent}22;
  }
</style></head><body class="${[isCard ? "card" : "", isCorner ? "corner" : "", isGlow ? "emberstage" : "", transparent ? "transparent" : ""].join(" ").trim()}">
  <div class="stage">
    <div class="sheen"></div>
    <div class="ember"></div>
    <div id="dither"></div>
    <div class="tint"></div>
    <div class="vignette"></div>
    <div class="glow g1"></div><div class="glow g2"></div>
    <div class="glow g3"></div><div class="glow g4"></div>
    <div class="frame">${shot}${highlight}</div>
    <div class="floor"></div>
    <div class="fade"></div>
  </div>
  ${shaderScript}
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
		// Software WebGL so the dither shader renders without a GPU.
		"--enable-unsafe-swiftshader",
		"--hide-scrollbars",
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-extensions",
		"--disable-background-networking",
		"--virtual-time-budget=4000",
		...(transparent ? ["--default-background-color=00000000"] : []),
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
console.log(
	"wrote",
	outPath,
	isCard
		? `(card${bleed ? ", bleed" : ""})`
		: `(${style}, bg=${bgName}${usePlain ? "" : `, seed=${seed}`})`,
);
