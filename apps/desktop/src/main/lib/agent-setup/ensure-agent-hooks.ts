import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import {
	buildClaudeWrapperScript,
	buildCodexWrapperScript,
	buildOpenCodeWrapperScript,
	getClaudeSettingsContent,
	getClaudeSettingsPath,
	getClaudeWrapperPath,
	getCodexWrapperPath,
	getOpenCodeGlobalPluginPath,
	getOpenCodePluginContent,
	getOpenCodeWrapperPath,
	OPENCODE_PLUGIN_MARKER,
	WRAPPER_MARKER,
} from "./agent-wrappers";
import {
	getNotifyScriptContent,
	getNotifyScriptPath,
	NOTIFY_SCRIPT_MARKER,
} from "./notify-hook";
import { BIN_DIR, HOOKS_DIR } from "./paths";

let inFlight: Promise<void> | null = null;

async function readFileIfExists(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}
		throw error;
	}
}

async function isExecutable(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath, fsConstants.X_OK);
		return true;
	} catch {
		return false;
	}
}

async function ensureScriptFile(params: {
	filePath: string;
	content: string;
	mode: number;
	marker: string;
	logLabel: string;
}): Promise<void> {
	const { filePath, content, mode, marker, logLabel } = params;
	const existing = await readFileIfExists(filePath);
	const hasMarker = existing?.includes(marker);

	if (!existing || !hasMarker) {
		await fs.writeFile(filePath, content, { mode });
		await fs.chmod(filePath, mode);
		console.log(`[agent-setup] Rewrote ${logLabel}`);
		return;
	}

	// Only check/fix executability for files that should be executable (0o755)
	const shouldBeExecutable = (mode & 0o111) !== 0;
	if (shouldBeExecutable && !(await isExecutable(filePath))) {
		await fs.chmod(filePath, mode);
	}
}

async function ensureClaudeSettings(): Promise<void> {
	const settingsPath = getClaudeSettingsPath();
	const notifyPath = getNotifyScriptPath();
	const existing = await readFileIfExists(settingsPath);

	if (!existing || !existing.includes('"hooks"')) {
		const content = getClaudeSettingsContent(notifyPath);
		await fs.writeFile(settingsPath, content, { mode: 0o644 });
		console.log("[agent-setup] Rewrote Claude settings");
	}
}

export function ensureAgentHooks(): Promise<void> {
	if (process.platform === "win32") {
		return Promise.resolve();
	}

	if (inFlight) {
		return inFlight;
	}

	inFlight = (async () => {
		await new Promise<void>((resolve) => setImmediate(resolve));

		await fs.mkdir(BIN_DIR, { recursive: true });
		await fs.mkdir(HOOKS_DIR, { recursive: true });

		const globalOpenCodePluginPath = getOpenCodeGlobalPluginPath();
		try {
			await fs.mkdir(path.dirname(globalOpenCodePluginPath), {
				recursive: true,
			});
		} catch (error) {
			console.warn(
				"[agent-setup] Failed to create global OpenCode plugin directory:",
				error,
			);
		}

		const notifyPath = getNotifyScriptPath();
		await ensureScriptFile({
			filePath: notifyPath,
			content: getNotifyScriptContent(),
			mode: 0o755,
			marker: NOTIFY_SCRIPT_MARKER,
			logLabel: "notify hook",
		});

		await ensureClaudeSettings();

		await ensureScriptFile({
			filePath: getClaudeWrapperPath(),
			content: buildClaudeWrapperScript(getClaudeSettingsPath()),
			mode: 0o755,
			marker: WRAPPER_MARKER,
			logLabel: "Claude wrapper",
		});

		await ensureScriptFile({
			filePath: getCodexWrapperPath(),
			content: buildCodexWrapperScript(notifyPath),
			mode: 0o755,
			marker: WRAPPER_MARKER,
			logLabel: "Codex wrapper",
		});

		try {
			await ensureScriptFile({
				filePath: globalOpenCodePluginPath,
				content: getOpenCodePluginContent(),
				mode: 0o644,
				marker: OPENCODE_PLUGIN_MARKER,
				logLabel: "OpenCode plugin",
			});
		} catch (error) {
			console.warn(
				"[agent-setup] Failed to write OpenCode plugin:",
				error,
			);
		}

		await ensureScriptFile({
			filePath: getOpenCodeWrapperPath(),
			content: buildOpenCodeWrapperScript(),
			mode: 0o755,
			marker: WRAPPER_MARKER,
			logLabel: "OpenCode wrapper",
		});
	})().finally(() => {
		inFlight = null;
	});

	return inFlight;
}
