import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getNotifyScriptPath } from "./notify-hook";
import {
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_CONFIG_DIR,
	OPENCODE_PLUGIN_DIR,
} from "./paths";

export const WRAPPER_MARKER = "# Superset agent-wrapper v1";

const OPENCODE_PLUGIN_SIGNATURE = "// Superset opencode plugin";
const OPENCODE_PLUGIN_VERSION = "v8";
export const OPENCODE_PLUGIN_MARKER = `${OPENCODE_PLUGIN_SIGNATURE} ${OPENCODE_PLUGIN_VERSION}`;

const OPENCODE_PLUGIN_TEMPLATE_PATH = path.join(
	__dirname,
	"templates",
	"opencode-plugin.template.js",
);

// ============================================================================
// Agent Configuration Interface
// ============================================================================

/**
 * Base configuration for all agent types.
 */
interface BaseAgentConfig {
	/** Human-readable name for logging */
	name: string;
	/** Binary name to find in PATH */
	binaryName: string;
}

/**
 * Agent that uses a settings file passed via CLI flag.
 * Examples: Claude Code (--settings), Factory Droid (--settings)
 */
interface SettingsFileAgent extends BaseAgentConfig {
	type: "settings-file";
	/** Name of the settings JSON file */
	settingsFileName: string;
	/** CLI flag to pass settings file path */
	settingsFlag: string;
	/** Function to generate hooks configuration */
	getHooksConfig: (notifyPath: string) => Record<string, unknown>;
}

/**
 * Agent that uses inline CLI configuration.
 * Example: Codex (-c 'notify=...')
 */
interface InlineConfigAgent extends BaseAgentConfig {
	type: "inline-config";
	/** Function to build the exec command with inline config */
	buildExecCommand: (notifyPath: string) => string;
}

/**
 * Agent that uses a plugin system with environment variable.
 * Example: OpenCode (OPENCODE_CONFIG_DIR + plugin file)
 */
interface PluginAgent extends BaseAgentConfig {
	type: "plugin";
	/** Environment variable to set */
	envVar: string;
	/** Value for the environment variable */
	envValue: string;
	/** Path to the plugin file */
	pluginPath: string;
	/** Function to generate plugin content */
	getPluginContent: (notifyPath: string) => string;
	/** Optional: Path for global plugin (for cleanup) */
	globalPluginPath?: string;
	/** Marker to identify our plugin in existing files */
	pluginMarker: string;
}

type AgentConfig = SettingsFileAgent | InlineConfigAgent | PluginAgent;

// ============================================================================
// Shell Script Helpers
// ============================================================================

const REAL_BINARY_RESOLVER = `find_real_binary() {
  local name="$1"
  local IFS=:
  for dir in $PATH; do
    [ -z "$dir" ] && continue
    dir="\${dir%/}"
    case "$dir" in
      "$HOME/.superset/bin"|"$HOME/.superset-dev/bin") continue ;;
    esac
    if [ -x "$dir/$name" ] && [ ! -d "$dir/$name" ]; then
      printf "%s\\n" "$dir/$name"
      return 0
    fi
  done
  return 1
}
`;

function getMissingBinaryMessage(name: string): string {
	return `Superset: ${name} not found in PATH. Install it and ensure it is on PATH, then retry.`;
}

function buildWrapperScript(params: {
	binaryName: string;
	agentName: string;
	execCommand: string;
}): string {
	const { binaryName, agentName, execCommand } = params;
	return `#!/bin/bash
${WRAPPER_MARKER}
# Superset wrapper for ${agentName}
# Injects notification hook settings

${REAL_BINARY_RESOLVER}
REAL_BIN="$(find_real_binary "${binaryName}")"
if [ -z "$REAL_BIN" ]; then
  echo "${getMissingBinaryMessage(binaryName)}" >&2
  exit 127
fi

${execCommand}
`;
}

// ============================================================================
// Agent Registry
// ============================================================================

function getOpenCodePluginContent(notifyPath: string): string {
	const template = fs.readFileSync(OPENCODE_PLUGIN_TEMPLATE_PATH, "utf-8");
	return template
		.replace("{{MARKER}}", OPENCODE_PLUGIN_MARKER)
		.replace("{{NOTIFY_PATH}}", notifyPath);
}

function getOpenCodeGlobalPluginPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "opencode", "plugin", "superset-notify.js");
}

/**
 * Registry of all supported agents and their configurations.
 * To add a new agent, simply add a new entry to this object.
 */
export const AGENT_CONFIGS = {
	claude: {
		type: "settings-file",
		name: "Claude Code",
		binaryName: "claude",
		settingsFileName: "claude-settings.json",
		settingsFlag: "--settings",
		getHooksConfig: (notifyPath: string) => ({
			hooks: {
				UserPromptSubmit: [
					{ hooks: [{ type: "command", command: notifyPath }] },
				],
				Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
				PermissionRequest: [
					{ matcher: "*", hooks: [{ type: "command", command: notifyPath }] },
				],
			},
		}),
	},
	codex: {
		type: "inline-config",
		name: "Codex",
		binaryName: "codex",
		buildExecCommand: (notifyPath: string) =>
			`exec "$REAL_BIN" -c 'notify=["bash","${notifyPath}"]' "$@"`,
	},
	factory: {
		type: "settings-file",
		name: "Factory Droid",
		binaryName: "droid",
		settingsFileName: "factory-settings.json",
		settingsFlag: "--settings",
		/**
		 * Factory Droid hooks configuration.
		 * @see https://docs.factory.ai/cli/configuration/hooks-guide
		 */
		getHooksConfig: (notifyPath: string) => ({
			hooks: {
				UserPromptSubmit: [
					{ hooks: [{ type: "command", command: notifyPath }] },
				],
				Stop: [{ hooks: [{ type: "command", command: notifyPath }] }],
				Notification: [{ hooks: [{ type: "command", command: notifyPath }] }],
			},
		}),
	},
	opencode: {
		type: "plugin",
		name: "OpenCode",
		binaryName: "opencode",
		envVar: "OPENCODE_CONFIG_DIR",
		envValue: OPENCODE_CONFIG_DIR,
		pluginPath: path.join(OPENCODE_PLUGIN_DIR, "superset-notify.js"),
		getPluginContent: getOpenCodePluginContent,
		globalPluginPath: getOpenCodeGlobalPluginPath(),
		pluginMarker: OPENCODE_PLUGIN_MARKER,
	},
} as const satisfies Record<string, AgentConfig>;

export type AgentName = keyof typeof AGENT_CONFIGS;

// ============================================================================
// Path Getters (for external use)
// ============================================================================

export function getAgentWrapperPath(agentName: AgentName): string {
	const config = AGENT_CONFIGS[agentName];
	return path.join(BIN_DIR, config.binaryName);
}

export function getAgentSettingsPath(agentName: AgentName): string | null {
	const config = AGENT_CONFIGS[agentName];
	if (config.type !== "settings-file") return null;
	return path.join(HOOKS_DIR, config.settingsFileName);
}

// Legacy exports for backwards compatibility
export const getClaudeWrapperPath = () => getAgentWrapperPath("claude");
export const getCodexWrapperPath = () => getAgentWrapperPath("codex");
export const getFactoryWrapperPath = () => getAgentWrapperPath("factory");
export const getOpenCodeWrapperPath = () => getAgentWrapperPath("opencode");
export const getClaudeSettingsPath = () =>
	getAgentSettingsPath("claude") as string;
export const getFactorySettingsPath = () =>
	getAgentSettingsPath("factory") as string;
export const getOpenCodePluginPath = () => AGENT_CONFIGS.opencode.pluginPath;
export { getOpenCodeGlobalPluginPath };

// ============================================================================
// Content Generators (for external use)
// ============================================================================

export function getAgentSettingsContent(agentName: AgentName): string | null {
	const config = AGENT_CONFIGS[agentName];
	if (config.type !== "settings-file") return null;
	const notifyPath = getNotifyScriptPath();
	return JSON.stringify(config.getHooksConfig(notifyPath));
}

export function buildAgentWrapperScript(agentName: AgentName): string {
	const config = AGENT_CONFIGS[agentName];
	const notifyPath = getNotifyScriptPath();

	let execCommand: string;

	switch (config.type) {
		case "settings-file": {
			const settingsPath = path.join(HOOKS_DIR, config.settingsFileName);
			execCommand = `exec "$REAL_BIN" ${config.settingsFlag} "${settingsPath}" "$@"`;
			break;
		}
		case "inline-config": {
			execCommand = config.buildExecCommand(notifyPath);
			break;
		}
		case "plugin": {
			execCommand = `export ${config.envVar}="${config.envValue}"\nexec "$REAL_BIN" "$@"`;
			break;
		}
	}

	return buildWrapperScript({
		binaryName: config.binaryName,
		agentName: config.name,
		execCommand,
	});
}

// Legacy exports for backwards compatibility
export const getClaudeSettingsContent = (notifyPath: string) =>
	JSON.stringify(AGENT_CONFIGS.claude.getHooksConfig(notifyPath));
export const getFactorySettingsContent = (notifyPath: string) =>
	JSON.stringify(AGENT_CONFIGS.factory.getHooksConfig(notifyPath));
export const buildClaudeWrapperScript = (settingsPath: string) =>
	buildWrapperScript({
		binaryName: "claude",
		agentName: "Claude Code",
		execCommand: `exec "$REAL_BIN" --settings "${settingsPath}" "$@"`,
	});
export const buildCodexWrapperScript = (notifyPath: string) =>
	buildWrapperScript({
		binaryName: "codex",
		agentName: "Codex",
		execCommand: AGENT_CONFIGS.codex.buildExecCommand(notifyPath),
	});
export const buildFactoryWrapperScript = (settingsPath: string) =>
	buildWrapperScript({
		binaryName: "droid",
		agentName: "Factory Droid",
		execCommand: `exec "$REAL_BIN" --settings "${settingsPath}" "$@"`,
	});
export const buildOpenCodeWrapperScript = (opencodeConfigDir: string) =>
	buildWrapperScript({
		binaryName: "opencode",
		agentName: "OpenCode",
		execCommand: `export OPENCODE_CONFIG_DIR="${opencodeConfigDir}"\nexec "$REAL_BIN" "$@"`,
	});
export { getOpenCodePluginContent };

// ============================================================================
// Agent Setup Functions
// ============================================================================

/**
 * Creates all necessary files for an agent (wrapper, settings, plugin).
 */
export function createAgent(agentName: AgentName): void {
	const config = AGENT_CONFIGS[agentName];
	const notifyPath = getNotifyScriptPath();

	// Create settings file if needed
	if (config.type === "settings-file") {
		const settingsPath = path.join(HOOKS_DIR, config.settingsFileName);
		const content = JSON.stringify(config.getHooksConfig(notifyPath));
		fs.writeFileSync(settingsPath, content, { mode: 0o644 });
	}

	// Create plugin file if needed
	if (config.type === "plugin") {
		const content = config.getPluginContent(notifyPath);
		fs.writeFileSync(config.pluginPath, content, { mode: 0o644 });
	}

	// Create wrapper script
	const wrapperPath = path.join(BIN_DIR, config.binaryName);
	const script = buildAgentWrapperScript(agentName);
	fs.writeFileSync(wrapperPath, script, { mode: 0o755 });

	console.log(`[agent-setup] Created ${config.name} wrapper`);
}

// Legacy exports for backwards compatibility
export const createClaudeWrapper = () => createAgent("claude");
export const createCodexWrapper = () => createAgent("codex");
export const createFactoryWrapper = () => createAgent("factory");
export const createOpenCodeWrapper = () => createAgent("opencode");
export const createOpenCodePlugin = () => {
	const config = AGENT_CONFIGS.opencode;
	const notifyPath = getNotifyScriptPath();
	const content = config.getPluginContent(notifyPath);
	fs.writeFileSync(config.pluginPath, content, { mode: 0o644 });
	console.log("[agent-setup] Created OpenCode plugin");
};

/**
 * Removes stale global plugin written by older versions.
 * Only removes if the file contains our signature to avoid deleting user plugins.
 */
export function cleanupGlobalOpenCodePlugin(): void {
	try {
		const config = AGENT_CONFIGS.opencode;
		const globalPluginPath = config.globalPluginPath;
		if (!globalPluginPath || !fs.existsSync(globalPluginPath)) return;

		const content = fs.readFileSync(globalPluginPath, "utf-8");
		if (content.includes(OPENCODE_PLUGIN_SIGNATURE)) {
			fs.unlinkSync(globalPluginPath);
			console.log(
				"[agent-setup] Removed stale global OpenCode plugin to prevent dev/prod conflicts",
			);
		}
	} catch (error) {
		console.warn(
			"[agent-setup] Failed to cleanup global OpenCode plugin:",
			error,
		);
	}
}

/**
 * Creates all agent wrappers and settings files.
 */
export function createAllAgents(): void {
	for (const agentName of Object.keys(AGENT_CONFIGS) as AgentName[]) {
		createAgent(agentName);
	}
}
