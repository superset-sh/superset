import { spawn } from "node:child_process";
import fs from "node:fs";
import nodePath from "node:path";
import { EXTERNAL_APPS, type ExternalApp } from "@superset/local-db";

/** Map of app IDs to their macOS application names */
const APP_NAMES: Record<ExternalApp, string | null> = {
	finder: null, // Handled specially with shell.showItemInFolder
	vscode: "Visual Studio Code",
	"vscode-insiders": "Visual Studio Code - Insiders",
	cursor: "Cursor",
	zed: "Zed",
	xcode: "Xcode",
	iterm: "iTerm",
	warp: "Warp",
	terminal: "Terminal",
	ghostty: "Ghostty",
	sublime: "Sublime Text",
	intellij: "IntelliJ IDEA",
	webstorm: "WebStorm",
	pycharm: "PyCharm",
	phpstorm: "PhpStorm",
	rubymine: "RubyMine",
	goland: "GoLand",
	clion: "CLion",
	rider: "Rider",
	datagrip: "DataGrip",
	appcode: "AppCode",
	fleet: "Fleet",
	rustrover: "RustRover",
};

type WindowsAppConfig = {
	cli?: string;
	exeNames?: string[];
	installDirs?: string[];
	jetBrainsExeNames?: string[];
	args?: (targetPath: string) => string[];
};

const resolveTerminalTarget = (targetPath: string) => {
	try {
		if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
			return nodePath.dirname(targetPath);
		}
	} catch {
		// Fallback to original path
	}
	return targetPath;
};

const WINDOWS_APP_CONFIG: Record<ExternalApp, WindowsAppConfig> = {
	finder: {},
	vscode: {
		cli: "code",
		exeNames: ["Code.exe"],
		installDirs: ["Microsoft VS Code"],
	},
	"vscode-insiders": {
		cli: "code-insiders",
		exeNames: ["Code - Insiders.exe"],
		installDirs: ["Microsoft VS Code Insiders"],
	},
	cursor: {
		cli: "cursor",
		exeNames: ["Cursor.exe"],
		installDirs: ["Cursor"],
	},
	zed: {
		cli: "zed",
		exeNames: ["Zed.exe"],
		installDirs: ["Zed"],
	},
	xcode: {},
	iterm: {},
	warp: {
		cli: "warp",
		exeNames: ["Warp.exe"],
		installDirs: ["Warp"],
	},
	terminal: {
		cli: "wt",
		exeNames: ["wt.exe", "WindowsTerminal.exe"],
		args: (targetPath) => ["-d", resolveTerminalTarget(targetPath)],
	},
	ghostty: {
		cli: "ghostty",
		exeNames: ["Ghostty.exe"],
		installDirs: ["Ghostty"],
	},
	sublime: {
		cli: "subl",
		exeNames: ["sublime_text.exe"],
		installDirs: ["Sublime Text", "Sublime Text 3"],
	},
	intellij: { cli: "idea64", jetBrainsExeNames: ["idea64.exe"] },
	webstorm: { cli: "webstorm64", jetBrainsExeNames: ["webstorm64.exe"] },
	pycharm: { cli: "pycharm64", jetBrainsExeNames: ["pycharm64.exe"] },
	phpstorm: { cli: "phpstorm64", jetBrainsExeNames: ["phpstorm64.exe"] },
	rubymine: { cli: "rubymine64", jetBrainsExeNames: ["rubymine64.exe"] },
	goland: { cli: "goland64", jetBrainsExeNames: ["goland64.exe"] },
	clion: { cli: "clion64", jetBrainsExeNames: ["clion64.exe"] },
	rider: { cli: "rider64", jetBrainsExeNames: ["rider64.exe"] },
	datagrip: { cli: "datagrip64", jetBrainsExeNames: ["datagrip64.exe"] },
	appcode: {},
	fleet: { cli: "fleet", jetBrainsExeNames: ["fleet.exe", "fleet64.exe"] },
	rustrover: { cli: "rustrover64", jetBrainsExeNames: ["rustrover64.exe"] },
};

const getWindowsProgramRoots = (): string[] => {
	const roots: string[] = [];
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		roots.push(nodePath.join(localAppData, "Programs"));
	}
	if (process.env.ProgramFiles) {
		roots.push(process.env.ProgramFiles);
	}
	if (process.env["ProgramFiles(x86)"]) {
		roots.push(process.env["ProgramFiles(x86)"]);
	}
	return roots;
};

const findExistingPath = (candidates: string[]): string | null => {
	for (const candidate of candidates) {
		if (candidate && fs.existsSync(candidate)) {
			return candidate;
		}
	}
	return null;
};

const buildWindowsExeCandidates = (config: WindowsAppConfig): string[] => {
	if (!config.exeNames?.length || !config.installDirs?.length) {
		return [];
	}
	const roots = getWindowsProgramRoots();
	const candidates: string[] = [];
	for (const root of roots) {
		for (const dir of config.installDirs) {
			for (const exeName of config.exeNames) {
				candidates.push(nodePath.join(root, dir, exeName));
			}
		}
	}
	return candidates;
};

const findJetBrainsExeInRoot = (
	root: string,
	exeName: string,
): string | null => {
	try {
		if (!fs.existsSync(root)) return null;
		const entries = fs.readdirSync(root, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const candidate = nodePath.join(root, entry.name, "bin", exeName);
			if (fs.existsSync(candidate)) {
				return candidate;
			}
		}
	} catch {
		// Ignore lookup errors and fall back
	}
	return null;
};

const findJetBrainsToolboxExe = (
	toolboxRoot: string,
	exeName: string,
): string | null => {
	try {
		if (!fs.existsSync(toolboxRoot)) return null;
		const products = fs.readdirSync(toolboxRoot, { withFileTypes: true });
		for (const product of products) {
			if (!product.isDirectory()) continue;
			const productDir = nodePath.join(toolboxRoot, product.name);
			const channels = fs.readdirSync(productDir, { withFileTypes: true });
			for (const channel of channels) {
				if (!channel.isDirectory() || !channel.name.startsWith("ch-")) {
					continue;
				}
				const channelDir = nodePath.join(productDir, channel.name);
				const builds = fs.readdirSync(channelDir, { withFileTypes: true });
				const buildNames = builds
					.filter((build) => build.isDirectory())
					.map((build) => build.name)
					.sort()
					.reverse();
				for (const buildName of buildNames) {
					const candidate = nodePath.join(
						channelDir,
						buildName,
						"bin",
						exeName,
					);
					if (fs.existsSync(candidate)) {
						return candidate;
					}
				}
			}
		}
	} catch {
		// Ignore lookup errors and fall back
	}
	return null;
};

const findJetBrainsExe = (exeNames: string[]): string | null => {
	const roots: string[] = [];
	if (process.env.ProgramFiles) {
		roots.push(nodePath.join(process.env.ProgramFiles, "JetBrains"));
	}
	if (process.env["ProgramFiles(x86)"]) {
		roots.push(nodePath.join(process.env["ProgramFiles(x86)"], "JetBrains"));
	}
	const localAppData = process.env.LOCALAPPDATA;
	if (localAppData) {
		roots.push(nodePath.join(localAppData, "Programs", "JetBrains"));
	}

	for (const exeName of exeNames) {
		for (const root of roots) {
			const match = findJetBrainsExeInRoot(root, exeName);
			if (match) return match;
		}
	}

	if (localAppData) {
		const toolboxRoot = nodePath.join(
			localAppData,
			"JetBrains",
			"Toolbox",
			"apps",
		);
		for (const exeName of exeNames) {
			const match = findJetBrainsToolboxExe(toolboxRoot, exeName);
			if (match) return match;
		}
	}

	return null;
};

/**
 * Get the command and args to open a path in the specified app.
 * Uses `open -a` for macOS apps to avoid PATH issues in production builds.
 */
export function getAppCommand(
	app: ExternalApp,
	targetPath: string,
): { command: string; args: string[] } | null {
	if (process.platform === "win32") {
		const config = WINDOWS_APP_CONFIG[app];
		if (!config) return null;
		const args = config.args ? config.args(targetPath) : [targetPath];
		const exePath = findExistingPath(buildWindowsExeCandidates(config));
		if (exePath) return { command: exePath, args };
		if (config.jetBrainsExeNames?.length) {
			const jetBrainsExe = findJetBrainsExe(config.jetBrainsExeNames);
			if (jetBrainsExe) return { command: jetBrainsExe, args };
		}
		if (config.cli) return { command: config.cli, args };
		return null;
	}

	if (process.platform !== "darwin") {
		return null;
	}

	const appName = APP_NAMES[app];
	if (!appName) return null;
	return { command: "open", args: ["-a", appName, targetPath] };
}

/**
 * Wrapper characters that can surround paths.
 * These are pairs of [open, close] characters.
 */
const PATH_WRAPPERS: [string, string][] = [
	['"', '"'],
	["'", "'"],
	["`", "`"],
	["(", ")"],
	["[", "]"],
	["<", ">"],
];

/**
 * Trailing punctuation that can appear after paths in sentences.
 * These are stripped unless they're part of a valid suffix (extension, line:col).
 */
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/**
 * Check if a string looks like a file path.
 * A path typically contains forward slashes, or starts with ., ~, or /
 */
function looksLikePath(str: string): boolean {
	return (
		str.includes("/") ||
		str.startsWith(".") ||
		str.startsWith("~") ||
		str.startsWith("/")
	);
}

/**
 * Extract a path from within brackets/parentheses when there's adjacent text.
 * Handles patterns like:
 *   "text(src/file.ts)more" -> "src/file.ts"
 *   "see (path/to/file) here" -> "path/to/file"
 *   "in [src/file.ts:42]" -> "src/file.ts:42"
 *
 * Returns the original string if no embedded path is found.
 */
function extractEmbeddedPath(input: string): string {
	const bracketPairs: [string, string][] = [
		["(", ")"],
		["[", "]"],
		["<", ">"],
	];

	for (const [open, close] of bracketPairs) {
		const openIdx = input.indexOf(open);
		const closeIdx = input.lastIndexOf(close);

		if (openIdx !== -1 && closeIdx > openIdx) {
			const hasTextBefore = openIdx > 0;
			const hasTextAfter = closeIdx < input.length - 1;

			if (hasTextBefore || hasTextAfter) {
				const content = input.slice(openIdx + 1, closeIdx);
				if (looksLikePath(content)) {
					return content;
				}
			}
		}
	}

	return input;
}

/**
 * Strip trailing punctuation from a path, but preserve valid suffixes.
 * - Preserves file extensions like .ts, .json
 * - Preserves line:col suffixes like :42 or :42:10
 * - Strips sentence punctuation like trailing period, comma, etc.
 */
function stripTrailingPunctuation(path: string): string {
	const match = path.match(TRAILING_PUNCTUATION);
	if (!match) return path;

	const punct = match[0];
	const beforePunct = path.slice(0, -punct.length);

	// Don't strip if it looks like a file extension (e.g., "file.ts")
	if (punct === "." || punct.startsWith(".")) {
		const extMatch = beforePunct.match(/\.[a-zA-Z0-9]{1,10}$/);
		if (extMatch) {
			return beforePunct;
		}
		// e.g., path ends with ".ts." - strip just the final "."
		if (/^\.[a-zA-Z0-9]{1,10}\.$/.test(punct)) {
			return path.slice(0, -1);
		}
	}

	// Don't strip colons followed by digits (line numbers like :42)
	if (punct === ":") {
		return beforePunct;
	}
	if (punct.startsWith(":") && /^:\d/.test(punct)) {
		return path;
	}

	return beforePunct;
}

/**
 * Strip matching wrapper characters and trailing punctuation from a path.
 * Handles nested wrappers and multiple layers of wrapping.
 * Examples:
 *   "(path/to/file)" -> "path/to/file"
 *   '"path/to/file"' -> "path/to/file"
 *   "'(path/to/file)'" -> "path/to/file"
 *   "./path/file.ts." -> "./path/file.ts"
 *   '"./path/file.ts",' -> "./path/file.ts"
 *   "path/to/file" -> "path/to/file" (unchanged)
 */
export function stripPathWrappers(filePath: string): string {
	let result = filePath.trim();

	// First, try to extract embedded paths from patterns like "text(path)more"
	result = extractEmbeddedPath(result);

	let changed = true;
	while (changed && result.length > 0) {
		changed = false;

		const withoutPunct = stripTrailingPunctuation(result);
		if (withoutPunct !== result) {
			result = withoutPunct;
			changed = true;
			continue;
		}

		for (const [open, close] of PATH_WRAPPERS) {
			if (result.startsWith(open) && result.endsWith(close)) {
				result = result.slice(1, -1);
				changed = true;
				break;
			}
		}
	}

	return result;
}

/**
 * Resolve a path by expanding ~ and converting relative paths to absolute.
 * Also handles file:// URLs by converting them to regular file paths.
 * Strips wrapping characters like quotes, parentheses, brackets, etc.
 */
export function resolvePath(filePath: string, cwd?: string): string {
	let resolved = stripPathWrappers(filePath);

	if (resolved.startsWith("file://")) {
		try {
			const url = new URL(resolved);
			resolved = decodeURIComponent(url.pathname);
		} catch {
			// If URL parsing fails, try simple prefix removal
			resolved = decodeURIComponent(resolved.replace(/^file:\/\//, ""));
		}
	}

	if (resolved.startsWith("~")) {
		const home = process.env.HOME || process.env.USERPROFILE;
		if (home) {
			resolved = resolved.replace(/^~/, home);
		}
	}

	if (!nodePath.isAbsolute(resolved)) {
		resolved = cwd
			? nodePath.resolve(cwd, resolved)
			: nodePath.resolve(resolved);
	}

	return resolved;
}

/**
 * Spawns a process and waits for it to complete.
 * @throws Error if the process exits with non-zero code or fails to spawn
 */
export function spawnAsync(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: ["ignore", "ignore", "pipe"],
			detached: false,
		});

		let stderr = "";
		child.stderr?.on("data", (data) => {
			stderr += data.toString();
		});

		child.on("error", (error) => {
			reject(
				new Error(
					`Failed to spawn '${command}': ${error.message}. Ensure the application is installed.`,
				),
			);
		});

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				const stderrMessage = stderr.trim();
				reject(
					new Error(stderrMessage || `'${command}' exited with code ${code}`),
				);
			}
		});
	});
}

export { EXTERNAL_APPS, type ExternalApp };
