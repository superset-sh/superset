import { eq } from "drizzle-orm";
import type { HostDb } from "../db";
import { workspaces } from "../db/schema";

export class ChatWorkspaceNotFoundError extends Error {
	constructor(readonly workspaceId: string) {
		super(`Workspace not found: ${workspaceId}`);
		this.name = "ChatWorkspaceNotFoundError";
	}
}

export function createResolveCwd(db: HostDb): (workspaceId: string) => string {
	return (workspaceId: string): string => {
		const workspace = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
		if (!workspace) throw new ChatWorkspaceNotFoundError(workspaceId);
		return workspace.worktreePath;
	};
}
