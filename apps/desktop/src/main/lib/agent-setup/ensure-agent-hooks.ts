import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import {
	buildCopilotWrapperExecLine,
	buildWrapperScript,
	COPILOT_HOOK_MARKER,
	CURSOR_HOOK_MARKER,
	cleanupGlobalOpenCodePlugin,
	GEMINI_HOOK_MARKER,
	getClaudeSettingsContent,
	getClaudeSettingsPath,
	getCopilotHookScriptContent,
	getCopilotHookScriptPath,
	getCursorGlobalHooksJsonPath,
	getCursorHookScriptContent,
	getCursorHookScriptPath,
	getCursorHooksJsonContent,
	getGeminiHookScriptContent,
	getGeminiHookScriptPath,
	getGeminiSettingsJsonContent,
	getGeminiSettingsJsonPath,
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
	BASH_DIR,
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR,
	ZSH_DIR,
} from "./paths";
import {
	getBashRcfileContent,
	getBashRcfilePath,
	getZshLoginContent,
	getZshLoginPath,
	getZshProfileContent,
	getZshProfilePath,
	getZshRcContent,
	getZshRcPath,
	SHELL_WRAPPER_MARKER,
} from "./shell-wrappers";

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

		// Phase 1: create all directories in parallel
		await Promise.all([
			fs.mkdir(BIN_DIR, { recursive: true }),
			fs.mkdir(HOOKS_DIR, { recursive: true }),
			fs.mkdir(ZSH_DIR, { recursive: true }),
			fs.mkdir(BASH_DIR, { recursive: true }),
			fs.mkdir(OPENCODE_CONFIG_DIR, { recursive: true }),
			fs.mkdir(OPENCODE_PLUGIN_DIR, { recursive: true }),
		]);
		cleanupGlobalOpenCodePlugin();

		// Phase 2: notify script + claude settings (other files depend on these)
		const notifyPath = getNotifyScriptPath();
		await Promise.all([
			ensureScriptFile({
				filePath: notifyPath,
				content: getNotifyScriptContent(),
				mode: 0o755,
				marker: NOTIFY_SCRIPT_MARKER,
				logLabel: "notify hook",
			}),
			ensureClaudeSettings(),
		]);

		// Phase 3: everything else in parallel
		await Promise.all([
			// Agent wrappers
			ensureScriptFile({
				filePath: getWrapperPath("claude"),
				content: buildWrapperScript(
					"claude",
					`exec "$REAL_BIN" --settings "${getClaudeSettingsPath()}" "$@"`,
				),
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: "claude wrapper",
			}),
			ensureScriptFile({
				filePath: getWrapperPath("codex"),
				content: buildWrapperScript(
					"codex",
					`exec "$REAL_BIN" -c 'notify=["bash","${notifyPath}"]' "$@"`,
				),
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: "codex wrapper",
			}),
			ensureScriptFile({
				filePath: getWrapperPath("opencode"),
				content: buildWrapperScript(
					"opencode",
					`export OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR}"\nexec "$REAL_BIN" "$@"`,
				),
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: "opencode wrapper",
			}),
			ensureScriptFile({
				filePath: getWrapperPath("cursor-agent"),
				content: buildWrapperScript("cursor-agent", `exec "$REAL_BIN" "$@"`),
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: "cursor-agent wrapper",
			}),
			ensureScriptFile({
				filePath: getWrapperPath("gemini"),
				content: buildWrapperScript("gemini", `exec "$REAL_BIN" "$@"`),
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: "gemini wrapper",
			}),
			ensureScriptFile({
				filePath: getWrapperPath("copilot"),
				content: buildWrapperScript("copilot", buildCopilotWrapperExecLine()),
				mode: 0o755,
				marker: WRAPPER_MARKER,
				logLabel: "copilot wrapper",
			}),

			// Plugins
			ensureScriptFile({
				filePath: getOpenCodePluginPath(),
				content: getOpenCodePluginContent(notifyPath),
				mode: 0o644,
				marker: OPENCODE_PLUGIN_MARKER,
				logLabel: "OpenCode plugin",
			}),

			// Hook scripts
			ensureScriptFile({
				filePath: getCursorHookScriptPath(),
				content: getCursorHookScriptContent(),
				mode: 0o755,
				marker: CURSOR_HOOK_MARKER,
				logLabel: "Cursor hook script",
			}),
			ensureScriptFile({
				filePath: getGeminiHookScriptPath(),
				content: getGeminiHookScriptContent(),
				mode: 0o755,
				marker: GEMINI_HOOK_MARKER,
				logLabel: "Gemini hook script",
			}),
			ensureScriptFile({
				filePath: getCopilotHookScriptPath(),
				content: getCopilotHookScriptContent(),
				mode: 0o755,
				marker: COPILOT_HOOK_MARKER,
				logLabel: "Copilot hook script",
			}),

			// External tool settings (may fail if dirs don't exist)
			ensureCursorHooksJson().catch((error) =>
				console.warn("[agent-setup] Failed to write Cursor hooks.json:", error),
			),
			ensureGeminiSettings().catch((error) =>
				console.warn(
					"[agent-setup] Failed to write Gemini settings.json:",
					error,
				),
			),

			// Shell wrappers
			ensureScriptFile({
				filePath: getZshProfilePath(),
				content: getZshProfileContent(),
				mode: 0o644,
				marker: SHELL_WRAPPER_MARKER,
				logLabel: "zsh .zprofile",
			}),
			ensureScriptFile({
				filePath: getZshRcPath(),
				content: getZshRcContent(),
				mode: 0o644,
				marker: SHELL_WRAPPER_MARKER,
				logLabel: "zsh .zshrc",
			}),
			ensureScriptFile({
				filePath: getZshLoginPath(),
				content: getZshLoginContent(),
				mode: 0o644,
				marker: SHELL_WRAPPER_MARKER,
				logLabel: "zsh .zlogin",
			}),
			ensureScriptFile({
				filePath: getBashRcfilePath(),
				content: getBashRcfileContent(),
				mode: 0o644,
				marker: SHELL_WRAPPER_MARKER,
				logLabel: "bash rcfile",
			}),
		]);
	})().finally(() => {
		inFlight = null;
	});

	return inFlight;
}
