import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Box, Text, useApp } from "ink";
import SelectInput from "ink-select-input";
import TextInput from "ink-text-input";
import React from "react";
import { getDb } from "../lib/db";
import { WorkspaceOrchestrator } from "../lib/orchestrators/workspace-orchestrator";
import { AgentType } from "../types/process";
import { WorkspaceType } from "../types/workspace";

interface InitProps {
	onComplete?: () => void;
}

enum InitStep {
	SELECT_TYPE = "SELECT_TYPE",
	INPUT_PATH = "INPUT_PATH",
	INPUT_BRANCH = "INPUT_BRANCH",
	INPUT_NAME = "INPUT_NAME",
	SELECT_AGENTS = "SELECT_AGENTS",
	CREATING = "CREATING",
	COMPLETE = "COMPLETE",
}

interface InitState {
	step: InitStep;
	workspaceType?: WorkspaceType;
	path: string;
	branch: string;
	name: string;
	defaultAgents: AgentType[];
	error?: string;
	workspaceId?: string;
}

export function Init({ onComplete }: InitProps) {
	const { exit } = useApp();
	const [state, setState] = React.useState<InitState>({
		step: InitStep.SELECT_TYPE,
		path: "",
		branch: "",
		name: "",
		defaultAgents: [],
	});

	const handleTypeSelect = (item: { value: WorkspaceType }) => {
		setState((s) => ({
			...s,
			workspaceType: item.value,
			step:
				item.value === WorkspaceType.LOCAL
					? InitStep.INPUT_PATH
					: InitStep.INPUT_BRANCH,
		}));
	};

	const handlePathSubmit = async () => {
		const expandedPath = state.path.replace(/^~/, process.env.HOME || "~");
		const absolutePath = resolve(expandedPath);

		// Validate path exists
		if (!existsSync(absolutePath)) {
			setState((s) => ({
				...s,
				error: `Path does not exist: ${absolutePath}`,
			}));
			return;
		}

		// Check for duplicate paths
		try {
			const db = getDb();
			const orchestrator = new WorkspaceOrchestrator(db);
			const workspaces = await orchestrator.list();

			const duplicate = workspaces.find(
				(w) => "path" in w && w.path === absolutePath,
			);

			if (duplicate) {
				setState((s) => ({
					...s,
					error: `A workspace already exists for this path: ${duplicate.name || duplicate.id}`,
				}));
				return;
			}
		} catch (err) {
			// Ignore database errors during validation
		}

		setState((s) => ({
			...s,
			path: absolutePath,
			error: undefined,
			step: InitStep.INPUT_NAME,
		}));
	};

	const handleBranchSubmit = async () => {
		if (!state.branch.trim()) {
			setState((s) => ({
				...s,
				error: "Branch/ref cannot be empty",
			}));
			return;
		}

		// Check for duplicate branches
		try {
			const db = getDb();
			const orchestrator = new WorkspaceOrchestrator(db);
			const workspaces = await orchestrator.list();

			const duplicate = workspaces.find(
				(w) => "branch" in w && w.branch === state.branch.trim(),
			);

			if (duplicate) {
				setState((s) => ({
					...s,
					error: `A workspace already exists for this branch: ${duplicate.name || duplicate.id}`,
				}));
				return;
			}
		} catch (err) {
			// Ignore database errors during validation
		}

		setState((s) => ({
			...s,
			error: undefined,
			step: InitStep.INPUT_NAME,
		}));
	};

	const handleNameSubmit = () => {
		setState((s) => ({
			...s,
			error: undefined,
			step: InitStep.SELECT_AGENTS,
		}));
	};

	const handleAgentsSelect = (item: { value: string }) => {
		if (item.value === "done") {
			createWorkspace();
		} else if (item.value === "skip") {
			setState((s) => ({ ...s, defaultAgents: [] }));
			createWorkspace();
		} else {
			// Toggle agent selection
			setState((s) => ({
				...s,
				defaultAgents: s.defaultAgents.includes(item.value as AgentType)
					? s.defaultAgents.filter((a) => a !== item.value)
					: [...s.defaultAgents, item.value as AgentType],
			}));
		}
	};

	const createWorkspace = async () => {
		setState((s) => ({ ...s, step: InitStep.CREATING }));

		try {
			const db = getDb();
			const orchestrator = new WorkspaceOrchestrator(db);

			// Ensure at least one environment exists, create if missing
			const { EnvironmentOrchestrator } = await import(
				"../lib/orchestrators/environment-orchestrator"
			);
			const envOrchestrator = new EnvironmentOrchestrator(db);
			const environments = await envOrchestrator.list();

			let envId: string;
			if (environments.length === 0) {
				// No environments at all - create one
				const newEnv = await envOrchestrator.create();
				envId = newEnv.id;
			} else {
				// Use the first available environment (prefer "default" if it exists)
				const defaultEnv = environments.find((e) => e.id === "default");
				envId = defaultEnv ? defaultEnv.id : environments[0]!.id;
			}

			const workspace = await orchestrator.create(
				envId,
				state.workspaceType!,
				{
					path: state.path || undefined,
					branch: state.branch || undefined,
					name: state.name || undefined,
					defaultAgents: state.defaultAgents,
				},
			);

			setState((s) => ({
				...s,
				workspaceId: workspace.id,
				step: InitStep.COMPLETE,
			}));

			// Auto-exit after showing success message
			setTimeout(() => {
				exit();
			}, 2000);
		} catch (err) {
			setState((s) => ({
				...s,
				error: err instanceof Error ? err.message : "Unknown error",
				step: InitStep.SELECT_TYPE,
			}));
		}
	};

	React.useEffect(() => {
		if (state.step === InitStep.COMPLETE) {
			onComplete?.();
		}
	}, [state.step, onComplete]);

	if (state.step === InitStep.SELECT_TYPE) {
		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					🚀 Initialize Superset Workspace
				</Text>
				<Box marginTop={1}>
					<Text>Select workspace type:</Text>
				</Box>
				{state.error && (
					<Box marginTop={1}>
						<Text color="red">Error: {state.error}</Text>
					</Box>
				)}
				<Box marginTop={1}>
					<SelectInput
						items={[
							{ label: "Local (filesystem path)", value: WorkspaceType.LOCAL },
							{ label: "Cloud (git branch/ref)", value: WorkspaceType.CLOUD },
						]}
						onSelect={handleTypeSelect}
					/>
				</Box>
			</Box>
		);
	}

	if (state.step === InitStep.INPUT_PATH) {
		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					🚀 Initialize Local Workspace
				</Text>
				<Box marginTop={1}>
					<Text>Enter path to your project (supports ~):</Text>
				</Box>
				{state.error && (
					<Box marginTop={1}>
						<Text color="red">{state.error}</Text>
					</Box>
				)}
				<Box marginTop={1}>
					<Text color="green">&gt; </Text>
					<TextInput
						value={state.path}
						placeholder="~/my-project"
						onChange={(value) => setState((s) => ({ ...s, path: value }))}
						onSubmit={handlePathSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (state.step === InitStep.INPUT_BRANCH) {
		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					🚀 Initialize Cloud Workspace
				</Text>
				<Box marginTop={1}>
					<Text>Enter git branch or ref:</Text>
				</Box>
				{state.error && (
					<Box marginTop={1}>
						<Text color="red">{state.error}</Text>
					</Box>
				)}
				<Box marginTop={1}>
					<Text color="green">&gt; </Text>
					<TextInput
						value={state.branch}
						placeholder="main"
						onChange={(value) => setState((s) => ({ ...s, branch: value }))}
						onSubmit={handleBranchSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (state.step === InitStep.INPUT_NAME) {
		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					🚀 Name Your Workspace
				</Text>
				<Box marginTop={1}>
					<Text>Enter workspace name (optional, press Enter to skip):</Text>
				</Box>
				<Box marginTop={1}>
					<Text color="green">&gt; </Text>
					<TextInput
						value={state.name}
						placeholder="My Project"
						onChange={(value) => setState((s) => ({ ...s, name: value }))}
						onSubmit={handleNameSubmit}
					/>
				</Box>
			</Box>
		);
	}

	if (state.step === InitStep.SELECT_AGENTS) {
		const agentItems = [
			...Object.values(AgentType).map((type) => ({
				label: `${state.defaultAgents.includes(type) ? "✓" : "○"} ${type}`,
				value: type,
			})),
			{ label: "→ Done (save selection)", value: "done" },
			{ label: "→ Skip (no default agents)", value: "skip" },
		];

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					🚀 Select Default Agents
				</Text>
				<Box marginTop={1}>
					<Text>
						Choose which agents to start automatically (use arrow keys, Enter to
						toggle):
					</Text>
				</Box>
				{state.defaultAgents.length > 0 && (
					<Box marginTop={1}>
						<Text color="green">
							Selected: {state.defaultAgents.join(", ")}
						</Text>
					</Box>
				)}
				<Box marginTop={1}>
					<SelectInput items={agentItems} onSelect={handleAgentsSelect} />
				</Box>
			</Box>
		);
	}

	if (state.step === InitStep.CREATING) {
		return (
			<Box flexDirection="column">
				<Text>Creating workspace...</Text>
			</Box>
		);
	}

	if (state.step === InitStep.COMPLETE) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Workspace created successfully!</Text>
				<Box marginTop={1}>
					<Text dimColor>ID: {state.workspaceId}</Text>
					<Text dimColor>Name: {state.name || "(unnamed)"}</Text>
					<Text dimColor>Type: {state.workspaceType}</Text>
					{state.path && <Text dimColor>Path: {state.path}</Text>}
					{state.branch && <Text dimColor>Branch: {state.branch}</Text>}
					{state.defaultAgents.length > 0 && (
						<Text dimColor>
							Default agents: {state.defaultAgents.join(", ")}
						</Text>
					)}
				</Box>
				<Box marginTop={1}>
					<Text bold>Current workspace set!</Text>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						Run <Text bold>superset agent start</Text> to launch agents
					</Text>
					<Text dimColor>
						Run <Text bold>superset dashboard</Text> to view status
					</Text>
				</Box>
			</Box>
		);
	}

	return null;
}
