import { findProjectByPath } from "../lib/db.js";
import { openDeepLink } from "../lib/deep-link.js";
import { error, info } from "../lib/output.js";
import { resolveProjectPath } from "../lib/resolve.js";

export function openCommand(args: string[]): void {
	let absPath: string;
	try {
		absPath = resolveProjectPath(args[0]);
	} catch (e) {
		error((e as Error).message);
		process.exit(1);
	}

	const project = findProjectByPath(absPath);

	if (project) {
		openDeepLink(`project/${project.id}`);
		info(`Opening ${project.name} in Superset...`);
	} else {
		openDeepLink(`open?path=${encodeURIComponent(absPath)}`);
		info(`Opening ${absPath} in Superset...`);
	}
}
