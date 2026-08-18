/**
 * Downscale an image data URI to a small square-bounded icon and re-encode it
 * as PNG. Agent icons live inline in the per-machine host-service SQLite DB and
 * ship on every `agentConfigs.list()`, so a full-resolution upload would bloat
 * every query — clamp it to icon size before storing. Returns the original data
 * URI if decoding/encoding fails.
 */
/** Icons render small; clamp uploads to this square bound before storing. */
export const MAX_ICON_DIMENSION = 128;

export async function resizeImageDataUrl(
	dataUrl: string,
	maxDimension: number = MAX_ICON_DIMENSION,
): Promise<string> {
	try {
		const image = await loadImage(dataUrl);
		const largestSide = Math.max(image.width, image.height);
		const scale = largestSide > 0 ? Math.min(1, maxDimension / largestSide) : 1;
		const width = Math.max(1, Math.round(image.width * scale));
		const height = Math.max(1, Math.round(image.height * scale));

		const canvas = document.createElement("canvas");
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext("2d");
		if (!ctx) return dataUrl;
		ctx.drawImage(image, 0, 0, width, height);
		return canvas.toDataURL("image/png");
	} catch {
		return dataUrl;
	}
}

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to load image"));
		image.src = src;
	});
}
