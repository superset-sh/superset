import { Box, Text } from "ink";
import React from "react";
import Table from "../components/Table";
import { getDb } from "../lib/db";
import { ChangeOrchestrator } from "../lib/orchestrators/change-orchestrator";

interface ChangeListProps {
	workspaceId: string;
	onComplete?: () => void;
}

export function ChangeList({ workspaceId, onComplete }: ChangeListProps) {
	const [changes, setChanges] = React.useState<any[]>([]);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadChanges = async () => {
			try {
				const db = getDb();
				const orchestrator = new ChangeOrchestrator(db);
				const chgs = await orchestrator.list(workspaceId);

				if (chgs.length === 0) {
					setChanges([]);
				} else {
					// Format dates for display
					const formatted = chgs.map((c) => ({
						...c,
						createdAt: new Date(c.createdAt).toLocaleString(),
					}));
					setChanges(formatted);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadChanges();
	}, [workspaceId, onComplete]);

	if (loading) {
		return <Text>Loading changes...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (changes.length === 0) {
		return (
			<Text dimColor>
				No changes found for workspace {workspaceId}. Create one with: superset
				change create {workspaceId} &lt;summary&gt;
			</Text>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>Changes (Workspace: {workspaceId})</Text>
			<Table data={changes} />
		</Box>
	);
}

interface ChangeCreateProps {
	workspaceId: string;
	summary: string;
	onComplete?: () => void;
}

export function ChangeCreate({
	workspaceId,
	summary,
	onComplete,
}: ChangeCreateProps) {
	const [change, setChange] = React.useState<any | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const createChange = async () => {
			try {
				const db = getDb();
				const orchestrator = new ChangeOrchestrator(db);
				const chg = await orchestrator.create({
					workspaceId,
					summary,
					createdAt: new Date(),
				});

				// Format date
				const formatted = {
					...chg,
					createdAt: new Date(chg.createdAt).toLocaleString(),
				};

				setChange(formatted);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		createChange();
	}, [workspaceId, summary, onComplete]);

	if (loading) {
		return <Text>Creating change...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Change created successfully</Text>
			<Table data={[change]} />
		</Box>
	);
}

interface ChangeDeleteProps {
	id: string;
	onComplete?: () => void;
}

export function ChangeDelete({ id, onComplete }: ChangeDeleteProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);

	React.useEffect(() => {
		const deleteChange = async () => {
			try {
				const db = getDb();
				const orchestrator = new ChangeOrchestrator(db);
				await orchestrator.delete(id);
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		deleteChange();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Deleting change...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Change deleted successfully</Text>
				<Text dimColor>ID: {id}</Text>
				<Text dimColor>Note: All associated file diffs have been removed.</Text>
			</Box>
		);
	}

	return null;
}
