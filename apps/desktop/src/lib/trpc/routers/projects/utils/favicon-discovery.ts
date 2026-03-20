import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";
import fg from "fast-glob";
import {
	saveProjectIconFromBuffer,
	saveProjectIconFromFile,
} from "main/lib/project-icons";

/** Common favicon file names to search for in project roots and subdirectories */
const FAVICON_PATTERNS = [
	// Root level
	"favicon.ico",
	"favicon.png",
	"favicon.svg",
	"logo.png",
	"logo.svg",
	"icon.png",
	"icon.svg",
	".github/logo.png",
	".github/logo.svg",
	// Common static/public directories
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
	// Next.js / app directory patterns (up to 2 levels deep)
	"app/favicon.ico",
	"app/icon.png",
	"app/icon.svg",
	"**/app/favicon.ico",
	"**/app/icon.png",
	"**/app/icon.svg",
	// Deeper public directories in monorepos/nested projects
	"**/public/favicon.ico",
	"**/public/favicon.png",
	"**/public/favicon.svg",
	"**/public/logo.png",
	"**/public/logo.svg",
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
			deep: 4,
			ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/build/**"],
			onlyFiles: true,
		});

		if (matches.length === 0) return null;

		// Use the first match (ordered by FAVICON_PATTERNS priority)
		const iconPath = matches[0];

		// Check file size
		const fileStat = await stat(iconPath);
		if (fileStat.size > MAX_FAVICON_SIZE) {
			console.log(
				`[favicon-discovery] Icon too large (${Math.round(fileStat.size / 1024)}KB): ${iconPath}`,
			);
			return null;
		}

		const ext = extname(iconPath).replace(".", "") || "png";

		// For .ico files, read as buffer since they may need special handling
		if (ext === "ico") {
			const buffer = await readFile(iconPath);
			return await saveProjectIconFromBuffer({
				projectId,
				buffer: Buffer.from(buffer),
				ext: "ico",
			});
		}

		return await saveProjectIconFromFile({ projectId, sourcePath: iconPath });
	} catch (error) {
		console.error("[favicon-discovery] Error discovering icon:", error);
		return null;
	}
}
