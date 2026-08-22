import type { TaskInput } from "./agent-command";
import type { AgentLaunchRequest, AgentLaunchSource } from "./agent-launch";
import {
	type AgentDefinitionId,
	buildFileCommandFromAgentConfig,
	buildPromptCommandFromAgentConfig,
	getCommandFromAgentConfig,
	type ResolvedAgentConfig,
	renderTaskPromptTemplate,
	type TerminalResolvedAgentConfig,
} from "./agent-settings";
import {
	assignAttachmentFileName,
	WORKSPACE_ATTACHMENTS_DIR,
} from "./workspace-attachments";

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
	configsById: ReadonlyMap<AgentDefinitionId, ResolvedAgentConfig>;
}): AgentLaunchRequest | null {
	if (selectedAgent === "none") return null;

	const config = getRequiredAgentConfig(configsById, selectedAgent);

	// For terminal agents with files, append file information to the prompt.
	// The writer (terminal-adapter.ts) runs the same assignment over the same
	// list, so the rendered paths match the files on disk.
	let enhancedPrompt = prompt;
	if (initialFiles?.length) {
		const usedFilenames = new Set<string>();

		const fileList = initialFiles
			.map((file, index) => {
				const filename = assignAttachmentFileName({
					rawName: file.filename,
					index,
					used: usedFilenames,
				});
				return `- ${WORKSPACE_ATTACHMENTS_DIR}/${filename}`;
			})
			.join("\n");
		// If prompt exists, prepend it; otherwise just use file list
		enhancedPrompt = prompt
			? `${prompt}\n\nAttached files (available in workspace):\n${fileList}`
			: `Attached files (available in workspace):\n${fileList}`;
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
