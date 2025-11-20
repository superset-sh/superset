import { Box, Text } from "ink";
import React from "react";
import Table from "../components/Table";
import { getDb } from "../lib/db";
import { WorkspaceOrchestrator } from "../lib/orchestrators/workspace-orchestrator";
import type { WorkspaceType } from "../types/workspace";

interface WorkspaceListProps {
	environmentId?: string;
	onComplete?: () => void;
}

export function WorkspaceList({
	environmentId,
	onComplete,
}: WorkspaceListProps) {
	const [workspaces, setWorkspaces] = React.useState<any[]>([]);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadWorkspaces = async () => {
			try {
				const db = getDb();
				const orchestrator = new WorkspaceOrchestrator(db);
				const ws = await orchestrator.list(environmentId);

				if (ws.length === 0) {
					setWorkspaces([]);
				} else {
					setWorkspaces(ws);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadWorkspaces();
	}, [environmentId, onComplete]);

	if (loading) {
		return <Text>Loading workspaces...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (workspaces.length === 0) {
		const message = environmentId
			? `No workspaces found for environment ${environmentId}`
			: "No workspaces found";
		return (
			<Text dimColor>
				{message}. Create one with: superset workspace create &lt;env-id&gt;
				&lt;type&gt;
			</Text>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>
				Workspaces{environmentId ? ` (Environment: ${environmentId})` : ""}
			</Text>
			<Table data={workspaces} />
		</Box>
	);
}

interface WorkspaceGetProps {
	id: string;
	onComplete?: () => void;
}

export function WorkspaceGet({ id, onComplete }: WorkspaceGetProps) {
	const [workspace, setWorkspace] = React.useState<any | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadWorkspace = async () => {
			try {
				const db = getDb();
				const orchestrator = new WorkspaceOrchestrator(db);
				const ws = await orchestrator.get(id);
				setWorkspace(ws);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadWorkspace();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Loading workspace...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text bold>Workspace Details</Text>
			<Table data={[workspace]} />
		</Box>
	);
}

interface WorkspaceCreateProps {
	environmentId: string;
	type: WorkspaceType;
	path?: string;
	onComplete?: () => void;
}

export function WorkspaceCreate({
	environmentId,
	type,
	path,
	onComplete,
}: WorkspaceCreateProps) {
	const [workspace, setWorkspace] = React.useState<any | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const createWorkspace = async () => {
			try {
				const db = getDb();
				const orchestrator = new WorkspaceOrchestrator(db);
				const ws = await orchestrator.create(environmentId, type, { path });
				setWorkspace(ws);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		createWorkspace();
	}, [environmentId, type, path, onComplete]);

	if (loading) {
		return <Text>Creating workspace...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Workspace created successfully</Text>
			<Table data={[workspace]} />
			<Text dimColor>
				Current workspace set to{" "}
				<Text bold>{workspace?.name || workspace?.id}</Text>.
			</Text>
			<Text dimColor>
				Run <Text bold>superset agent start</Text> to launch agents.
			</Text>
		</Box>
	);
}

interface WorkspaceDeleteProps {
	id: string;
	onComplete?: () => void;
}

export function WorkspaceDelete({ id, onComplete }: WorkspaceDeleteProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);

	React.useEffect(() => {
		const deleteWorkspace = async () => {
			try {
				const db = getDb();
				const orchestrator = new WorkspaceOrchestrator(db);
				await orchestrator.delete(id);
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		deleteWorkspace();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Deleting workspace...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Workspace deleted successfully</Text>
				<Text dimColor>ID: {id}</Text>
				<Text dimColor>
					Note: All associated processes and changes have been removed.
				</Text>
			</Box>
		);
	}

	return null;
}

interface WorkspaceUseProps {
	id: string;
	onComplete?: () => void;
}

export function WorkspaceUse({ id, onComplete }: WorkspaceUseProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [workspace, setWorkspace] = React.useState<any | null>(null);

	React.useEffect(() => {
		const useWorkspace = async () => {
			try {
				const db = getDb();
				const orchestrator = new WorkspaceOrchestrator(db);

				// Get the workspace to verify it exists
				const ws = await orchestrator.get(id);

				// Update lastUsedAt and set as current
				await orchestrator.use(id);

				setWorkspace(ws);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		useWorkspace();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Setting current workspace...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text color="green">
				✓ Current workspace set to: {workspace?.name || id}
			</Text>
			<Text dimColor>
				Run <Text bold>superset agent start</Text> to launch agents in this
				workspace.
			</Text>
		</Box>
	);
}
