import { relations } from "drizzle-orm";
import { projects, sshConnections, workspaces, worktrees } from "./schema";

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
	sshConnection: one(sshConnections, {
		fields: [workspaces.sshConnectionId],
		references: [sshConnections.id],
	}),
}));

export const sshConnectionsRelations = relations(
	sshConnections,
	({ many }) => ({
		workspaces: many(workspaces),
	}),
);
