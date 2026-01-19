import { Text, useApp } from "ink";
import { useEffect, useState } from "react";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getGitRoot, getDefaultBranch } from "@superset/git-utils";
import { getLocalDb, projects, settings } from "../lib/local-db";
import { Spinner } from "../components/Spinner";

interface ProjectInitProps {
	path?: string;
	onComplete?: () => void;
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
	const [projectName, setProjectName] = useState("");

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
					// Project exists, just set it as active
					db.update(settings)
						.set({ lastActiveWorkspaceId: null }) // We'll handle workspace selection separately
						.where(eq(settings.id, 1))
						.run();

					setProjectName(existingProject.name);
					setMessage(`Project "${existingProject.name}" already initialized at ${gitRoot}`);
					setStatus("success");
				} else {
					// Create new project
					const projectId = uuidv4();
					const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD"];
					const color = colors[Math.floor(Math.random() * colors.length)];

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

					setProjectName(name);
					setMessage(`Initialized project "${name}" at ${gitRoot}`);
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
		return <Spinner text="Initializing project..." />;
	}

	if (status === "error") {
		return <Text color="red">Error: {message}</Text>;
	}

	return (
		<Text>
			<Text color="green">✓</Text> {message}
		</Text>
	);
}
