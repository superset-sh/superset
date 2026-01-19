import { getDefaultBranch, getGitRoot } from "@superset/git-utils";
import { eq } from "drizzle-orm";
import { Box, Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Spinner } from "../components/Spinner";
import { getLocalDb, projects } from "../lib/local-db";

interface ProjectInitProps {
	path?: string;
	onComplete?: () => void;
}

interface ProjectInfo {
	name: string;
	path: string;
	defaultBranch: string;
	isNew: boolean;
	color: string;
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

/**
 * Initialize a project from a git repository.
 * Creates a project record if it doesn't exist, or uses existing one.
 */
export function ProjectInit({ path, onComplete }: ProjectInitProps) {
	const { exit } = useApp();
	const [status, setStatus] = useState<"loading" | "success" | "error">(
		"loading",
	);
	const [message, setMessage] = useState("");
	const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);

	useEffect(() => {
		async function init() {
			try {
				const targetPath = path || process.cwd();

				// Find git root
				const gitRoot = await getGitRoot(targetPath);

				// Get project name from directory
				const name = gitRoot.split("/").pop() || "project";

				// Get default branch
				const defaultBranch = await getDefaultBranch(gitRoot);

				// Check if project already exists
				const db = getLocalDb();
				const existingProject = db
					.select()
					.from(projects)
					.where(eq(projects.mainRepoPath, gitRoot))
					.get();

				if (existingProject) {
					// Project exists, just update lastOpenedAt
					db.update(projects)
						.set({ lastOpenedAt: Date.now() })
						.where(eq(projects.id, existingProject.id))
						.run();

					setProjectInfo({
						name: existingProject.name,
						path: gitRoot,
						defaultBranch: existingProject.defaultBranch || defaultBranch,
						isNew: false,
						color: existingProject.color || "#4ECDC4",
					});
					setStatus("success");
				} else {
					// Create new project
					const projectId = uuidv4();
					const colors = [
						"#FF6B6B",
						"#4ECDC4",
						"#45B7D1",
						"#96CEB4",
						"#FFEAA7",
						"#DDA0DD",
					];
					const color =
						colors[Math.floor(Math.random() * colors.length)] || "#4ECDC4";

					db.insert(projects)
						.values({
							id: projectId,
							mainRepoPath: gitRoot,
							name,
							color,
							defaultBranch,
							lastOpenedAt: Date.now(),
							createdAt: Date.now(),
						})
						.run();

					setProjectInfo({
						name,
						path: gitRoot,
						defaultBranch,
						isNew: true,
						color,
					});
					setStatus("success");
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				setMessage(errorMessage);
				setStatus("error");
			}
		}

		init();
	}, [path]);

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
		return (
			<Box flexDirection="column" gap={1}>
				<Logo />
				<Spinner text="Initializing project..." />
			</Box>
		);
	}

	if (status === "error") {
		return (
			<Box flexDirection="column" gap={1}>
				<Logo />
				<Box borderStyle="round" borderColor="red" paddingX={2} paddingY={1}>
					<Text color="red">✗ {message}</Text>
				</Box>
				<Text color="gray">
					Make sure you're in a git repository or provide a valid path.
				</Text>
			</Box>
		);
	}

	if (!projectInfo) {
		return null;
	}

	return (
		<Box flexDirection="column" gap={1}>
			<Logo />

			{/* Status Message */}
			<Text color="green" bold>
				{projectInfo.isNew ? "✓ Project initialized!" : "✓ Project ready!"}
			</Text>

			{/* Project Card */}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor={projectInfo.isNew ? "green" : "cyan"}
				paddingX={2}
				paddingY={1}
			>
				<Box gap={2}>
					<Text color="gray">Name:</Text>
					<Text color="cyan" bold>
						{projectInfo.name}
					</Text>
					{!projectInfo.isNew && (
						<Text color="gray" dimColor>
							(already existed)
						</Text>
					)}
				</Box>
				<Box gap={2}>
					<Text color="gray">Path:</Text>
					<Text dimColor>{projectInfo.path}</Text>
				</Box>
				<Box gap={2}>
					<Text color="gray">Branch:</Text>
					<Text color="green">⎇ {projectInfo.defaultBranch}</Text>
				</Box>
			</Box>

			{/* Next Steps */}
			<Box flexDirection="column" marginTop={1}>
				<Text bold color="gray">
					Next Steps
				</Text>
				<Box flexDirection="column">
					<Text>
						<Text color="cyan">superset status</Text>
						<Text color="gray"> → View project status</Text>
					</Text>
					<Text>
						<Text color="cyan">superset worktree create</Text>
						<Text color="gray"> → Create a new worktree</Text>
					</Text>
					<Text>
						<Text color="cyan">superset agent start</Text>
						<Text color="gray"> → Start an AI agent</Text>
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
