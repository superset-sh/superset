import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { env } from "main/env.main";

export interface VoiceSpawnConfig {
	/** The command to execute (python path or PyInstaller binary). */
	command: string;
	/** Arguments to pass (e.g. ["main.py"] for dev, [] for binary). */
	args: string[];
	/** Working directory for the spawned process. */
	cwd: string;
}

/**
 * Returns the spawn configuration for the voice sidecar process.
 *
 * Production (packaged): PyInstaller binary at process.resourcesPath/voice-sidecar/voice-sidecar
 * Development: .venv/bin/python3 main.py in the source directory
 * Preview: Similar to dev, resolves relative to dist/
 */
export function getVoiceSpawnConfig(): VoiceSpawnConfig {
	if (app.isPackaged) {
		return getPackagedConfig();
	}

	const isDev = env.NODE_ENV === "development";
	if (isDev) {
		return getDevConfig();
	}

	return getPreviewConfig();
}

function getPackagedConfig(): VoiceSpawnConfig {
	const binaryDir = join(process.resourcesPath, "voice-sidecar");
	const binaryName =
		process.platform === "win32" ? "voice-sidecar.exe" : "voice-sidecar";
	const binaryPath = join(binaryDir, binaryName);

	if (existsSync(binaryPath)) {
		return { command: binaryPath, args: [], cwd: binaryDir };
	}

	// Fallback: try system python3 with unpacked script
	console.warn(
		"[voice-paths] PyInstaller binary not found, falling back to system python3",
	);
	const scriptDir = join(
		process.resourcesPath,
		"app.asar.unpacked/src/main/lib/voice/python",
	);
	return {
		command: "python3",
		args: [join(scriptDir, "main.py")],
		cwd: scriptDir,
	};
}

function getDevConfig(): VoiceSpawnConfig {
	const scriptDir = join(app.getAppPath(), "src/main/lib/voice/python");
	const venvPython = join(scriptDir, ".venv/bin/python3");

	if (existsSync(venvPython)) {
		return { command: venvPython, args: ["main.py"], cwd: scriptDir };
	}

	console.warn(
		"[voice-paths] Dev venv not found, falling back to system python3",
	);
	return { command: "python3", args: ["main.py"], cwd: scriptDir };
}

function getPreviewConfig(): VoiceSpawnConfig {
	const previewDir = join(__dirname, "../lib/voice/python");
	const srcDir = join(app.getAppPath(), "src/main/lib/voice/python");

	const scriptDir = existsSync(previewDir) ? previewDir : srcDir;
	const venvPython = join(srcDir, ".venv/bin/python3");

	if (existsSync(venvPython)) {
		return { command: venvPython, args: ["main.py"], cwd: scriptDir };
	}

	return { command: "python3", args: ["main.py"], cwd: scriptDir };
}
