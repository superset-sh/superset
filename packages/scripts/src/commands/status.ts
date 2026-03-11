import { findProjectByPath, getWorkspacesForProject } from "../lib/db.js";
import { bold, cyan, dim, error, info } from "../lib/output.js";
import {
	getCurrentBranch,
	resolveProjectPath,
	tildeContract,
} from "../lib/resolve.js";

export function statusCommand(): void {
	let absPath: string;
	try {
		absPath = resolveProjectPath();
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}

	const project = findProjectByPath(absPath);
	if (!project) {
		info("No Superset project found for this directory.");
		return;
	}

	const branch = getCurrentBranch(absPath);
	const rows = getWorkspacesForProject(project.id);
	const worktreeCount = rows.filter((r) => r.ws_type === "worktree").length;
	const branchCount = rows.filter((r) => r.ws_type === "branch").length;

	console.log(`${bold("Project:")}    ${project.name}`);
	console.log(
		`${bold("Path:")}       ${tildeContract(project.main_repo_path)}`,
	);
	if (branch) {
		console.log(`${bold("Branch:")}     ${branch}`);
	}

	const parts: string[] = [];
	if (worktreeCount > 0) parts.push(`${worktreeCount} worktree`);
	if (branchCount > 0) parts.push(`${branchCount} branch`);
	console.log(
		`${bold("Workspaces:")} ${rows.length}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`,
	);

	for (const row of rows) {
		const indicator = row.ws_type === "worktree" ? cyan("●") : dim("○");
		const wtPath = row.wt_path ? dim(`  ${tildeContract(row.wt_path)}`) : "";
		console.log(`  ${indicator} ${row.ws_name}  ${dim(row.ws_type)}${wtPath}`);
	}
}
