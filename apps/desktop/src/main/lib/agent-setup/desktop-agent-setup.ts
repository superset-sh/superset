import {
	cleanupGlobalOpenCodePlugin,
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
	createMastraHooksJson,
	createMastraWrapper,
	createOpenCodePlugin,
	createOpenCodeWrapper,
} from "./agent-wrappers";
import {
	DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS,
	DESKTOP_AGENT_SETUP_TARGETS,
	type DesktopAgentSetupAction,
} from "./desktop-agent-capabilities";
import { createNotifyScript } from "./notify-hook";

const DESKTOP_AGENT_SETUP_RUNNERS: Record<DesktopAgentSetupAction, () => void> =
	{
		"notify-script": createNotifyScript,
		"cleanup-global-opencode-plugin": cleanupGlobalOpenCodePlugin,
		"amp-wrapper": createAmpWrapper,
		"claude-settings-json": createClaudeSettingsJson,
		"claude-wrapper": createClaudeWrapper,
		"codex-hooks-json": createCodexHooksJson,
		"codex-wrapper": createCodexWrapper,
		"droid-wrapper": createDroidWrapper,
		"droid-settings-json": createDroidSettingsJson,
		"opencode-plugin": createOpenCodePlugin,
		"opencode-wrapper": createOpenCodeWrapper,
		"cursor-hook-script": createCursorHookScript,
		"cursor-agent-wrapper": createCursorAgentWrapper,
		"cursor-hooks-json": createCursorHooksJson,
		"gemini-hook-script": createGeminiHookScript,
		"gemini-wrapper": createGeminiWrapper,
		"gemini-settings-json": createGeminiSettingsJson,
		"mastra-wrapper": createMastraWrapper,
		"mastra-hooks-json": createMastraHooksJson,
		"copilot-hook-script": createCopilotHookScript,
		"copilot-wrapper": createCopilotWrapper,
	};

export function setupDesktopAgentCapabilities(): void {
	for (const action of DESKTOP_AGENT_SETUP_BOOTSTRAP_ACTIONS) {
		DESKTOP_AGENT_SETUP_RUNNERS[action]();
	}

	for (const target of DESKTOP_AGENT_SETUP_TARGETS) {
		for (const action of target.setupActions) {
			DESKTOP_AGENT_SETUP_RUNNERS[action]();
		}
	}
}
