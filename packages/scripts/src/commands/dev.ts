import { findProjectByPath, findWorkspaceByBranch } from "../lib/db.js";
import { openDeepLink } from "../lib/deep-link.js";
import { error, info } from "../lib/output.js";
import { getCurrentBranch, resolveProjectPath } from "../lib/resolve.js";

export function devCommand(args: string[]): void {
	const port = args[0] ? Number.parseInt(args[0], 10) : undefined;
	if (port !== undefined && (Number.isNaN(port) || port < 1 || port > 65535)) {
		error(`Invalid port: ${args[0]}`);
		process.exit(1);
	}

	let absPath: string;
	try {
		absPath = resolveProjectPath();
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}

	const project = findProjectByPath(absPath);
	if (!project) {
		error("No Superset project found for this directory.");
		process.exit(1);
	}

	const branch = getCurrentBranch(absPath);
	const workspace = branch
		? findWorkspaceByBranch(project.id, branch)
		: undefined;

	const portParam = port ? `?port=${port}` : "";

	if (workspace) {
		openDeepLink(`project/${project.id}/dev/${workspace.id}${portParam}`);
	} else {
		openDeepLink(`project/${project.id}/dev${portParam}`);
	}

	info(`Opening dev server${port ? ` on port ${port}` : ""} in Superset...`);
}
