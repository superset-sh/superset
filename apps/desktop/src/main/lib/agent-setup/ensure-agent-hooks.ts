import { constants as fsConstants } from "node:fs";
import { promises as fs } from "node:fs";
import {
	buildClaudeWrapperScript,
	buildCodexWrapperScript,
	getClaudeSettingsContent,
	getClaudeSettingsPath,
	getClaudeWrapperPath,
	getCodexWrapperPath,
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

	if (!(await isExecutable(filePath))) {
		await fs.chmod(filePath, mode);
	}
}

async function ensureClaudeSettings(): Promise<void> {
	const settingsPath = getClaudeSettingsPath();
	const notifyPath = getNotifyScriptPath();
	const existing = await readFileIfExists(settingsPath);

	if (!existing || !existing.includes("\"hooks\"")) {
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
	})().finally(() => {
		inFlight = null;
	});

	return inFlight;
}
