import { promises as fs, constants as fsConstants } from "node:fs";
import path from "node:path";
import {
	AGENT_CONFIGS,
	type AgentName,
	buildAgentWrapperScript,
	getAgentSettingsContent,
	getAgentSettingsPath,
	getAgentWrapperPath,
	getOpenCodeGlobalPluginPath,
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

/**
 * Ensures settings file exists and contains hooks configuration.
 */
async function ensureAgentSettings(agentName: AgentName): Promise<void> {
	const settingsPath = getAgentSettingsPath(agentName);
	if (!settingsPath) return; // Agent doesn't use settings file

	const existing = await readFileIfExists(settingsPath);

	if (!existing || !existing.includes('"hooks"')) {
		const content = getAgentSettingsContent(agentName);
		if (content) {
			await fs.writeFile(settingsPath, content, { mode: 0o644 });
			console.log(
				`[agent-setup] Rewrote ${AGENT_CONFIGS[agentName].name} settings`,
			);
		}
	}
}

/**
 * Ensures wrapper script exists and has correct marker.
 */
async function ensureAgentWrapper(agentName: AgentName): Promise<void> {
	const config = AGENT_CONFIGS[agentName];
	const wrapperPath = getAgentWrapperPath(agentName);
	const content = buildAgentWrapperScript(agentName);

	await ensureScriptFile({
		filePath: wrapperPath,
		content,
		mode: 0o755,
		marker: WRAPPER_MARKER,
		logLabel: `${config.name} wrapper`,
	});
}

/**
 * Ensures plugin file exists for plugin-based agents.
 */
async function ensureAgentPlugin(agentName: AgentName): Promise<void> {
	const config = AGENT_CONFIGS[agentName];
	if (config.type !== "plugin") return;

	const notifyPath = getNotifyScriptPath();
	const content = config.getPluginContent(notifyPath);

	await ensureScriptFile({
		filePath: config.pluginPath,
		content,
		mode: 0o644,
		marker: config.pluginMarker,
		logLabel: `${config.name} plugin`,
	});

	// Handle global plugin if defined
	if (config.globalPluginPath) {
		try {
			await ensureScriptFile({
				filePath: config.globalPluginPath,
				content,
				mode: 0o644,
				marker: config.pluginMarker,
				logLabel: `${config.name} global plugin`,
			});
		} catch (error) {
			console.warn(
				`[agent-setup] Failed to write global ${config.name} plugin:`,
				error,
			);
		}
	}
}

/**
 * Ensures all agent hooks are properly set up.
 * This is called periodically to fix any missing or corrupted files.
 */
export function ensureAgentHooks(): Promise<void> {
	if (process.platform === "win32") {
		return Promise.resolve();
	}

	if (inFlight) {
		return inFlight;
	}

	inFlight = (async () => {
		await new Promise<void>((resolve) => setImmediate(resolve));

		// Create required directories
		await fs.mkdir(BIN_DIR, { recursive: true });
		await fs.mkdir(HOOKS_DIR, { recursive: true });
		await fs.mkdir(OPENCODE_CONFIG_DIR, { recursive: true });
		await fs.mkdir(OPENCODE_PLUGIN_DIR, { recursive: true });

		// Create global OpenCode plugin directory
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

		// Ensure notify script exists
		const notifyPath = getNotifyScriptPath();
		await ensureScriptFile({
			filePath: notifyPath,
			content: getNotifyScriptContent(),
			mode: 0o755,
			marker: NOTIFY_SCRIPT_MARKER,
			logLabel: "notify hook",
		});

		// Ensure all agents are set up
		for (const agentName of Object.keys(AGENT_CONFIGS) as AgentName[]) {
			await ensureAgentSettings(agentName);
			await ensureAgentPlugin(agentName);
			await ensureAgentWrapper(agentName);
		}
	})().finally(() => {
		inFlight = null;
	});

	return inFlight;
}
