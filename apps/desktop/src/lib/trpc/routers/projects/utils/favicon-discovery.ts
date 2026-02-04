import { readFileSync, statSync } from "node:fs";
import fg from "fast-glob";

const FAVICON_GLOB = "**/favicon.{ico,png,svg,jpg,jpeg,webp}";

const MAX_FILE_SIZE = 500 * 1024; // 500KB

/**
 * Discovers a favicon in the project directory and returns it as a base64 data URL.
 * Picks the favicon closest to the project root if multiple are found.
 */
export async function discoverFavicon(
	repoPath: string,
): Promise<string | null> {
	try {
		const matches = await fg(FAVICON_GLOB, {
			cwd: repoPath,
			absolute: true,
			onlyFiles: true,
			dot: false,
		});

		if (matches.length === 0) return null;

		const shortest = matches.sort((a, b) => a.length - b.length)[0];

		const stats = statSync(shortest);
		if (stats.size > MAX_FILE_SIZE) {
			console.log(
				`[favicon-discovery] File too large: ${shortest} (${stats.size} bytes)`,
			);
			return null;
		}

		const buffer = readFileSync(shortest);
		const base64 = buffer.toString("base64");
		const ext = shortest.split(".").pop()?.toLowerCase();
		const mime = getMimeType(ext);

		console.log(
			`[favicon-discovery] Found favicon: ${shortest} (${stats.size} bytes)`,
		);

		return `data:${mime};base64,${base64}`;
	} catch (error) {
		console.error("[favicon-discovery] Error:", error);
		return null;
	}
}

function getMimeType(ext: string | undefined): string {
	const mimes: Record<string, string> = {
		ico: "image/x-icon",
		png: "image/png",
		svg: "image/svg+xml",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		webp: "image/webp",
	};
	return mimes[ext ?? ""] ?? "image/png";
}
