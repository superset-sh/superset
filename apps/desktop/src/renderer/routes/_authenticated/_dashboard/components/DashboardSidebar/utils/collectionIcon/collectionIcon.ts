/**
 * A collection icon is one string: either an emoji, or a `data:` URL holding a
 * small image (a client's logo, say). Both are stored inline because collections
 * are client-local rows — there is no server row to hang an upload off, and a
 * `file://` path wouldn't render under the renderer's CSP, which allows
 * `data:` images but not local files.
 */

/** Longest side of a stored image icon, in CSS pixels. */
export const COLLECTION_ICON_SIZE = 64;

/** Emoji offered in the picker — shapes that suit client/work/personal groups. */
export const COLLECTION_ICON_EMOJI = [
	"💼",
	"🏢",
	"🏠",
	"🚀",
	"🧪",
	"🔧",
	"📦",
	"🎨",
	"📊",
	"🔒",
	"🌐",
	"⚡",
	"🐛",
	"📝",
	"⭐",
	"🔥",
] as const;

export function isImageIcon(icon: string | null | undefined): boolean {
	return typeof icon === "string" && icon.startsWith("data:image/");
}

/**
 * Re-encodes a picked image down to `COLLECTION_ICON_SIZE` as PNG. Icons live in
 * the sidebar's local store, so a full-size photo would eat the quota the rest
 * of the sidebar shares; a 64px PNG costs a few KB.
 */
export async function shrinkIconDataUrl(
	dataUrl: string,
	size: number = COLLECTION_ICON_SIZE,
): Promise<string> {
	const image = new Image();
	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () =>
			reject(new Error("That file isn't a readable image."));
		image.src = dataUrl;
	});

	const longest = Math.max(image.width, image.height) || size;
	const scale = Math.min(1, size / longest);
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));

	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) throw new Error("Couldn't prepare the image.");
	context.drawImage(image, 0, 0, width, height);
	return canvas.toDataURL("image/png");
}
