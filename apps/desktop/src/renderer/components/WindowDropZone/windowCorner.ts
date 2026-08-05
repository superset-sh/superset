/**
 * The OS rounds the app's frameless window corners itself and exposes no API to
 * read the exact radius, so we approximate it per-platform. Echoing this radius
 * (rather than the app's `--radius` design token) keeps window-hugging chrome
 * like the folder drop overlay visually in sympathy with the real window shape.
 */
const WINDOW_CORNER_RADIUS_PX: Record<string, number> = {
	darwin: 8, // macOS (Big Sur+) rounded corners
	win32: 8, // Windows 11 rounded corners
	linux: 0, // most frameless Linux windows are square
};

/**
 * Gap between the window edge and the dashed drop overlay. Kept large enough
 * that the dashed frame — and its rounded corners — sit fully inside the OS
 * corner rounding instead of getting clipped against it.
 */
export const DROP_OVERLAY_INSET_PX = 8;

/**
 * Corner radius for the inset dashed overlay. It sits `DROP_OVERLAY_INSET_PX`
 * inside the window, so a radius that echoes the window corner reads as a
 * rounded frame nested within the window rather than fighting its edge.
 */
export function dropOverlayRadiusPx(platform: string | undefined): number {
	return WINDOW_CORNER_RADIUS_PX[platform ?? ""] ?? 10;
}
