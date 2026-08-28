export {
	AMP_PLUGIN_FILE,
	AMP_PLUGIN_MARKER,
	createAmpPlugin,
	createAmpWrapper,
	getAmpGlobalPluginPath,
	getAmpPluginContent,
	removeAmpPlugin,
} from "./agent-wrappers-amp";
export {
	buildCodexWrapperExecLine,
	cleanupGlobalOpenCodePlugin,
	createClaudeSettingsJson,
	createClaudeWrapper,
	createCodexHooksJson,
	createCodexWrapper,
	createOpenCodePlugin,
	createOpenCodeWrapper,
	getClaudeGlobalSettingsJsonContent,
	getClaudeGlobalSettingsJsonPath,
	getClaudeManagedHookCommand,
	getCodexGlobalHooksJsonContent,
	getCodexGlobalHooksJsonPath,
	getOpenCodeGlobalPluginPath,
	getOpenCodePluginContent,
	getOpenCodePluginPath,
	OPENCODE_PLUGIN_FILE,
	OPENCODE_PLUGIN_MARKER,
	removeClaudeManagedHooks,
	removeCodexManagedHooks,
} from "./agent-wrappers-claude-codex-opencode";
export {
	buildWrapperScript,
	getWrapperPath,
	WRAPPER_MARKER,
} from "./agent-wrappers-common";
export {
	buildCopilotWrapperExecLine,
	COPILOT_HOOK_MARKER,
	COPILOT_HOOK_SCRIPT_NAME,
	createCopilotHookScript,
	createCopilotWrapper,
	getCopilotHookScriptContent,
	getCopilotHookScriptPath,
	getCopilotHooksJsonContent,
} from "./agent-wrappers-copilot";
export {
	CURSOR_HOOK_MARKER,
	CURSOR_HOOK_SCRIPT_NAME,
	createCursorAgentWrapper,
	createCursorHookScript,
	createCursorHooksJson,
	getCursorGlobalHooksJsonPath,
	getCursorHookScriptContent,
	getCursorHookScriptPath,
	getCursorHooksJsonContent,
	removeCursorManagedHooks,
} from "./agent-wrappers-cursor";
export {
	createDroidSettingsJson,
	createDroidWrapper,
	getDroidSettingsJsonContent,
	getDroidSettingsJsonPath,
	removeDroidManagedHooks,
} from "./agent-wrappers-droid";
export {
	createGeminiHookScript,
	createGeminiSettingsJson,
	createGeminiWrapper,
	GEMINI_HOOK_MARKER,
	GEMINI_HOOK_SCRIPT_NAME,
	getGeminiHookScriptContent,
	getGeminiHookScriptPath,
	getGeminiSettingsJsonContent,
	getGeminiSettingsJsonPath,
	removeGeminiManagedHooks,
} from "./agent-wrappers-gemini";
export {
	createGrokConfigToml,
	createGrokHooksJson,
	createGrokWrapper,
	GROK_COMPAT_MARKER_END,
	GROK_COMPAT_MARKER_START,
	GROK_HOOKS_FILE,
	getGrokConfigTomlContent,
	getGrokConfigTomlPath,
	getGrokHooksJsonContent,
	getGrokHooksJsonPath,
	getGrokWrapperScript,
	removeGrokManagedHooks,
} from "./agent-wrappers-grok";
export {
	createKimiConfigToml,
	createKimiWrapper,
	getKimiConfigTomlContent,
	getKimiConfigTomlPath,
	getKimiWrapperScript,
	KIMI_HOOKS_MARKER_END,
	KIMI_HOOKS_MARKER_START,
	removeKimiManagedHooks,
} from "./agent-wrappers-kimi";
export {
	createMastraHooksJson,
	createMastraWrapper,
	getMastraGlobalHooksJsonPath,
	getMastraHooksJsonContent,
	removeMastraManagedHooks,
} from "./agent-wrappers-mastra";
export {
	createOmpExtension,
	getOmpExtensionContent,
	getOmpExtensionPath,
	OMP_EXTENSION_FILE,
	OMP_EXTENSION_MARKER,
	removeOmpExtension,
} from "./agent-wrappers-omp";
export {
	createPiExtension,
	getPiExtensionContent,
	getPiExtensionPath,
	PI_EXTENSION_FILE,
	PI_EXTENSION_MARKER,
	removePiExtension,
} from "./agent-wrappers-pi";
export {
	createVibeHooksToml,
	createVibeWrapper,
	getVibeHooksTomlContent,
	getVibeHooksTomlPath,
	getVibeWrapperScript,
	removeVibeManagedHooks,
	VIBE_HOOKS_MARKER_END,
	VIBE_HOOKS_MARKER_START,
} from "./agent-wrappers-vibe";
