import { findWorkspaceByBranch, resolveProject } from "../lib/db.js";
import { openDeepLink } from "../lib/deep-link.js";
import { error, info } from "../lib/output.js";
import { getCurrentBranch, resolveProjectPath } from "../lib/resolve.js";

export function prCommand(): void {
	let absPath: string;
	try {
		absPath = resolveProjectPath();
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}

	const project = resolveProject(absPath);
	if (!project) {
		error("No Superset project found for this directory.");
		process.exit(1);
	}

	const branch = getCurrentBranch(absPath);
	if (!branch) {
		error("Could not determine current branch.");
		process.exit(1);
	}

	const workspace = findWorkspaceByBranch(project.id, branch);

	if (workspace) {
		openDeepLink(`project/${project.id}/pr/${workspace.id}`);
	} else {
		openDeepLink(
			`project/${project.id}/pr?branch=${encodeURIComponent(branch)}`,
		);
	}

	info(`Opening PR for ${branch} in Superset...`);
}
