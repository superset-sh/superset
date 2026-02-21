import { db } from "@superset/db/client";
import { chatSessions, tasks, workspaces } from "@superset/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DataResolver } from "./data-resolver";

export function createNeonDataResolver(): DataResolver {
	return {
		async resolveCwd(sessionId: string): Promise<string> {
			try {
				const session = await db.query.chatSessions.findFirst({
					where: eq(chatSessions.id, sessionId),
					columns: { workspaceId: true },
				});

				if (session?.workspaceId) {
					const workspace = await db.query.workspaces.findFirst({
						where: eq(workspaces.id, session.workspaceId),
						columns: { config: true },
					});

					if (workspace?.config && "path" in workspace.config) {
						return workspace.config.path as string;
					}
				}
			} catch (err) {
				console.warn(
					`[neon-data-resolver] Could not resolve workspace path for ${sessionId}:`,
					err,
				);
			}

			return process.env.HOME ?? "/";
		},

		async buildTaskMentionContext(slugs: string[]): Promise<string> {
			if (slugs.length === 0) return "";

			try {
				const rows = await db
					.select()
					.from(tasks)
					.where(and(inArray(tasks.slug, slugs), isNull(tasks.deletedAt)));

				if (rows.length === 0) return "";

				const parts = rows.map(
					(t) =>
						`<task slug="${t.slug}" title="${t.title}" status="${t.statusId}">${t.description ?? ""}</task>`,
				);

				return `\n\nThe user referenced the following tasks. Their details are provided below:\n\n${parts.join("\n\n")}`;
			} catch (error) {
				console.warn(
					"[neon-data-resolver] Failed to fetch task mentions:",
					error,
				);
				return "";
			}
		},
	};
}
