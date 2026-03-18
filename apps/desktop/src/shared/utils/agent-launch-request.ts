import type { TaskInput } from "@superset/shared/agent-command";
import type {
	AgentLaunchRequest,
	AgentLaunchSource,
} from "@superset/shared/agent-launch";
import {
	type AgentDefinitionId,
	buildFileCommandFromAgentConfig,
	buildPromptCommandFromAgentConfig,
	getCommandFromAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	type TerminalResolvedAgentConfig,
} from "./agent-settings";

function getRequiredAgentConfig(
	configsById: ReadonlyMap<AgentDefinitionId, ResolvedAgentConfig>,
	selectedAgent: AgentDefinitionId,
): ResolvedAgentConfig {
	const config = configsById.get(selectedAgent);
	if (!config) {
		throw new Error(`Agent "${selectedAgent}" is not configured`);
	}
	if (!config.enabled) {
		throw new Error(`Agent "${selectedAgent}" is disabled`);
	}
	return config;
}

function requireTerminalConfig(
	config: ResolvedAgentConfig,
): TerminalResolvedAgentConfig {
	if (config.kind !== "terminal") {
		throw new Error(`Agent "${config.id}" is not a terminal agent`);
	}

	return config;
}

export function buildPromptAgentLaunchRequest({
	workspaceId,
	source,
	selectedAgent,
	prompt,
	initialFiles,
	taskSlug,
	configsById,
}: {
	workspaceId: string;
	source: AgentLaunchSource;
	selectedAgent: AgentDefinitionId | "none";
	prompt: string;
	initialFiles?: Array<{
		data: string;
		mediaType: string;
		filename?: string;
	}>;
	taskSlug?: string;
	configsById: ReadonlyMap<AgentDefinitionId, ResolvedAgentConfig>;
}): AgentLaunchRequest | null {
	if (selectedAgent === "none") return null;

	const config = getRequiredAgentConfig(configsById, selectedAgent);

	if (config.kind === "chat") {
		return {
			kind: "chat",
			workspaceId,
			agentType: config.id,
			source,
			chat: {
				initialPrompt: prompt || undefined,
				initialFiles: initialFiles?.length ? initialFiles : undefined,
				model: config.model,
				taskSlug,
			},
		};
	}

	// For terminal agents with files, append file information to the prompt
	// Use the same filename sanitization logic as terminal-adapter.ts to ensure paths match
	let enhancedPrompt = prompt;
	if (initialFiles?.length && prompt) {
		const fileList = initialFiles
			.map((file, index) => {
				if (!file.filename) {
					return `- .superset/attachments/attachment_${index + 1}`;
				}
				// Sanitize filename (same logic as terminal adapter)
				const sanitized = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
				return `- .superset/attachments/${sanitized}`;
			})
			.join("\n");
		enhancedPrompt = `${prompt}\n\nAttached files (available in workspace):\n${fileList}`;
	}

	const command = enhancedPrompt
		? buildPromptCommandFromAgentConfig({
				prompt: enhancedPrompt,
				randomId: crypto.randomUUID(),
				config,
			})
		: getCommandFromAgentConfig(config);

	if (!command) return null;

	return {
		kind: "terminal",
		workspaceId,
		agentType: config.id,
		source,
		terminal: {
			command,
			name: config.label,
			initialFiles: initialFiles?.length ? initialFiles : undefined,
		},
	};
}

export function buildTaskAgentLaunchRequest({
	workspaceId,
	source,
	selectedAgent,
	task,
	autoRun,
	configsById,
}: {
	workspaceId: string;
	source: AgentLaunchSource;
	selectedAgent: AgentDefinitionId | "none";
	task: TaskInput;
	autoRun: boolean;
	configsById: ReadonlyMap<AgentDefinitionId, ResolvedAgentConfig>;
}): AgentLaunchRequest | null {
	if (selectedAgent === "none") return null;

	const config = getRequiredAgentConfig(configsById, selectedAgent);

	if (config.kind === "chat") {
		return {
			kind: "chat",
			workspaceId,
			agentType: config.id,
			source,
			chat: {
				initialPrompt: renderTaskPromptTemplate(
					config.taskPromptTemplate,
					task,
				),
				model: config.model,
				retryCount: 1,
				autoExecute: autoRun,
				taskSlug: task.slug,
			},
		};
	}

	const terminalConfig = requireTerminalConfig(config);
	const renderedPrompt = renderTaskPromptTemplate(
		terminalConfig.taskPromptTemplate,
		task,
	);
	const taskPromptFileName = `task-${task.slug}.md`;
	const command = buildFileCommandFromAgentConfig({
		filePath: `.superset/${taskPromptFileName}`,
		config: terminalConfig,
	});

	if (!command) {
		throw new Error(`No command configured for agent "${selectedAgent}"`);
	}

	return {
		kind: "terminal",
		workspaceId,
		agentType: terminalConfig.id,
		source,
		terminal: {
			command,
			name: task.slug,
			taskPromptContent: renderedPrompt,
			taskPromptFileName,
			autoExecute: autoRun,
		},
	};
}
