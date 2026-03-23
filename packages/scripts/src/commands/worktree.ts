import { findProjectByPath } from "../lib/db.js";
import { openDeepLink } from "../lib/deep-link.js";
import { error, info } from "../lib/output.js";
import { resolveProjectPath } from "../lib/resolve.js";

export function worktreeCommand(args: string[]): void {
	const name = args[0];
	if (!name) {
		error("Usage: superset worktree <name> [path]");
		process.exit(1);
	}

	let absPath: string;
	try {
		absPath = resolveProjectPath(args[1]);
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}

	const project = findProjectByPath(absPath);
	if (!project) {
		openDeepLink(
			`open?path=${encodeURIComponent(absPath)}&worktree=${encodeURIComponent(name)}`,
		);
		info(`Opening ${absPath} with worktree ${name} in Superset...`);
		return;
	}

	openDeepLink(`project/${project.id}/worktree/${encodeURIComponent(name)}`);
	info(`Opening worktree ${name} in ${project.name}...`);
}
