import {
	cleanupGlobalOpenCodePlugin,
	createAmpPlugin,
	createAmpWrapper,
	createClaudeSettingsJson,
	createClaudeWrapper,
	createCodexHooksJson,
	createCodexWrapper,
	createCopilotHookScript,
	createCopilotWrapper,
	createCursorAgentWrapper,
	createCursorHookScript,
	createCursorHooksJson,
	createDroidSettingsJson,
	createDroidWrapper,
	createGeminiHookScript,
	createGeminiSettingsJson,
	createGeminiWrapper,
	createGrokConfigToml,
	createGrokHooksJson,
	createGrokWrapper,
	createKimiConfigToml,
	createKimiWrapper,
	createMastraHooksJson,
	createMastraWrapper,
	createOpenCodePlugin,
	createOpenCodeWrapper,
	createPiExtension,
	createVibeHooksToml,
	createVibeWrapper,
} from "./agent-wrappers";
import {
	DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS,
	DESKTOP_AGENT_SETUP_TARGETS,
	type DesktopAgentSetupAction,
} from "./desktop-agent-capabilities";
import { createManagedSkills } from "./managed-skills";
import { createNotifyScript } from "./notify-hook";

const DESKTOP_AGENT_SETUP_RUNNERS: Record<DesktopAgentSetupAction, () => void> =
	{
		"notify-script": createNotifyScript,
		// Async fire-and-forget: every fs mutation inside is individually
		// try/caught and logged, so nothing can reject unhandled, and boot
		// never blocks on skill provisioning.
		"managed-skills": () => void createManagedSkills(),
		"cleanup-global-opencode-plugin": cleanupGlobalOpenCodePlugin,
		"amp-plugin": createAmpPlugin,
		"amp-wrapper": createAmpWrapper,
		"claude-settings-json": createClaudeSettingsJson,
		"claude-wrapper": createClaudeWrapper,
		"codex-hooks-json": createCodexHooksJson,
		"codex-wrapper": createCodexWrapper,
		"droid-wrapper": createDroidWrapper,
		"droid-settings-json": createDroidSettingsJson,
		"opencode-plugin": createOpenCodePlugin,
		"opencode-wrapper": createOpenCodeWrapper,
		"pi-extension": createPiExtension,
		"cursor-hook-script": createCursorHookScript,
		"cursor-agent-wrapper": createCursorAgentWrapper,
		"cursor-hooks-json": createCursorHooksJson,
		"gemini-hook-script": createGeminiHookScript,
		"gemini-wrapper": createGeminiWrapper,
		"gemini-settings-json": createGeminiSettingsJson,
		"kimi-config-toml": createKimiConfigToml,
		"kimi-wrapper": createKimiWrapper,
		"grok-hooks-json": createGrokHooksJson,
		"grok-config-toml": createGrokConfigToml,
		"grok-wrapper": createGrokWrapper,
		"mastra-wrapper": createMastraWrapper,
		"mastra-hooks-json": createMastraHooksJson,
		"copilot-hook-script": createCopilotHookScript,
		"copilot-wrapper": createCopilotWrapper,
		"vibe-hooks-toml": createVibeHooksToml,
		"vibe-wrapper": createVibeWrapper,
	};

/**
 * One bad $HOME state (permissions, a config another tool corrupted) must not
 * break app boot or block the remaining agents' setup — isolate every action.
 */
export function runSetupAction(label: string, action: () => void): boolean {
	try {
		action();
		return true;
	} catch (error) {
		console.warn(`[agent-setup] ${label} failed:`, error);
		return false;
	}
}

export function setupDesktopAgentCapabilities(): void {
	const failed: string[] = [];
	for (const action of DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS) {
		if (!runSetupAction(action, DESKTOP_AGENT_SETUP_RUNNERS[action])) {
			failed.push(action);
		}
	}

	for (const target of DESKTOP_AGENT_SETUP_TARGETS) {
		for (const action of target.setupActions) {
			const label = `${target.id}:${action}`;
			if (!runSetupAction(label, DESKTOP_AGENT_SETUP_RUNNERS[action])) {
				failed.push(label);
			}
		}
	}

	if (failed.length > 0) {
		console.warn(
			`[agent-setup] ${failed.length} setup action(s) failed: ${failed.join(", ")}`,
		);
	}
}

/**
 * Re-run setupActions for one agent. Bootstrap actions run first because
 * per-agent hooks reference the shared notify script — without them the
 * per-agent setup isn't self-sufficient. Returns `false` for unknown ids.
 */
export function setupSingleAgent(agentId: string): boolean {
	const target = DESKTOP_AGENT_SETUP_TARGETS.find((t) => t.id === agentId);
	if (!target) return false;
	for (const action of DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS) {
		runSetupAction(action, DESKTOP_AGENT_SETUP_RUNNERS[action]);
	}
	for (const action of target.setupActions) {
		runSetupAction(
			`${target.id}:${action}`,
			DESKTOP_AGENT_SETUP_RUNNERS[action],
		);
	}
	return true;
}
