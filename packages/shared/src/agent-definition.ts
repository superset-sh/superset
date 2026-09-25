import type { PromptTransport } from "./agent-prompt-launch";
import {
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
	DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
} from "./agent-prompt-template";

/**
 * Marks where a provider's own session id goes inside fork args. Shared so the
 * settings hint, the builtin presets, and the host's argv builder cannot drift.
 */
export const FORK_SESSION_ID_TOKEN = "{sessionId}";

export type AgentDefinitionSource = "builtin" | "user";
export type AgentKind = "terminal";

interface BaseAgentDefinition {
	id: string;
	source: AgentDefinitionSource;
	kind: AgentKind;
	label: string;
	description?: string;
	enabled: boolean;
	taskPromptTemplate: string;
	/**
	 * Mustache template with AGENT_CONTEXT_PROMPT_VARIABLES. Rendered into
	 * the system portion of the V2 AgentLaunchSpec (cacheable, stable
	 * content like AGENTS.md).
	 */
	contextPromptTemplateSystem: string;
	/**
	 * Mustache template with AGENT_CONTEXT_PROMPT_VARIABLES. Rendered into
	 * the user portion of the V2 AgentLaunchSpec (per-launch content:
	 * user prompt, linked issues/PRs/tasks, attachments).
	 */
	contextPromptTemplateUser: string;
}

export interface TerminalAgentDefinition extends BaseAgentDefinition {
	kind: "terminal";
	command: string;
	promptCommand: string;
	promptCommandSuffix?: string;
	promptTransport: PromptTransport;
	/**
	 * Command that resumes a previous session; the session id is appended as
	 * the final argument (e.g. "claude … --resume <id>"). Includes the base
	 * command as a prefix, like `promptCommand`. Omitted when the CLI has no
	 * id-based resume.
	 */
	resumeCommand?: string;
	/**
	 * Command that forks a previous session. Use `FORK_SESSION_ID_TOKEN` where
	 * the source id belongs; when omitted, the id is appended. The provider
	 * must create a new session id and leave the source session unchanged.
	 */
	forkCommand?: string;
	/**
	 * Command for one-shot headless runs: the CLI executes the prompt and
	 * exits without a TUI. The prompt is appended as the final argument.
	 * Locked down — no permission bypasses; tools are denied or read-only
	 * (plan/ask modes, --no-tools, default-deny sandboxes) so a hostile
	 * prompt can't make the agent act. Includes only the flags the CLI
	 * needs to run unattended in a fresh untrusted dir (trust/repo-check
	 * bypasses). Omitted when the CLI has no headless mode.
	 */
	nonInteractiveCommand?: string;
}

export interface TerminalAgentDefinitionInput
	extends Omit<
		TerminalAgentDefinition,
		| "promptCommand"
		| "promptTransport"
		| "contextPromptTemplateSystem"
		| "contextPromptTemplateUser"
	> {
	promptCommand?: string;
	promptTransport?: PromptTransport;
	contextPromptTemplateSystem?: string;
	contextPromptTemplateUser?: string;
}

export type AgentDefinition = TerminalAgentDefinition;

export function createTerminalAgentDefinition(
	input: TerminalAgentDefinitionInput,
): TerminalAgentDefinition {
	return {
		...input,
		promptCommand: input.promptCommand ?? input.command,
		promptTransport: input.promptTransport ?? "argv",
		contextPromptTemplateSystem:
			input.contextPromptTemplateSystem ??
			DEFAULT_CONTEXT_PROMPT_TEMPLATE_SYSTEM,
		contextPromptTemplateUser:
			input.contextPromptTemplateUser ?? DEFAULT_CONTEXT_PROMPT_TEMPLATE_USER,
	};
}

export function isTerminalAgentDefinition(
	definition: AgentDefinition,
): definition is TerminalAgentDefinition {
	return definition.kind === "terminal";
}
