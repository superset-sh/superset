import { join } from "node:path";
import { app, nativeImage } from "electron";
import { env } from "main/env.main";
import { getWorkspaceName } from "shared/env.shared";

/**
 * Generates a deterministic HSL hue from a string seed.
 */
function hashToHue(seed: string): number {
	let hash = 0;
	for (let i = 0; i < seed.length; i++) {
		hash = seed.charCodeAt(i) + ((hash << 5) - hash);
		hash |= 0;
	}
	return ((hash % 360) + 360) % 360;
}

/**
 * Converts HSL to RGB (all values 0-255).
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	const sNorm = s / 100;
	const lNorm = l / 100;
	const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = lNorm - c / 2;

	let r = 0;
	let g = 0;
	let b = 0;
	if (h < 60) {
		r = c;
		g = x;
	} else if (h < 120) {
		r = x;
		g = c;
	} else if (h < 180) {
		g = c;
		b = x;
	} else if (h < 240) {
		g = x;
		b = c;
	} else if (h < 300) {
		r = x;
		b = c;
	} else {
		r = c;
		b = x;
	}

	return [
		Math.round((r + m) * 255),
		Math.round((g + m) * 255),
		Math.round((b + m) * 255),
	];
}

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

		const hue = hashToHue(workspaceName);
		const rgb = hslToRgb(hue, 75, 55);

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
			`[dock-icon] Set workspace dock icon border with hue ${hue} for "${workspaceName}"`,
		);
	} catch (error) {
		console.error("[dock-icon] Failed to set dock icon:", error);
	}
}
