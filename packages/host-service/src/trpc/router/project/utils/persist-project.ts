import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ResolvedRepo } from "./resolve-repo";

export function persistLocalProject(
	ctx: HostServiceContext,
	projectId: string,
	resolved: ResolvedRepo,
): void {
	const repoFields = {
		repoPath: resolved.repoPath,
		repoProvider: resolved.parsed ? ("github" as const) : null,
		repoOwner: resolved.parsed?.owner ?? null,
		repoName: resolved.parsed?.name ?? null,
		repoUrl: resolved.parsed?.url ?? null,
		remoteName: resolved.remoteName,
	};
	ctx.db
		.insert(projects)
		.values({ id: projectId, ...repoFields })
		.onConflictDoUpdate({ target: projects.id, set: repoFields })
		.run();
}
