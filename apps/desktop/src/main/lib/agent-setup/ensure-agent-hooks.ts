import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import {
	buildWrapperScript,
	CURSOR_HOOK_MARKER,
	GEMINI_HOOK_MARKER,
	getClaudeSettingsContent,
	getClaudeSettingsPath,
	getCursorGlobalHooksJsonPath,
	getCursorHookScriptContent,
	getCursorHookScriptPath,
	getCursorHooksJsonContent,
	getGeminiHookScriptContent,
	getGeminiHookScriptPath,
	getGeminiSettingsJsonContent,
	getGeminiSettingsJsonPath,
	getOpenCodeGlobalPluginPath,
	getOpenCodePluginContent,
	getOpenCodePluginPath,
	getWrapperPath,
	OPENCODE_PLUGIN_MARKER,
	WRAPPER_MARKER,
} from "./agent-wrappers";
import {
	getNotifyScriptContent,
	getNotifyScriptPath,
	NOTIFY_SCRIPT_MARKER,
} from "./notify-hook";
import {
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR,
} from "./paths";

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

async function ensureCursorHooksJson(): Promise<void> {
	const globalPath = getCursorGlobalHooksJsonPath();
	const hookScriptPath = getCursorHookScriptPath();
	const existing = await readFileIfExists(globalPath);

	if (!existing || !existing.includes(hookScriptPath)) {
		const content = getCursorHooksJsonContent(hookScriptPath);
		await fs.mkdir(path.dirname(globalPath), { recursive: true });
		await fs.writeFile(globalPath, content, { mode: 0o644 });
		console.log("[agent-setup] Rewrote Cursor hooks.json");
	}
}

async function ensureGeminiSettings(): Promise<void> {
	const globalPath = getGeminiSettingsJsonPath();
	const hookScriptPath = getGeminiHookScriptPath();
	const existing = await readFileIfExists(globalPath);

	if (!existing || !existing.includes(hookScriptPath)) {
		const content = getGeminiSettingsJsonContent(hookScriptPath);
		await fs.mkdir(path.dirname(globalPath), { recursive: true });
		await fs.writeFile(globalPath, content, { mode: 0o644 });
		console.log("[agent-setup] Rewrote Gemini settings.json");
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
		await fs.mkdir(OPENCODE_CONFIG_DIR, { recursive: true });
		await fs.mkdir(OPENCODE_PLUGIN_DIR, { recursive: true });
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

		const wrappers: Array<{ binaryName: string; content: string }> = [
			{
				binaryName: "claude",
				content: buildWrapperScript(
					"claude",
					`exec "$REAL_BIN" --settings "${getClaudeSettingsPath()}" "$@"`,
				),
			},
			{
				binaryName: "codex",
				content: buildWrapperScript(
					"codex",
					`exec "$REAL_BIN" -c 'notify=["bash","${notifyPath}"]' "$@"`,
				),
			},
			{
				binaryName: "opencode",
				content: buildWrapperScript(
					"opencode",
					`export OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR}"\nexec "$REAL_BIN" "$@"`,
				),
			},
			{
				binaryName: "cursor-agent",
				content: buildWrapperScript("cursor-agent", `exec "$REAL_BIN" "$@"`),
			},
			{
				binaryName: "gemini",
				content: buildWrapperScript("gemini", `exec "$REAL_BIN" "$@"`),
			},
		];

		for (const { binaryName, content } of wrappers) {
			await ensureScriptFile({
				filePath: getWrapperPath(binaryName),
				content,
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: `${binaryName} wrapper`,
			});
		}

		await ensureScriptFile({
			filePath: getOpenCodePluginPath(),
			content: getOpenCodePluginContent(notifyPath),
			mode: 0o644,
			marker: OPENCODE_PLUGIN_MARKER,
			logLabel: "OpenCode plugin",
		});

		try {
			await ensureScriptFile({
				filePath: globalOpenCodePluginPath,
				content: getOpenCodePluginContent(notifyPath),
				mode: 0o644,
				marker: OPENCODE_PLUGIN_MARKER,
				logLabel: "OpenCode global plugin",
			});
		} catch (error) {
			console.warn(
				"[agent-setup] Failed to write global OpenCode plugin:",
				error,
			);
		}

		await ensureScriptFile({
			filePath: getCursorHookScriptPath(),
			content: getCursorHookScriptContent(),
			mode: 0o755,
			marker: CURSOR_HOOK_MARKER,
			logLabel: "Cursor hook script",
		});

		try {
			await ensureCursorHooksJson();
		} catch (error) {
			console.warn("[agent-setup] Failed to write Cursor hooks.json:", error);
		}

		await ensureScriptFile({
			filePath: getGeminiHookScriptPath(),
			content: getGeminiHookScriptContent(),
			mode: 0o755,
			marker: GEMINI_HOOK_MARKER,
			logLabel: "Gemini hook script",
		});

		try {
			await ensureGeminiSettings();
		} catch (error) {
			console.warn(
				"[agent-setup] Failed to write Gemini settings.json:",
				error,
			);
		}
	})().finally(() => {
		inFlight = null;
	});

	return inFlight;
}
