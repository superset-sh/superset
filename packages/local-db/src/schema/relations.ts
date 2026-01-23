import { relations } from "drizzle-orm";
import {
	cloudWorkspaceSessions,
	cloudWorkspaces,
	projects,
	workspaces,
	worktrees,
} from "./schema";

export const projectsRelations = relations(projects, ({ many }) => ({
	worktrees: many(worktrees),
	workspaces: many(workspaces),
}));

export const worktreesRelations = relations(worktrees, ({ one, many }) => ({
	project: one(projects, {
		fields: [worktrees.projectId],
		references: [projects.id],
	}),
	workspaces: many(workspaces),
}));

export const workspacesRelations = relations(workspaces, ({ one }) => ({
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	worktree: one(worktrees, {
		fields: [workspaces.worktreeId],
		references: [worktrees.id],
	}),
}));

// Cloud workspace relations (synced tables)
export const cloudWorkspacesRelations = relations(
	cloudWorkspaces,
	({ many }) => ({
		sessions: many(cloudWorkspaceSessions),
	}),
);

export const cloudWorkspaceSessionsRelations = relations(
	cloudWorkspaceSessions,
	({ one }) => ({
		workspace: one(cloudWorkspaces, {
			fields: [cloudWorkspaceSessions.workspace_id],
			references: [cloudWorkspaces.id],
		}),
	}),
);
