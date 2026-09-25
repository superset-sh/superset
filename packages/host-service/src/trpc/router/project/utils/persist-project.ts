import { basename } from "node:path";
import { projects } from "../../../../db/schema";
import {
	emitProjectChanged,
	getLocalProject,
} from "../../../../projects/local-project-store";
import type { HostServiceContext } from "../../../../types";
import type { ResolvedRepo } from "./resolve-repo";

export interface ProjectIdentityFields {
	name?: string;
}

export function persistLocalProject(
	ctx: HostServiceContext,
	projectId: string,
	resolved: ResolvedRepo,
	identity?: ProjectIdentityFields,
): void {
	const existing = getLocalProject(ctx.db, projectId);
	const repoFields = {
		repoPath: resolved.repoPath,
		repoProvider: resolved.parsed ? ("github" as const) : null,
		repoOwner: resolved.parsed?.owner ?? null,
		repoName: resolved.parsed?.name ?? null,
		repoUrl: resolved.parsed?.url ?? null,
		remoteName: resolved.remoteName,
	};
	const identityFields = {
		name: identity?.name ?? existing?.name ?? basename(resolved.repoPath),
		updatedAt: Date.now(),
	};
	ctx.db
		.insert(projects)
		.values({ id: projectId, ...repoFields, ...identityFields })
		.onConflictDoUpdate({
			target: projects.id,
			set: { ...repoFields, ...identityFields },
		})
		.run();
	const row = getLocalProject(ctx.db, projectId);
	if (row) {
		emitProjectChanged(ctx.eventBus, existing ? "updated" : "created", row);
	}
}
