import { getAllProjects } from "../lib/db.js";
import {
	bold,
	dim,
	formatRelativeTime,
	info,
	printTable,
} from "../lib/output.js";
import { tildeContract } from "../lib/resolve.js";

export function listCommand(): void {
	const projects = getAllProjects();

	if (projects.length === 0) {
		info("No projects found. Open a project in Superset first.");
		return;
	}

	console.log(bold("Projects:"));
	printTable(
		projects.map((p) => [
			p.name,
			dim(tildeContract(p.main_repo_path)),
			dim(formatRelativeTime(p.last_opened_at)),
		]),
	);
}
