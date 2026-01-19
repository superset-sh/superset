import { getCurrentBranch, getStatusNoLock } from "@superset/git-utils";
import { desc, eq } from "drizzle-orm";
import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { Spinner } from "../components/Spinner";
import { getLocalDb, projects, worktrees } from "../lib/local-db";

interface StatusProps {
	onComplete?: () => void;
}

interface ProjectStatus {
	name: string;
	path: string;
	currentBranch: string | null;
	worktreeCount: number;
	gitStatus: {
		modified: number;
		staged: number;
		untracked: number;
	};
}

const LOGO_LINES = [
	" ╔═╗╦ ╦╔═╗╔═╗╦═╗╔═╗╔═╗╔╦╗",
	" ╚═╗║ ║╠═╝║╣ ╠╦╝╚═╗║╣  ║ ",
	" ╚═╝╚═╝╩  ╚═╝╩╚═╚═╝╚═╝ ╩ ",
];

function Logo() {
	return (
		<Box flexDirection="column">
			{LOGO_LINES.map((line) => (
				<Text key={line} color="magenta" bold>
					{line}
				</Text>
			))}
		</Box>
	);
}

function Badge({
	label,
	value,
	color,
}: {
	label: string;
	value: string | number;
	color: string;
}) {
	return (
		<Box>
			<Text color="gray">{label} </Text>
			<Text color={color} bold>
				{value}
			</Text>
		</Box>
	);
}

function StatusBadge({ status }: { status: "clean" | "dirty" }) {
	if (status === "clean") {
		return (
			<Text color="green" bold>
				✓ Clean
			</Text>
		);
	}
	return (
		<Text color="yellow" bold>
			● Changes
		</Text>
	);
}

/**
 * Show current project and workspace status.
 */
export function Status({ onComplete }: StatusProps) {
	const { exit } = useApp();
	const [status, setStatus] = useState<"loading" | "success" | "error">(
		"loading",
	);
	const [message, setMessage] = useState("");
	const [projectStatus, setProjectStatus] = useState<ProjectStatus | null>(
		null,
	);

	useEffect(() => {
		async function getStatus() {
			try {
				const db = getLocalDb();

				// Get the most recently opened project
				const project = db
					.select()
					.from(projects)
					.orderBy(desc(projects.lastOpenedAt))
					.limit(1)
					.get();

				if (!project) {
					setMessage("No projects found. Run 'superset init' to get started.");
					setStatus("success");
					return;
				}

				// Get worktree count
				const projectWorktrees = db
					.select()
					.from(worktrees)
					.where(eq(worktrees.projectId, project.id))
					.all();

				// Get current branch
				const currentBranch = await getCurrentBranch(project.mainRepoPath);

				// Get git status
				const gitStatusResult = await getStatusNoLock(project.mainRepoPath);

				setProjectStatus({
					name: project.name,
					path: project.mainRepoPath,
					currentBranch,
					worktreeCount: projectWorktrees.length,
					gitStatus: {
						modified: gitStatusResult.modified.length,
						staged: gitStatusResult.staged.length,
						untracked: gitStatusResult.not_added.length,
					},
				});
				setStatus("success");
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				setMessage(errorMessage);
				setStatus("error");
			}
		}

		getStatus();
	}, []);

	useEffect(() => {
		if (status !== "loading") {
			const timeout = setTimeout(() => {
				onComplete?.();
				exit();
			}, 100);
			return () => clearTimeout(timeout);
		}
	}, [status, exit, onComplete]);

	if (status === "loading") {
		return <Spinner text="Loading status..." />;
	}

	if (status === "error") {
		return (
			<Box flexDirection="column" gap={1}>
				<Logo />
				<Text color="red">✗ Error: {message}</Text>
			</Box>
		);
	}

	if (!projectStatus) {
		return (
			<Box flexDirection="column" gap={1}>
				<Logo />
				<Box borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
					<Text color="yellow">
						⚠ No projects found. Run <Text bold>superset init</Text> to get
						started.
					</Text>
				</Box>
			</Box>
		);
	}

	const { gitStatus } = projectStatus;
	const hasChanges =
		gitStatus.modified > 0 || gitStatus.staged > 0 || gitStatus.untracked > 0;

	return (
		<Box flexDirection="column" gap={1}>
			<Logo />

			{/* Project Info Card */}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="cyan"
				paddingX={2}
				paddingY={1}
			>
				<Box justifyContent="space-between">
					<Text bold color="cyan">
						{projectStatus.name}
					</Text>
					<StatusBadge status={hasChanges ? "dirty" : "clean"} />
				</Box>
				<Text color="gray" dimColor>
					{projectStatus.path}
				</Text>
			</Box>

			{/* Stats Row */}
			<Box gap={4} paddingX={1}>
				<Badge
					label="⎇"
					value={projectStatus.currentBranch || "detached"}
					color="green"
				/>
				<Badge
					label="⊕"
					value={`${projectStatus.worktreeCount} worktrees`}
					color="blue"
				/>
			</Box>

			{/* Git Status */}
			{hasChanges && (
				<Box flexDirection="column" paddingX={1}>
					<Text bold color="white">
						Changes
					</Text>
					<Box gap={3}>
						{gitStatus.staged > 0 && (
							<Text color="green">● {gitStatus.staged} staged</Text>
						)}
						{gitStatus.modified > 0 && (
							<Text color="yellow">● {gitStatus.modified} modified</Text>
						)}
						{gitStatus.untracked > 0 && (
							<Text color="red">● {gitStatus.untracked} untracked</Text>
						)}
					</Box>
				</Box>
			)}

			{/* Quick Commands */}
			<Box flexDirection="column" paddingX={1} marginTop={1}>
				<Text bold color="gray">
					Quick Commands
				</Text>
				<Box flexDirection="column">
					<Text>
						<Text color="cyan">superset worktree create</Text>
						<Text color="gray"> → New worktree</Text>
					</Text>
					<Text>
						<Text color="cyan">superset worktree list</Text>
						<Text color="gray"> → List worktrees</Text>
					</Text>
					<Text>
						<Text color="cyan">superset agent start</Text>
						<Text color="gray"> → Start AI agent</Text>
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
