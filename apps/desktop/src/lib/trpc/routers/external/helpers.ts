import { spawn } from "node:child_process";
import nodePath from "node:path";
import { EXTERNAL_APPS, type ExternalApp } from "@superset/local-db";

/** Map of app IDs to their macOS application names */
const APP_NAMES: Record<ExternalApp, string | null> = {
	finder: null, // Handled specially with shell.showItemInFolder
	vscode: "Visual Studio Code",
	cursor: "Cursor",
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
 * Resolve a path by expanding ~ and converting relative paths to absolute.
 */
export function resolvePath(filePath: string, cwd?: string): string {
	let resolved = filePath;

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
			stdio: "ignore",
			detached: false,
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
				reject(
					new Error(
						`'${command}' exited with code ${code}. The application may not be installed.`,
					),
				);
			}
		});
	});
}

export { EXTERNAL_APPS, type ExternalApp };
