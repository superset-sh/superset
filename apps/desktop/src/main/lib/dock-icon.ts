import { join } from "node:path";
import { app, nativeImage } from "electron";
import { env } from "main/env.main";
import { getWorkspaceName } from "shared/env.shared";
import twColors from "tailwindcss/colors";

/**
 * Deterministic hash of a string, returned as a non-negative integer.
 */
function hashString(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = seed.charCodeAt(i) + ((hash << 5) - hash);
		hash |= 0;
	}
	return Math.abs(hash);
}

/**
 * Parses an OKLCH CSS string like "oklch(63.7% 0.237 25.331)".
 */
function parseOklch(str: string): { l: number; c: number; h: number } | null {
	const match = str.match(/oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/);
	if (!match) return null;
	return {
		l: Number(match[1]) / 100,
		c: Number(match[2]),
		h: Number(match[3]),
	};
}

/**
 * Converts OKLCH to sRGB (all values 0-255).
 */
function oklchToRgb(l: number, c: number, h: number): [number, number, number] {
	const hRad = (h * Math.PI) / 180;
	const a = c * Math.cos(hRad);
	const b = c * Math.sin(hRad);

	// OKLab → LMS (cube-root space)
	const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = l - 0.0894841775 * a - 1.291485548 * b;

	const lc = l_ * l_ * l_;
	const mc = m_ * m_ * m_;
	const sc = s_ * s_ * s_;

	// LMS → linear sRGB
	const rLin = +4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
	const gLin = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
	const bLin = -0.0041960863 * lc + 0.7034186147 * mc + 0.2967775076 * sc;

	const toSrgb = (v: number) => {
		const clamped = Math.max(0, Math.min(1, v));
		return clamped <= 0.0031308
			? 12.92 * clamped
			: 1.055 * clamped ** (1 / 2.4) - 0.055;
	};

	return [
		Math.round(toSrgb(rLin) * 255),
		Math.round(toSrgb(gLin) * 255),
		Math.round(toSrgb(bLin) * 255),
	];
}

/** All Tailwind 500-level colors as RGB tuples. */
const TAILWIND_500_COLORS: [number, number, number][] = (() => {
	const skip = new Set(["inherit", "current", "transparent", "black", "white"]);
	const result: [number, number, number][] = [];
	for (const [name, val] of Object.entries(twColors)) {
		if (skip.has(name) || typeof val !== "object" || !("500" in val)) continue;
		const parsed = parseOklch((val as Record<string, string>)["500"] as string);
		if (parsed) result.push(oklchToRgb(parsed.l, parsed.c, parsed.h));
	}
	return result;
})();

/**
 * Gets the path to the app icon PNG.
 */
function getIconPath(): string {
	if (app.isPackaged) {
		return join(
			process.resourcesPath,
			"app.asar/resources/build/icons/icon.png",
		);
	}

	if (env.NODE_ENV === "development") {
		return join(app.getAppPath(), "src/resources/build/icons/icon.png");
	}

	return join(__dirname, "../resources/build/icons/icon.png");
}

/**
 * Signed distance function for a rounded rectangle.
 * Negative = inside, positive = outside, zero = on boundary.
 */
function sdfRoundedRect(
	px: number,
	py: number,
	left: number,
	top: number,
	right: number,
	bottom: number,
	radius: number,
): number {
	const cx = (left + right) / 2;
	const cy = (top + bottom) / 2;
	const halfW = (right - left) / 2;
	const halfH = (bottom - top) / 2;

	const dx = Math.abs(px - cx) - halfW + radius;
	const dy = Math.abs(py - cy) - halfH + radius;

	return (
		Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2) +
		Math.min(Math.max(dx, dy), 0) -
		radius
	);
}

/**
 * Finds the bounding box of non-transparent pixels in a bitmap.
 */
function findContentBounds(
	bitmap: Buffer,
	width: number,
	height: number,
): { top: number; left: number; bottom: number; right: number } {
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
 * Draws a rounded-rectangle border on raw RGBA bitmap data.
 * The border is drawn inward from the specified bounds.
 */
function drawBorder({
	bitmap,
	width,
	thickness,
	left,
	top,
	right,
	bottom,
	cornerRadius,
	rgb,
}: {
	bitmap: Buffer;
	width: number;
	thickness: number;
	left: number;
	top: number;
	right: number;
	bottom: number;
	cornerRadius: number;
	rgb: [number, number, number];
}) {
	const innerRadius = Math.max(0, cornerRadius - thickness);

	for (let y = top; y <= bottom; y++) {
		for (let x = left; x <= right; x++) {
			const outerDist = sdfRoundedRect(
				x,
				y,
				left,
				top,
				right,
				bottom,
				cornerRadius,
			);
			const innerDist = sdfRoundedRect(
				x,
				y,
				left + thickness,
				top + thickness,
				right - thickness,
				bottom - thickness,
				innerRadius,
			);

			// Anti-aliased edges
			const outerAlpha = Math.max(0, Math.min(1, 0.5 - outerDist));
			const innerAlpha = Math.max(0, Math.min(1, innerDist + 0.5));
			const borderAlpha = outerAlpha * innerAlpha;

			if (borderAlpha > 0.001) {
				const offset = (y * width + x) * 4;
				const r = bitmap[offset] ?? 0;
				const g = bitmap[offset + 1] ?? 0;
				const b = bitmap[offset + 2] ?? 0;
				const a = bitmap[offset + 3] ?? 0;
				bitmap[offset] = Math.round(
					rgb[0] * borderAlpha + r * (1 - borderAlpha),
				);
				bitmap[offset + 1] = Math.round(
					rgb[1] * borderAlpha + g * (1 - borderAlpha),
				);
				bitmap[offset + 2] = Math.round(
					rgb[2] * borderAlpha + b * (1 - borderAlpha),
				);
				bitmap[offset + 3] = Math.max(a, Math.round(borderAlpha * 255));
			}
		}
	}
}

/**
 * Sets the macOS dock icon with a colored border based on the workspace name.
 * No-op on non-macOS platforms or when no workspace name is set.
 */
export function setWorkspaceDockIcon(): void {
	if (process.platform !== "darwin") return;
	if (env.NODE_ENV !== "development") return;

	const workspaceName = getWorkspaceName();
	if (!workspaceName) return;

	try {
		const iconPath = getIconPath();
		const icon = nativeImage.createFromPath(iconPath);
		if (icon.isEmpty()) {
			console.warn("[dock-icon] Failed to load icon from:", iconPath);
			return;
		}

		const size = icon.getSize();
		const bitmap = icon.toBitmap();

		const hash = hashString(workspaceName);
		const rgb =
			TAILWIND_500_COLORS[hash % TAILWIND_500_COLORS.length] ??
			([59, 130, 246] as [number, number, number]); // blue-500 fallback

		// Find the actual icon content area (skip transparent padding)
		const bounds = findContentBounds(bitmap, size.width, size.height);
		const thickness = Math.round(size.width * 0.038);
		const cornerRadius = Math.round(size.width * 0.22);

		// Draw border flush with the content edges, overlapping inward
		drawBorder({
			bitmap,
			width: size.width,
			thickness,
			left: bounds.left,
			top: bounds.top,
			right: bounds.right,
			bottom: bounds.bottom,
			cornerRadius,
			rgb,
		});

		const newIcon = nativeImage.createFromBitmap(bitmap, {
			width: size.width,
			height: size.height,
		});

		app.dock?.setIcon(newIcon);
		console.log(
			`[dock-icon] Set workspace dock icon border rgb(${rgb.join(",")}) for "${workspaceName}"`,
		);
	} catch (error) {
		console.error("[dock-icon] Failed to set dock icon:", error);
	}
}
