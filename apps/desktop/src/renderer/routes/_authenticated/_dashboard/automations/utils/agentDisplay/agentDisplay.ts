import { getPresetById } from "@superset/shared/host-agent-presets";
import type { AgentSelectAgent } from "renderer/components/AgentSelect";

const UUID_LIKE_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AutomationAgentDisplay {
	label: string;
	iconKey: string | null;
	isKnown: boolean;
}

export function getPortableAutomationAgentId(agent: AgentSelectAgent): string {
	return agent.iconId ?? agent.id;
}

export function findAutomationAgentChoice(
	agents: readonly AgentSelectAgent[],
	value: string,
): AgentSelectAgent | undefined {
	return agents.find(
		(agent) =>
			agent.id === value || getPortableAutomationAgentId(agent) === value,
	);
}

export function getAutomationAgentDisplay(
	agents: readonly AgentSelectAgent[],
	value: string,
): AutomationAgentDisplay {
	const choice = findAutomationAgentChoice(agents, value);
	if (choice) {
		return {
			label: choice.label,
			iconKey: choice.iconId ?? choice.id,
			isKnown: true,
		};
	}

	const preset = getPresetById(value);
	if (preset) {
		return {
			label: preset.label,
			iconKey: preset.presetId,
			isKnown: true,
		};
	}

	if (UUID_LIKE_PATTERN.test(value)) {
		return {
			label: "Configured runner",
			iconKey: null,
			isKnown: false,
		};
	}

	return {
		label: value || "Select runner",
		iconKey: value || null,
		isKnown: Boolean(value),
	};
}

export type AutomationModelRunnerFamily =
	| "claude"
	| "codex"
	| "gemini"
	| "opencode";

const AUTOMATION_MODEL_RUNNER_FAMILIES = new Set<string>([
	"claude",
	"codex",
	"gemini",
	"opencode",
]);

function normalizeAgentFamilySource(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function inferAutomationModelRunnerFamily(
	value: string,
): AutomationModelRunnerFamily | null {
	const normalized = normalizeAgentFamilySource(value);
	if (normalized.includes("claude")) return "claude";
	if (normalized.includes("opencode")) return "opencode";
	if (normalized.includes("codex")) return "codex";
	if (normalized.includes("gemini")) return "gemini";
	return AUTOMATION_MODEL_RUNNER_FAMILIES.has(normalized)
		? (normalized as AutomationModelRunnerFamily)
		: null;
}

export function getAutomationModelRunnerFamily(
	agents: readonly AgentSelectAgent[],
	value: string | null | undefined,
): AutomationModelRunnerFamily | null {
	if (!value) return null;
	const choice = findAutomationAgentChoice(agents, value);
	return inferAutomationModelRunnerFamily(
		[choice?.iconId, choice?.id, choice?.label, value]
			.filter((item): item is string => Boolean(item))
			.join(" "),
	);
}

export function supportsAutomationModelSelection(
	agents: readonly AgentSelectAgent[],
	value: string | null | undefined,
): boolean {
	return getAutomationModelRunnerFamily(agents, value) !== null;
}
