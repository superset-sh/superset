import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, sep } from "node:path";
import fg from "fast-glob";
import {
	saveProjectIconFromBuffer,
	saveProjectIconFromFile,
} from "main/lib/project-icons";

/** Common favicon file names to search for in project roots */
const FAVICON_PATTERNS = [
	"favicon.ico",
	"favicon.png",
	"favicon.svg",
	"logo.png",
	"logo.svg",
	"icon.png",
	"icon.svg",
	".github/logo.png",
	".github/logo.svg",
	"public/favicon.ico",
	"public/favicon.png",
	"public/favicon.svg",
	"public/logo.png",
	"public/logo.svg",
	"static/favicon.ico",
	"static/favicon.png",
	"static/favicon.svg",
	"assets/favicon.ico",
	"assets/favicon.png",
	"assets/icon.png",
];

/** Max file size for discovered favicons: 256KB */
const MAX_FAVICON_SIZE = 256 * 1024;

/**
 * Discovers a favicon/icon in the project directory and saves it to disk.
 * Returns the protocol URL if found, or null if no icon was discovered.
 */
export async function discoverAndSaveProjectIcon({
	projectId,
	repoPath,
}: {
	projectId: string;
	repoPath: string;
}): Promise<string | null> {
	try {
		const matches = await fg(FAVICON_PATTERNS, {
			cwd: repoPath,
			absolute: true,
			ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
			onlyFiles: true,
		});

		if (matches.length === 0) return null;

		// Use the first match (ordered by FAVICON_PATTERNS priority)
		const iconPath = matches[0];

		// A repo can symlink favicon.png (or a parent dir) at a file outside the
		// checkout; don't copy that into the icon store.
		const [repoReal, iconReal] = await Promise.all([
			realpath(repoPath),
			realpath(iconPath),
		]);
		const relativeIconPath = relative(repoReal, iconReal);
		if (
			relativeIconPath === "" ||
			relativeIconPath === ".." ||
			relativeIconPath.startsWith(`..${sep}`) ||
			isAbsolute(relativeIconPath)
		) {
			return null;
		}

		// Check file size
		const fileStat = await stat(iconReal);
		if (fileStat.size > MAX_FAVICON_SIZE) {
			console.log(
				`[favicon-discovery] Icon too large (${Math.round(fileStat.size / 1024)}KB): ${iconPath}`,
			);
			return null;
		}

		const ext = extname(iconPath).replace(".", "") || "png";

		// For .ico files, read as buffer since they may need special handling
		if (ext === "ico") {
			const buffer = await readFile(iconReal);
			return await saveProjectIconFromBuffer({
				projectId,
				buffer: Buffer.from(buffer),
				ext: "ico",
			});
		}

		return await saveProjectIconFromFile({
			projectId,
			sourcePath: iconReal,
		});
	} catch (error) {
		console.error("[favicon-discovery] Error discovering icon:", error);
		return null;
	}
}
