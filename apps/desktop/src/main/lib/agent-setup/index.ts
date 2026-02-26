import fs from "node:fs";
import {
	cleanupGlobalOpenCodePlugin,
	createClaudeWrapper,
	createCodexWrapper,
	createCopilotHookScript,
	createCopilotWrapper,
	createCursorAgentWrapper,
	createCursorHookScript,
	createCursorHooksJson,
	createGeminiHookScript,
	createGeminiSettingsJson,
	createGeminiWrapper,
	createMastraHooksJson,
	createOpenCodePlugin,
	createOpenCodeWrapper,
} from "./agent-wrappers";
import { createNotifyScript } from "./notify-hook";
import {
	BASH_DIR,
	BIN_DIR,
	HOOKS_DIR,
	OPENCODE_PLUGIN_DIR,
	ZSH_DIR,
} from "./paths";
import {
	createBashWrapper,
	createZshWrapper,
	getCommandShellArgs,
	getShellArgs,
	getShellEnv,
} from "./shell-wrappers";

export function setupAgentHooks(): void {
	console.log("[agent-setup] Initializing agent hooks...");

	fs.mkdirSync(BIN_DIR, { recursive: true });
	fs.mkdirSync(HOOKS_DIR, { recursive: true });
	fs.mkdirSync(ZSH_DIR, { recursive: true });
	fs.mkdirSync(BASH_DIR, { recursive: true });
	fs.mkdirSync(OPENCODE_PLUGIN_DIR, { recursive: true });

	cleanupGlobalOpenCodePlugin();

	createNotifyScript();
	createClaudeWrapper();
	createCodexWrapper();
	createOpenCodePlugin();
	createOpenCodeWrapper();
	createCursorHookScript();
	createCursorAgentWrapper();
	createCursorHooksJson();
	createGeminiHookScript();
	createGeminiWrapper();
	createGeminiSettingsJson();
	createMastraHooksJson();
	createCopilotHookScript();
	createCopilotWrapper();

	createZshWrapper();
	createBashWrapper();

	console.log("[agent-setup] Agent hooks initialized");
}

export function getSupersetBinDir(): string {
	return BIN_DIR;
}

export { getCommandShellArgs, getShellArgs, getShellEnv };
