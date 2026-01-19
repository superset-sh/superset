import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { join } from "node:path";
import { homedir } from "node:os";
import {
	createWorktree as gitCreateWorktree,
	removeWorktree as gitRemoveWorktree,
	generateBranchName,
	listBranches,
	getDefaultBranch,
} from "@superset/git-utils";
import { getLocalDb, projects, worktrees, workspaces } from "../lib/local-db";
import { Spinner } from "../components/Spinner";

interface WorktreeCreateProps {
	name?: string;
	baseBranch?: string;
	projectId?: string;
	onComplete?: () => void;
}

/**
 * Create a new worktree workspace.
 */
export function WorktreeCreate({
	name,
	baseBranch,
	projectId,
	onComplete,
}: WorktreeCreateProps) {
	const { exit } = useApp();
	const [status, setStatus] = useState<"loading" | "success" | "error">(
		"loading",
	);
	const [message, setMessage] = useState("");
	const [createdBranch, setCreatedBranch] = useState("");
	const [createdPath, setCreatedPath] = useState("");
	const [baseUsed, setBaseUsed] = useState("");

	useEffect(() => {
		async function create() {
			try {
				const db = getLocalDb();

				// Get the project - either by ID or most recently opened
				let project;
				if (projectId) {
					project = db
						.select()
						.from(projects)
						.where(eq(projects.id, projectId))
						.get();
				} else {
					project = db
						.select()
						.from(projects)
						.orderBy(desc(projects.lastOpenedAt))
						.limit(1)
						.get();
				}

				if (!project) {
					throw new Error(
						"No project found. Run 'superset init' first to initialize a project.",
					);
				}

				// Get existing branches to avoid naming conflicts
				const { local } = await listBranches(project.mainRepoPath);

				// Generate or use provided branch name
				const branchName = name || generateBranchName(local);

				// Determine base branch
				const defaultBranch =
					baseBranch ||
					project.defaultBranch ||
					(await getDefaultBranch(project.mainRepoPath));

				// Worktree path: ~/.superset/worktrees/{project-name}/{branch-name}
				const worktreeDir = join(
					homedir(),
					".superset",
					"worktrees",
					project.name,
					branchName,
				);

				// Create the git worktree
				await gitCreateWorktree({
					mainRepoPath: project.mainRepoPath,
					branch: branchName,
					worktreePath: worktreeDir,
					startPoint: `origin/${defaultBranch}`,
				});

				// Insert worktree record
				const worktreeId = uuidv4();
				db.insert(worktrees)
					.values({
						id: worktreeId,
						projectId: project.id,
						path: worktreeDir,
						branch: branchName,
						baseBranch: defaultBranch,
						createdAt: Date.now(),
					})
					.run();

				// Insert workspace record
				const workspaceId = uuidv4();
				const existingWorkspaces = db
					.select()
					.from(workspaces)
					.where(eq(workspaces.projectId, project.id))
					.all();

				db.insert(workspaces)
					.values({
						id: workspaceId,
						projectId: project.id,
						worktreeId,
						type: "worktree",
						branch: branchName,
						name: branchName,
						tabOrder: existingWorkspaces.length,
						createdAt: Date.now(),
						updatedAt: Date.now(),
						lastOpenedAt: Date.now(),
					})
					.run();

				setCreatedBranch(branchName);
				setCreatedPath(worktreeDir);
				setBaseUsed(defaultBranch);
				setMessage(`Worktree created successfully`);
				setStatus("success");
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				setMessage(errorMessage);
				setStatus("error");
			}
		}

		create();
	}, [name, baseBranch, projectId]);

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
		return <Spinner text="Creating worktree..." />;
	}

	if (status === "error") {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="red">✗ Failed to create worktree</Text>
				<Text color="gray">{message}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Text color="green" bold>
				✓ {message}
			</Text>
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="green"
				paddingX={2}
				paddingY={1}
			>
				<Box gap={2}>
					<Text color="gray">Branch:</Text>
					<Text color="cyan" bold>
						{createdBranch}
					</Text>
				</Box>
				<Box gap={2}>
					<Text color="gray">Base:</Text>
					<Text color="green">{baseUsed}</Text>
				</Box>
				<Box gap={2}>
					<Text color="gray">Path:</Text>
					<Text dimColor>{createdPath}</Text>
				</Box>
			</Box>
			<Text color="gray">
				Run <Text color="cyan">cd {createdPath}</Text> to start working
			</Text>
		</Box>
	);
}

interface WorktreeListProps {
	projectId?: string;
	onComplete?: () => void;
}

interface WorktreeItem {
	branch: string;
	path: string;
	baseBranch: string;
	createdAt: number;
}

function WorktreeCard({ item, index }: { item: WorktreeItem; index: number }) {
	const createdDate = new Date(item.createdAt).toLocaleDateString();

	return (
		<Box flexDirection="column">
			<Box gap={2}>
				<Text color="gray">{index + 1}.</Text>
				<Text color="cyan" bold>
					⎇ {item.branch}
				</Text>
				<Text color="gray">←</Text>
				<Text color="green">{item.baseBranch}</Text>
				<Text color="gray" dimColor>
					({createdDate})
				</Text>
			</Box>
			<Box paddingLeft={3}>
				<Text color="gray" dimColor>
					{item.path}
				</Text>
			</Box>
		</Box>
	);
}

/**
 * List all worktrees for a project.
 */
export function WorktreeList({ projectId, onComplete }: WorktreeListProps) {
	const { exit } = useApp();
	const [status, setStatus] = useState<"loading" | "success" | "error">(
		"loading",
	);
	const [message, setMessage] = useState("");
	const [projectName, setProjectName] = useState("");
	const [items, setItems] = useState<WorktreeItem[]>([]);

	useEffect(() => {
		async function list() {
			try {
				const db = getLocalDb();

				// Get the project
				let project;
				if (projectId) {
					project = db
						.select()
						.from(projects)
						.where(eq(projects.id, projectId))
						.get();
				} else {
					project = db
						.select()
						.from(projects)
						.orderBy(desc(projects.lastOpenedAt))
						.limit(1)
						.get();
				}

				if (!project) {
					throw new Error(
						"No project found. Run 'superset init' first to initialize a project.",
					);
				}

				setProjectName(project.name);

				// Get worktrees for this project
				const projectWorktrees = db
					.select()
					.from(worktrees)
					.where(eq(worktrees.projectId, project.id))
					.all();

				setItems(
					projectWorktrees.map((wt) => ({
						branch: wt.branch,
						path: wt.path,
						baseBranch: wt.baseBranch || "unknown",
						createdAt: wt.createdAt,
					})),
				);
				setStatus("success");
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				setMessage(errorMessage);
				setStatus("error");
			}
		}

		list();
	}, [projectId]);

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
		return <Spinner text="Loading worktrees..." />;
	}

	if (status === "error") {
		return <Text color="red">✗ Error: {message}</Text>;
	}

	if (items.length === 0) {
		return (
			<Box flexDirection="column" gap={1}>
				<Box
					borderStyle="round"
					borderColor="yellow"
					paddingX={2}
					paddingY={1}
				>
					<Text color="yellow">
						⚠ No worktrees found for <Text bold>{projectName}</Text>
					</Text>
				</Box>
				<Text color="gray">
					Create one with: <Text color="cyan">superset worktree create</Text>
				</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			{/* Header */}
			<Box gap={2}>
				<Text color="magenta" bold>
					⊕ Worktrees
				</Text>
				<Text color="gray">—</Text>
				<Text color="cyan" bold>
					{projectName}
				</Text>
				<Text color="gray">({items.length})</Text>
			</Box>

			{/* Worktree List */}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor="gray"
				paddingX={2}
				paddingY={1}
				gap={1}
			>
				{items.map((item, index) => (
					<WorktreeCard key={item.branch} item={item} index={index} />
				))}
			</Box>

			{/* Footer hint */}
			<Box gap={2}>
				<Text color="gray">
					<Text color="cyan">superset worktree create</Text> → New worktree
				</Text>
				<Text color="gray">│</Text>
				<Text color="gray">
					<Text color="cyan">superset worktree delete {"<branch>"}</Text> →
					Remove
				</Text>
			</Box>
		</Box>
	);
}

interface WorktreeDeleteProps {
	id: string;
	onComplete?: () => void;
}

/**
 * Delete a worktree by ID or branch name.
 */
export function WorktreeDelete({ id, onComplete }: WorktreeDeleteProps) {
	const { exit } = useApp();
	const [status, setStatus] = useState<"loading" | "success" | "error">(
		"loading",
	);
	const [message, setMessage] = useState("");
	const [deletedBranch, setDeletedBranch] = useState("");

	useEffect(() => {
		async function del() {
			try {
				const db = getLocalDb();

				// Find the worktree by ID or branch name
				let worktree = db
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, id))
					.get();

				if (!worktree) {
					// Try by branch name
					worktree = db
						.select()
						.from(worktrees)
						.where(eq(worktrees.branch, id))
						.get();
				}

				if (!worktree) {
					throw new Error(`Worktree not found: ${id}`);
				}

				// Get the project for the worktree path
				const project = db
					.select()
					.from(projects)
					.where(eq(projects.id, worktree.projectId))
					.get();

				if (!project) {
					throw new Error("Project not found for worktree");
				}

				setDeletedBranch(worktree.branch);

				// Remove git worktree from disk
				await gitRemoveWorktree({
					mainRepoPath: project.mainRepoPath,
					worktreePath: worktree.path,
				});

				// Delete workspace record (cascade will handle worktree via FK)
				db.delete(workspaces)
					.where(eq(workspaces.worktreeId, worktree.id))
					.run();

				// Delete worktree record
				db.delete(worktrees).where(eq(worktrees.id, worktree.id)).run();

				setMessage("Worktree deleted successfully");
				setStatus("success");
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				setMessage(errorMessage);
				setStatus("error");
			}
		}

		del();
	}, [id]);

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
		return <Spinner text={`Deleting worktree "${id}"...`} />;
	}

	if (status === "error") {
		return (
			<Box flexDirection="column" gap={1}>
				<Text color="red">✗ Failed to delete worktree</Text>
				<Text color="gray">{message}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Text color="green" bold>
				✓ {message}
			</Text>
			<Text color="gray">
				Removed branch: <Text color="cyan">{deletedBranch}</Text>
			</Text>
		</Box>
	);
}
