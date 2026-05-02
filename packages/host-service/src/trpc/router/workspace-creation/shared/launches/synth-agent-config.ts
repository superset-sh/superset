import type { AgentDefinitionId } from "@superset/shared/agent-catalog";
import {
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
	DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
} from "@superset/shared/agent-prompt-template";
import type { TerminalResolvedAgentConfig } from "@superset/shared/agent-settings";
import type { PromptTransport } from "../../../settings/agent-presets";

export interface HostPresetRow {
	presetId: string;
	label: string;
	command: string;
	promptTransport: PromptTransport;
}

/**
 * Build the minimal `TerminalResolvedAgentConfig` shape that
 * `buildLaunchSpec` requires. The host config row only stores spawn
 * data (command/args/transport); template fields come from
 * `@superset/shared` constants. Per-preset template overrides are
 * intentionally not stored on the host row — see PR4 plan decision 5.
 *
 * `buildLaunchSpec` only reads `contextPromptTemplateSystem` +
 * `contextPromptTemplateUser`, but the full type signature is
 * required by the function. Other fields are synthesized with safe
 * defaults so the object type-checks.
 */
export function synthAgentConfig(
	row: HostPresetRow,
): TerminalResolvedAgentConfig {
	return {
		id: row.presetId as AgentDefinitionId,
		kind: "terminal",
		source: "builtin",
		label: row.label,
		enabled: true,
		taskPromptTemplate: DEFAULT_TERMINAL_TASK_PROMPT_TEMPLATE,
		contextPromptTemplateSystem: DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
		contextPromptTemplateUser: DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
		command: row.command,
		promptCommand: row.command,
		promptTransport: row.promptTransport,
		overriddenFields: [],
	};
}
