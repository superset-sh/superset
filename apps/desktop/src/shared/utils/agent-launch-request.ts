import type { AgentPreset } from "@superset/local-db";
import type { AgentType, TaskInput } from "@superset/shared/agent-command";
import type {
	AgentLaunchRequest,
	AgentLaunchSource,
	StartableAgentType,
} from "@superset/shared/agent-launch";
import {
	buildFileCommandFromAgentPreset,
	buildPromptCommandFromAgentPreset,
	DEFAULT_AGENT_TASK_PROMPT_TEMPLATE,
	getCommandFromAgentPreset,
	getDefaultAgentPreset,
	renderTaskPromptTemplate,
} from "./agent-preset-settings";

function getResolvedPreset(
	agentPresetById: ReadonlyMap<AgentType, AgentPreset>,
	agent: AgentType,
): AgentPreset {
	return agentPresetById.get(agent) ?? getDefaultAgentPreset(agent);
}

export function buildPromptAgentLaunchRequest({
	workspaceId,
	source,
	selectedAgent,
	prompt,
	agentPresetById,
}: {
	workspaceId: string;
	source: AgentLaunchSource;
	selectedAgent: StartableAgentType | "none";
	prompt: string;
	agentPresetById: ReadonlyMap<AgentType, AgentPreset>;
}): AgentLaunchRequest | null {
	if (selectedAgent === "none") return null;

	if (selectedAgent === "superset-chat") {
		return {
			kind: "chat",
			workspaceId,
			agentType: "superset-chat",
			source,
			chat: {
				initialPrompt: prompt || undefined,
			},
		};
	}

	const selectedPreset = getResolvedPreset(agentPresetById, selectedAgent);
	const command = prompt
		? buildPromptCommandFromAgentPreset({
				prompt,
				randomId: window.crypto.randomUUID(),
				preset: selectedPreset,
			})
		: getCommandFromAgentPreset(selectedPreset);

	if (!command) return null;

	return {
		kind: "terminal",
		workspaceId,
		agentType: selectedAgent,
		source,
		terminal: {
			command,
			name: "Agent",
		},
	};
}

export function buildTaskAgentLaunchRequest({
	workspaceId,
	source,
	selectedAgent,
	task,
	autoRun,
	agentPresetById,
}: {
	workspaceId: string;
	source: AgentLaunchSource;
	selectedAgent: StartableAgentType;
	task: TaskInput;
	autoRun: boolean;
	agentPresetById: ReadonlyMap<AgentType, AgentPreset>;
}): AgentLaunchRequest {
	if (selectedAgent === "superset-chat") {
		const template =
			agentPresetById.get("claude")?.taskPromptTemplate ??
			DEFAULT_AGENT_TASK_PROMPT_TEMPLATE;
		return {
			kind: "chat",
			workspaceId,
			agentType: "superset-chat",
			source,
			chat: {
				initialPrompt: renderTaskPromptTemplate(template, task),
				retryCount: 1,
				autoExecute: autoRun,
				taskSlug: task.slug,
			},
		};
	}

	const selectedPreset = getResolvedPreset(agentPresetById, selectedAgent);
	const taskPrompt = renderTaskPromptTemplate(
		selectedPreset.taskPromptTemplate,
		task,
	);
	const taskPromptFileName = `task-${task.slug}.md`;
	const command = buildFileCommandFromAgentPreset({
		filePath: `.superset/${taskPromptFileName}`,
		preset: selectedPreset,
	});

	if (!command) {
		throw new Error(`No command configured for agent "${selectedAgent}"`);
	}

	return {
		kind: "terminal",
		workspaceId,
		agentType: selectedAgent,
		source,
		terminal: {
			command,
			name: task.slug,
			taskPromptContent: taskPrompt,
			taskPromptFileName,
			autoExecute: autoRun,
		},
	};
}
