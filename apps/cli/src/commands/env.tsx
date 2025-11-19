import { Box, Text } from "ink";
import React from "react";
import Table from "../components/Table";
import { getDb } from "../lib/db";
import { EnvironmentOrchestrator } from "../lib/orchestrators/environment-orchestrator";

interface EnvListProps {
	onComplete?: () => void;
}

export function EnvList({ onComplete }: EnvListProps) {
	const [environments, setEnvironments] = React.useState<any[]>([]);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadEnvironments = async () => {
			try {
				const db = getDb();
				const orchestrator = new EnvironmentOrchestrator(db);
				const envs = await orchestrator.list();

				if (envs.length === 0) {
					setEnvironments([]);
				} else {
					setEnvironments(envs);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadEnvironments();
	}, [onComplete]);

	if (loading) {
		return <Text>Loading environments...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (environments.length === 0) {
		return (
			<Text dimColor>
				No environments found. Create one with: superset env create
			</Text>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>Environments</Text>
			<Table data={environments} />
		</Box>
	);
}

interface EnvGetProps {
	id: string;
	onComplete?: () => void;
}

export function EnvGet({ id, onComplete }: EnvGetProps) {
	const [environment, setEnvironment] = React.useState<any | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadEnvironment = async () => {
			try {
				const db = getDb();
				const orchestrator = new EnvironmentOrchestrator(db);
				const env = await orchestrator.get(id);
				setEnvironment(env);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadEnvironment();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Loading environment...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text bold>Environment Details</Text>
			<Table data={[environment]} />
		</Box>
	);
}

interface EnvCreateProps {
	onComplete?: () => void;
}

export function EnvCreate({ onComplete }: EnvCreateProps) {
	const [environment, setEnvironment] = React.useState<any | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const createEnvironment = async () => {
			try {
				const db = getDb();
				const orchestrator = new EnvironmentOrchestrator(db);
				const env = await orchestrator.create();
				setEnvironment(env);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		createEnvironment();
	}, [onComplete]);

	if (loading) {
		return <Text>Creating environment...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Environment created successfully</Text>
			<Table data={[environment]} />
		</Box>
	);
}

interface EnvDeleteProps {
	id: string;
	onComplete?: () => void;
}

export function EnvDelete({ id, onComplete }: EnvDeleteProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);

	React.useEffect(() => {
		const deleteEnvironment = async () => {
			try {
				const db = getDb();
				const orchestrator = new EnvironmentOrchestrator(db);
				await orchestrator.delete(id);
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		deleteEnvironment();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Deleting environment...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Environment deleted successfully</Text>
				<Text dimColor>ID: {id}</Text>
				<Text dimColor>
					Note: All associated workspaces, processes, and changes have been
					removed.
				</Text>
			</Box>
		);
	}

	return null;
}
