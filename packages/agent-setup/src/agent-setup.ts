import {
	AGENT_SETUP_TARGETS,
	type AgentSetupTargetId,
} from "./agent-setup-targets";
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
	createOmpExtension,
	createOpenCodePlugin,
	createOpenCodeWrapper,
	createPiExtension,
	createVibeHooksToml,
	createVibeWrapper,
	removeAmpPlugin,
	removeClaudeManagedHooks,
	removeCodexManagedHooks,
	removeCursorManagedHooks,
	removeDroidManagedHooks,
	removeGeminiManagedHooks,
	removeGrokManagedHooks,
	removeKimiManagedHooks,
	removeMastraManagedHooks,
	removeOmpExtension,
	removePiExtension,
	removeVibeManagedHooks,
} from "./agent-wrappers";
import { resolveDisabledSkillIds } from "./disabled-skills";
import { createManagedSkills } from "./managed-skills";
import { createNotifyScript } from "./notify-hook";

type LabeledAction = readonly [label: string, action: () => void];

/** Shared prerequisites: per-agent hooks reference the notify script. */
const BOOTSTRAP_SETUP: readonly LabeledAction[] = [
	["cleanup-global-opencode-plugin", cleanupGlobalOpenCodePlugin],
	["notify-script", createNotifyScript],
];

interface AgentSetupDefinition {
	/** Writers that (re)register the agent's Superset integration. */
	setup: readonly (() => void)[];
	/**
	 * Removes Superset's footprint from the agent's global config when the
	 * user disables its hook integration. Wrappers and scripts under
	 * ~/.superset/ stay — they are Superset-owned and inert outside its
	 * terminals. Absent when the agent has no global footprint (Copilot,
	 * OpenCode).
	 */
	teardown?: readonly (() => void)[];
}

const AGENT_SETUP_DEFINITIONS: Record<
	AgentSetupTargetId,
	AgentSetupDefinition
> = {
	amp: {
		setup: [createAmpPlugin, createAmpWrapper],
		teardown: [removeAmpPlugin],
	},
	claude: {
		setup: [createClaudeSettingsJson, createClaudeWrapper],
		teardown: [removeClaudeManagedHooks],
	},
	codex: {
		setup: [createCodexHooksJson, createCodexWrapper],
		teardown: [removeCodexManagedHooks],
	},
	droid: {
		setup: [createDroidWrapper, createDroidSettingsJson],
		teardown: [removeDroidManagedHooks],
	},
	opencode: {
		setup: [createOpenCodePlugin, createOpenCodeWrapper],
	},
	omp: {
		setup: [createOmpExtension],
		teardown: [removeOmpExtension],
	},
	pi: {
		setup: [createPiExtension],
		teardown: [removePiExtension],
	},
	"cursor-agent": {
		setup: [
			createCursorHookScript,
			createCursorAgentWrapper,
			createCursorHooksJson,
		],
		teardown: [removeCursorManagedHooks],
	},
	gemini: {
		setup: [
			createGeminiHookScript,
			createGeminiWrapper,
			createGeminiSettingsJson,
		],
		teardown: [removeGeminiManagedHooks],
	},
	mastracode: {
		setup: [createMastraWrapper, createMastraHooksJson],
		teardown: [removeMastraManagedHooks],
	},
	kimi: {
		setup: [createKimiConfigToml, createKimiWrapper],
		teardown: [removeKimiManagedHooks],
	},
	grok: {
		setup: [createGrokHooksJson, createGrokConfigToml, createGrokWrapper],
		teardown: [removeGrokManagedHooks],
	},
	copilot: {
		setup: [createCopilotHookScript, createCopilotWrapper],
	},
	vibe: {
		setup: [createVibeHooksToml, createVibeWrapper],
		teardown: [removeVibeManagedHooks],
	},
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

function runAgentActions(
	agentId: string,
	actions: readonly (() => void)[] | undefined,
	failed: string[],
): void {
	for (const action of actions ?? []) {
		const label = `${agentId}:${action.name || "action"}`;
		if (!runSetupAction(label, action)) failed.push(label);
	}
}

function warnOnFailures(failed: string[]): void {
	if (failed.length > 0) {
		console.warn(
			`[agent-setup] ${failed.length} setup action(s) failed: ${failed.join(", ")}`,
		);
	}
}

interface SetupAgentCapabilitiesOptions {
	/**
	 * Agents whose hook integration the user disabled. Their teardown actions
	 * run instead of setup, actively reaping entries written by older app
	 * versions or while the toggle changed offline.
	 */
	disabledAgentIds?: readonly string[];
	/** Skills the user disabled; withheld from provisioning and reaped. */
	disabledSkillIds?: readonly string[];
}

export function setupAgentCapabilities({
	disabledAgentIds = [],
	disabledSkillIds = [],
}: SetupAgentCapabilitiesOptions = {}): void {
	const disabled = new Set(disabledAgentIds);
	const failed: string[] = [];
	for (const [label, action] of BOOTSTRAP_SETUP) {
		if (!runSetupAction(label, action)) failed.push(label);
	}

	// Async fire-and-forget: every fs mutation inside is individually
	// try/caught and logged, so nothing can reject unhandled, and boot never
	// blocks on skill provisioning.
	if (
		!runSetupAction(
			"managed-skills",
			() => void createManagedSkills({ disabledSkills: disabledSkillIds }),
		)
	) {
		failed.push("managed-skills");
	}

	for (const target of AGENT_SETUP_TARGETS) {
		const definition = AGENT_SETUP_DEFINITIONS[target.id];
		runAgentActions(
			target.id,
			disabled.has(target.id) ? definition.teardown : definition.setup,
			failed,
		);
	}

	warnOnFailures(failed);
}

/**
 * Re-run setup for one agent. Bootstrap actions run first because per-agent
 * hooks reference the shared notify script — without them the per-agent setup
 * isn't self-sufficient. Returns `false` for unknown ids.
 */
export function setupSingleAgent(agentId: string): boolean {
	const definition = AGENT_SETUP_DEFINITIONS[agentId as AgentSetupTargetId];
	if (!definition) return false;
	const failed: string[] = [];
	for (const [label, action] of BOOTSTRAP_SETUP) {
		if (!runSetupAction(label, action)) failed.push(label);
	}
	// Re-adding/re-enabling one agent used to incidentally refresh managed
	// skills too (it was part of BOOTSTRAP_SETUP); keep that behavior now
	// that it's split out.
	if (
		!runSetupAction(
			"managed-skills",
			() =>
				void createManagedSkills({ disabledSkills: resolveDisabledSkillIds() }),
		)
	) {
		failed.push("managed-skills");
	}
	runAgentActions(agentId, definition.setup, failed);
	warnOnFailures(failed);
	return true;
}

/**
 * Removes one agent's Superset footprint from its global config. Returns
 * `false` for unknown ids; `true` even when the agent has no teardown
 * actions (no global footprint to remove).
 */
export function teardownSingleAgent(agentId: string): boolean {
	const definition = AGENT_SETUP_DEFINITIONS[agentId as AgentSetupTargetId];
	if (!definition) return false;
	const failed: string[] = [];
	runAgentActions(agentId, definition.teardown, failed);
	warnOnFailures(failed);
	return true;
}
