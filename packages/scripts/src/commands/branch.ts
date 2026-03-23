import { findProjectByPath } from "../lib/db.js";
import { openDeepLink } from "../lib/deep-link.js";
import { error, info } from "../lib/output.js";
import { resolveProjectPath } from "../lib/resolve.js";

export function branchCommand(args: string[]): void {
	const name = args[0];
	if (!name) {
		error("Usage: superset branch <name> [path]");
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
			`open?path=${encodeURIComponent(absPath)}&branch=${encodeURIComponent(name)}`,
		);
		info(`Opening ${absPath} with branch ${name} in Superset...`);
		return;
	}

	openDeepLink(`project/${project.id}/branch/${encodeURIComponent(name)}`);
	info(`Opening branch ${name} in ${project.name}...`);
}
