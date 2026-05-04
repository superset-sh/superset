import type { FileTreeIconConfig } from "@pierre/trees";
import { resolveFileIconAssetUrl } from "renderer/screens/main/components/WorkspaceView/RightSidebar/FilesView/utils/resolveFileIconAssetUrl";
import rawManifest from "resources/public/file-icons/manifest.json";

interface FileIconManifest {
	fileNames: Record<string, string>;
	fileExtensions: Record<string, string>;
	folderNames: Record<string, string>;
	folderNamesExpanded: Record<string, string>;
	defaultIcon: string;
	defaultFolderIcon: string;
	defaultFolderOpenIcon: string;
}

// Pierre's built-in coverage @ 1.0.0-beta.3. These are the lowercased keys of
// BUILT_IN_FILE_NAME_TOKENS / BUILT_IN_FILE_EXTENSION_TOKENS / the complete-tier
// override extensions, extracted from `@pierre/trees/dist/builtInIcons.js`.
// We intentionally let Pierre handle anything in these sets so we don't override
// its stylized icons; we only fill in the long tail it doesn't recognize.
const PIERRE_FILE_NAMES = new Set<string>([
	".babelrc",
	".babelrc.json",
	".bash_profile",
	".bashrc",
	".browserslistrc",
	".dockerignore",
	".eslintignore",
	".eslintrc",
	".eslintrc.cjs",
	".eslintrc.js",
	".eslintrc.json",
	".eslintrc.yaml",
	".eslintrc.yml",
	".gitattributes",
	".gitignore",
	".gitkeep",
	".gitmodules",
	".oxlintrc.json",
	".postcssrc",
	".postcssrc.json",
	".postcssrc.yaml",
	".postcssrc.yml",
	".prettierignore",
	".prettierrc",
	".prettierrc.cjs",
	".prettierrc.js",
	".prettierrc.json",
	".prettierrc.mjs",
	".prettierrc.toml",
	".prettierrc.yaml",
]);

const PIERRE_FILE_EXTENSIONS = new Set<string>([
	"astro",
	"avif",
	"bash",
	"bmp",
	"bz2",
	"cfg",
	"cjs",
	"conf",
	"csh",
	"css",
	"csv",
	"cts",
	"db",
	"editorconfig",
	"env",
	"eot",
	"erb",
	"fish",
	"gemspec",
	"gif",
	"go",
	"gql",
	"graphql",
	"gz",
	"htm",
	"html",
	"icns",
	"ico",
	"ini",
	"jar",
	"jpeg",
	"jpg",
	"js",
	"json",
	"json5",
	"jsonc",
	"jsonl",
	"jsx",
	"ksh",
	"less",
	"log",
	"markdown",
	"mcp",
	"md",
	"mdx",
	"mjs",
	"mts",
	"ods",
	"otf",
	"png",
	"postcss",
	"py",
	"pyi",
	"pyw",
	"pyx",
	"rake",
	"rar",
	"rb",
	"rs",
	"rst",
	"rtf",
	"sass",
	"scss",
	"sh",
	"sql",
	"sqlite",
	"sqlite3",
	"styl",
	"svelte",
	"svg",
	"swift",
	"tar",
	"tf",
	"tfstate",
	"tfvars",
	"tgz",
	"tif",
	"tiff",
	"ts",
	"tsv",
	"tsx",
	"ttf",
	"txt",
	"vue",
	"war",
	"wasm",
	"wast",
	"wat",
	"webp",
	"woff",
	"woff2",
	"xhtml",
	"xls",
	"xlsx",
	"xz",
	"yaml",
	"yml",
	"zig",
	"zip",
	"zsh",
]);

const SYMBOL_PREFIX = "material-";
const manifest = rawManifest as FileIconManifest;

interface FallthroughIconConfig {
	spriteSheet: string;
	byFileName: NonNullable<FileTreeIconConfig["byFileName"]>;
	byFileExtension: NonNullable<FileTreeIconConfig["byFileExtension"]>;
}

let cached: Promise<FallthroughIconConfig> | null = null;

export function loadFallthroughIcons(): Promise<FallthroughIconConfig> {
	if (cached) return cached;
	cached = doLoad().catch((error) => {
		// Reset on failure so a future tree mount can retry.
		cached = null;
		throw error;
	});
	return cached;
}

async function doLoad(): Promise<FallthroughIconConfig> {
	const byFileNameRaw: Record<string, string> = {};
	for (const [name, icon] of Object.entries(manifest.fileNames)) {
		if (PIERRE_FILE_NAMES.has(name.toLowerCase())) continue;
		byFileNameRaw[name] = icon;
	}
	const byFileExtensionRaw: Record<string, string> = {};
	for (const [extension, icon] of Object.entries(manifest.fileExtensions)) {
		if (PIERRE_FILE_EXTENSIONS.has(extension.toLowerCase())) continue;
		byFileExtensionRaw[extension] = icon;
	}

	const uniqueIcons = new Set<string>([
		...Object.values(byFileNameRaw),
		...Object.values(byFileExtensionRaw),
	]);

	const symbolBodies = await Promise.all(
		Array.from(uniqueIcons).map(async (iconName) => {
			const body = await fetchSymbolBody(iconName);
			return body ? toSymbol(iconName, body) : null;
		}),
	);

	const usableIcons = new Set<string>();
	const symbols: string[] = [];
	for (const entry of symbolBodies) {
		if (!entry) continue;
		usableIcons.add(entry.name);
		symbols.push(entry.symbol);
	}

	// Drop entries whose SVG failed to fetch so Pierre's fallback chain runs.
	const byFileName: Record<string, string> = {};
	for (const [name, icon] of Object.entries(byFileNameRaw)) {
		if (usableIcons.has(icon)) byFileName[name] = SYMBOL_PREFIX + icon;
	}
	const byFileExtension: Record<string, string> = {};
	for (const [extension, icon] of Object.entries(byFileExtensionRaw)) {
		if (usableIcons.has(icon))
			byFileExtension[extension] = SYMBOL_PREFIX + icon;
	}

	// Pierre injects spriteSheet into light DOM as a slotted child of the
	// host. Without explicit dimensions an SVG defaults to ~300×150, which
	// would steal layout space and visually truncate the tree. Mirror Pierre's
	// own built-in sprite (`width="0" height="0" aria-hidden`) so it renders
	// the symbols but takes no space.
	const spriteSheet = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true">${symbols.join("")}</svg>`;
	return { spriteSheet, byFileName, byFileExtension };
}

async function fetchSymbolBody(
	iconName: string,
): Promise<{ inner: string; viewBox: string } | null> {
	try {
		const response = await fetch(resolveFileIconAssetUrl(iconName));
		if (!response.ok) return null;
		const svg = await response.text();
		const viewBox = svg.match(/viewBox\s*=\s*"([^"]+)"/)?.[1] ?? "0 0 24 24";
		// Strip the outer <svg ...>...</svg> wrapper, keep the inner markup so
		// we can wrap it in a single <symbol> for the sprite.
		const inner = svg
			.replace(/^[\s\S]*?<svg[^>]*>/, "")
			.replace(/<\/svg>\s*$/, "");
		return { inner, viewBox };
	} catch {
		return null;
	}
}

function toSymbol(
	iconName: string,
	body: { inner: string; viewBox: string },
): { name: string; symbol: string } {
	const id = SYMBOL_PREFIX + iconName;
	return {
		name: iconName,
		symbol: `<symbol id="${id}" viewBox="${body.viewBox}">${body.inner}</symbol>`,
	};
}
