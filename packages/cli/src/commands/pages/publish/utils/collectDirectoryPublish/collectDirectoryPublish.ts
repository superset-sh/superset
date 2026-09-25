import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

export const MAX_ASSETS = 200;
export const MAX_ASSET_BYTES = 1024 * 1024 * 1024;

export interface DirectoryAsset {
	/** Relative POSIX path, exactly how the page references it. */
	path: string;
	filePath: string;
	sizeBytes: number;
}

export interface DirectoryPublish {
	entryFilePath: string;
	assets: DirectoryAsset[];
}

/**
 * A directory publish is the directory as the page: `index.html` is the
 * document, everything else ships at its relative path. Dotfiles and
 * `node_modules` are skipped — they are never page content.
 *
 * Every node is stat-ed with `lstat` and a symbolic link is refused outright:
 * following one would let a link inside the directory publish a file from
 * anywhere on the machine, and pages default to organization-visible. Refusing
 * beats skipping because a page silently missing an asset it references is
 * worse than one that will not publish.
 */
export function collectDirectoryPublish(directory: string): DirectoryPublish {
	const entryFilePath = join(directory, "index.html");
	const entryStat = lstatSync(entryFilePath, { throwIfNoEntry: false });
	if (entryStat?.isSymbolicLink()) {
		throw new Error("index.html is a symbolic link — publish the file itself");
	}
	if (!entryStat?.isFile()) {
		throw new Error(
			"A directory publish needs an index.html at its root — that file is the page",
		);
	}

	const assets: DirectoryAsset[] = [];
	const walk = (current: string) => {
		for (const name of readdirSync(current)) {
			if (name.startsWith(".") || name === "node_modules") continue;
			const filePath = join(current, name);
			const stat = lstatSync(filePath);
			if (stat.isSymbolicLink()) {
				throw new Error(
					`${relative(directory, filePath).split(sep).join("/")} is a symbolic link — a directory publish carries only its own files`,
				);
			}
			if (stat.isDirectory()) {
				walk(filePath);
				continue;
			}
			if (!stat.isFile()) continue;
			if (filePath === entryFilePath) continue;
			if (stat.size > MAX_ASSET_BYTES) {
				throw new Error(
					`${relative(directory, filePath)} is larger than 1 GiB`,
				);
			}
			assets.push({
				path: relative(directory, filePath).split(sep).join("/"),
				filePath,
				sizeBytes: stat.size,
			});
		}
	};
	walk(directory);

	if (assets.length > MAX_ASSETS) {
		throw new Error(
			`Too many files: ${assets.length} (the limit is ${MAX_ASSETS})`,
		);
	}
	assets.sort((a, b) => (a.path < b.path ? -1 : 1));
	return { entryFilePath, assets };
}

export function sha256OfFile(filePath: string): string {
	return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

const UNPLAYABLE_EXTENSIONS = new Set([
	".mov",
	".mkv",
	".avi",
	".wmv",
	".flv",
	".m2ts",
]);
const UNPLAYABLE_BRANDS = ["qt", "hev", "hvc"];

/**
 * Browsers reliably play H.264 MP4 and WebM; iPhone recordings default to
 * HEVC `.mov`. A warning, not a refusal — the reader's browser decides.
 */
export function videoCodecWarning(
	path: string,
	firstBytes: Uint8Array,
): string | null {
	const extension = extname(path).toLowerCase();
	const warn = () =>
		`${path} may not play in every browser — H.264 MP4 or WebM plays everywhere`;
	if (UNPLAYABLE_EXTENSIONS.has(extension)) return warn();
	if (extension === ".mp4" || extension === ".m4v") {
		const brand = String.fromCharCode(...firstBytes.slice(8, 12)).toLowerCase();
		if (UNPLAYABLE_BRANDS.some((b) => brand.startsWith(b))) return warn();
	}
	return null;
}
