import { del, put } from "@vercel/blob";

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const FETCH_TIMEOUT_MS = 5000;

/**
 * Fetch the public GitHub avatar for `owner` and upload it to blob storage.
 * Returns the blob URL, or null if the avatar can't be fetched or stored.
 * Never throws — callers can fire-and-forget.
 */
export async function fetchAndStoreGitHubAvatar({
	owner,
	pathnamePrefix,
	existingUrl,
}: {
	owner: string;
	pathnamePrefix: string;
	existingUrl: string | null;
}): Promise<string | null> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
		let response: Response;
		try {
			response = await fetch(
				`https://github.com/${encodeURIComponent(owner)}.png?size=200`,
				{ signal: controller.signal, redirect: "follow" },
			);
		} finally {
			clearTimeout(timeoutId);
		}

		if (!response.ok) return null;
		const contentType = response.headers.get("content-type") ?? "image/png";
		const mimeType = contentType.split(";")[0]?.trim() ?? "image/png";
		if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) return null;

		const buffer = Buffer.from(await response.arrayBuffer());
		const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
		const randomId = Math.random().toString(36).substring(2, 15);
		const pathname = `${pathnamePrefix}/${randomId}.${ext}`;

		const blob = await put(pathname, buffer, {
			access: "public",
			contentType: mimeType,
		});

		if (existingUrl) {
			void del(existingUrl).catch((error) => {
				console.warn("Failed to delete previous project icon blob", {
					existingUrl,
					error,
				});
			});
		}

		return blob.url;
	} catch {
		return null;
	}
}
