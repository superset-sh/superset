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
		repoProvider: "github" as const,
		repoOwner: resolved.parsed.owner,
		repoName: resolved.parsed.name,
		repoUrl: resolved.parsed.url,
		remoteName: resolved.remoteName,
	};
	ctx.db
		.insert(projects)
		.values({ id: projectId, ...repoFields })
		.onConflictDoUpdate({ target: projects.id, set: repoFields })
		.run();
}
