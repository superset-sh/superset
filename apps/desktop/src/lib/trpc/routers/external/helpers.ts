import { spawn } from "node:child_process";
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

/**
 * Get the command and args to open a path in the specified app.
 * Uses `open -a` for macOS apps to avoid PATH issues in production builds.
 */
export function getAppCommand(
	app: ExternalApp,
	targetPath: string,
): { command: string; args: string[] } | null {
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
