import {
	buildAgentModelArgs,
	buildAgentModelEnv,
} from "@superset/shared/agent-models";
import {
	envOverlayPrefix,
	quoteSingleShell,
} from "@superset/shared/agent-prompt-launch";

/**
 * Small/fast model per preset for headless one-shot runs, validated against
 * the curated catalog in agent-models.ts. Only presets with an unambiguous
 * cheap tier are listed — the rest run their default model (opencode's
 * model ids are provider-scoped, copilot's catalog has no small tier, and
 * cursor-agent rejects ids outside the account's live model list, so
 * forcing one could break the run for those users).
 */
export const HEADLESS_SMALL_MODELS: Record<string, string> = {
	claude: "haiku",
	codex: "gpt-5.6-luna",
	gemini: "gemini-2.5-flash",
	vibe: "devstral-small",
};

/**
 * Splices a model selection into a headless agent command. Model args go
 * right after the binary: trailing flags like gemini's `-p` consume the next
 * token, so appending would swallow the prompt. Env-selected models (vibe)
 * ride an env overlay prefix instead. The prompt is appended by the caller.
 */
export function buildHeadlessAgentCommand(
	presetId: string,
	baseCommand: string,
	model: string | undefined,
): string {
	const modelArgs = buildAgentModelArgs(presetId, model);
	const [bin, ...flags] = baseCommand.split(" ");
	const command = [bin, ...modelArgs.map(quoteSingleShell), ...flags].join(" ");
	return `${envOverlayPrefix(buildAgentModelEnv(presetId, model))}${command}`;
}
