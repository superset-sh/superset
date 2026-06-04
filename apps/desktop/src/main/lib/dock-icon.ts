import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, nativeImage } from "electron";
import { env } from "main/env.main";
import { prerelease } from "semver";
import { getWorkspaceName } from "shared/env.shared";

type RGB = [number, number, number];

type Bounds = { top: number; left: number; bottom: number; right: number };

/**
 * Deterministic workspace-name → RGB picker. Hashes the name to a hue via the
 * golden angle (137.508°) so successive workspaces land far apart on the color
 * wheel, then converts a fixed-lightness/chroma OKLCH point to sRGB.
 */
const pickWorkspaceColor = (() => {
	const L = 0.68;
	const C = 0.18;
	const GOLDEN_ANGLE = 137.508;

	function oklchToRgb(l: number, c: number, h: number): RGB {
		const hRad = (h * Math.PI) / 180;
		const a = c * Math.cos(hRad);
		const b = c * Math.sin(hRad);
		const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
		const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
		const s_ = l - 0.0894841775 * a - 1.291485548 * b;
		const lc = l_ ** 3;
		const mc = m_ ** 3;
		const sc = s_ ** 3;
		const rLin = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
		const gLin = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
		const bLin = -0.0041960863 * lc + 0.7034186147 * mc + 0.2967775076 * sc;
		const toSrgb = (v: number) => {
			const x = Math.max(0, Math.min(1, v));
			return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
		};
		return [
			Math.round(toSrgb(rLin) * 255),
			Math.round(toSrgb(gLin) * 255),
			Math.round(toSrgb(bLin) * 255),
		];
	}

	function hash(seed: string): number {
		let h = 0;
		for (let i = 0; i < seed.length; i++) {
			h = seed.charCodeAt(i) + ((h << 5) - h);
			h |= 0;
		}
		return Math.abs(h);
	}

	return (workspaceName: string): RGB => {
		const hue = (hash(workspaceName) * GOLDEN_ANGLE) % 360;
		return oklchToRgb(L, C, hue);
	};
})();

/**
 * Returns true for prerelease versions like "0.0.53-canary".
 */
function isCanaryBuild(): boolean {
	const components = prerelease(app.getVersion());
	return components !== null && components.length > 0;
}

/**
 * Root directory of packaged/bundled icon assets.
 */
function getIconsDir(): string {
	if (app.isPackaged) {
		return join(process.resourcesPath, "app.asar/resources/build/icons");
	}
	if (env.NODE_ENV === "development") {
		return join(app.getAppPath(), "src/resources/build/icons");
	}
	return join(__dirname, "../resources/build/icons");
}

/**
 * Picks the dock icon PNG for the current build type, falling back to the
 * stable icon if a build-specific variant is missing.
 */
function getIconPath(): string {
	const dir = getIconsDir();

	if (env.NODE_ENV === "development") {
		const devIcon = join(dir, "icon-dev.png");
		if (existsSync(devIcon)) return devIcon;
	} else if (isCanaryBuild()) {
		const canaryIcon = join(dir, "icon-canary.png");
		if (existsSync(canaryIcon)) return canaryIcon;
	}

	return join(dir, "icon.png");
}

/**
 * Bounding box of non-transparent pixels in a bitmap.
 */
function findContentBounds(
	bitmap: Buffer,
	width: number,
	height: number,
): Bounds {
	let top = height;
	let left = width;
	let bottom = 0;
	let right = 0;

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if ((bitmap[(y * width + x) * 4 + 3] ?? 0) > 10) {
				if (y < top) top = y;
				if (y > bottom) bottom = y;
				if (x < left) left = x;
				if (x > right) right = x;
			}
		}
	}

	return { top, left, bottom, right };
}

/**
 * Source-over alpha compositing of a single RGBA pixel into the bitmap.
 */
function blendPixel(
	bitmap: Buffer,
	width: number,
	height: number,
	x: number,
	y: number,
	rgb: RGB,
	alpha: number,
) {
	if (alpha <= 0) return;
	if (x < 0 || y < 0 || x >= width || y >= height) return;

	const offset = (y * width + x) * 4;
	const dr = bitmap[offset] ?? 0;
	const dg = bitmap[offset + 1] ?? 0;
	const db = bitmap[offset + 2] ?? 0;
	const da = (bitmap[offset + 3] ?? 0) / 255;

	const outA = alpha + da * (1 - alpha);
	if (outA <= 0) return;

	bitmap[offset] = Math.round((rgb[0] * alpha + dr * da * (1 - alpha)) / outA);
	bitmap[offset + 1] = Math.round(
		(rgb[1] * alpha + dg * da * (1 - alpha)) / outA,
	);
	bitmap[offset + 2] = Math.round(
		(rgb[2] * alpha + db * da * (1 - alpha)) / outA,
	);
	bitmap[offset + 3] = Math.round(outA * 255);
}

/**
 * Paints a top-right corner fold onto the bitmap: a colored triangle whose
 * two legs run along the icon's top and right edges, with a 45° hypotenuse
 * `cornerSize` pixels from the corner. The fill is masked by the icon's
 * existing alpha so the fold hugs its rounded shape.
 */
function drawCornerFold({
	bitmap,
	width,
	height,
	bounds,
	cornerSize,
	rgb,
}: {
	bitmap: Buffer;
	width: number;
	height: number;
	bounds: Bounds;
	cornerSize: number;
	rgb: RGB;
}) {
	const minX = Math.max(0, bounds.right - cornerSize - 2);
	const maxX = Math.min(width - 1, bounds.right + 2);
	const minY = Math.max(0, bounds.top - 2);
	const maxY = Math.min(height - 1, bounds.top + cornerSize + 2);

	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			// Perpendicular signed distance to the 45° cut line
			// (bounds.right - x) + (y - bounds.top) = cornerSize.
			// Negative = inside the triangle (toward the corner).
			const signedDist =
				(bounds.right - x + (y - bounds.top) - cornerSize) / Math.SQRT2;
			const diagAlpha = Math.max(0, Math.min(1, 0.5 - signedDist));
			if (diagAlpha <= 0.001) continue;

			const iconAlpha = (bitmap[(y * width + x) * 4 + 3] ?? 0) / 255;
			if (iconAlpha <= 0) continue;

			blendPixel(bitmap, width, height, x, y, rgb, diagAlpha * iconAlpha);
		}
	}
}

/**
 * Sets the macOS dock icon based on the current build type.
 * In development with a workspace name set, overlays a workspace-colored
 * corner fold so simultaneous workspaces are visually distinguishable.
 * No-op on non-macOS platforms.
 */
export function setWorkspaceDockIcon(): void {
	if (process.platform !== "darwin") return;

	try {
		const iconPath = getIconPath();
		const icon = nativeImage.createFromPath(iconPath);
		if (icon.isEmpty()) {
			console.warn("[dock-icon] Failed to load icon from:", iconPath);
			return;
		}

		const workspaceName =
			env.NODE_ENV === "development" ? getWorkspaceName() : null;

		if (!workspaceName) {
			app.dock?.setIcon(icon);
			console.log(`[dock-icon] Set dock icon from: ${iconPath}`);
			return;
		}

		const size = icon.getSize();
		const bitmap = icon.toBitmap();
		const bounds = findContentBounds(bitmap, size.width, size.height);
		const boundsWidth = bounds.right - bounds.left;
		const rgb = pickWorkspaceColor(workspaceName);

		drawCornerFold({
			bitmap,
			width: size.width,
			height: size.height,
			bounds,
			cornerSize: Math.round(boundsWidth * 0.47),
			rgb,
		});

		const newIcon = nativeImage.createFromBitmap(bitmap, {
			width: size.width,
			height: size.height,
		});

		app.dock?.setIcon(newIcon);
		console.log(
			`[dock-icon] Set workspace dock icon corner fold rgb(${rgb.join(",")}) for "${workspaceName}" from ${iconPath}`,
		);
	} catch (error) {
		console.error("[dock-icon] Failed to set dock icon:", error);
	}
}
