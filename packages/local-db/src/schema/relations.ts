import { relations } from "drizzle-orm";
import {
	cloudWorkspaces,
	organizations,
	projects,
	users,
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
	cloudWorkspace: one(cloudWorkspaces, {
		fields: [workspaces.cloudWorkspaceId],
		references: [cloudWorkspaces.id],
	}),
}));

export const cloudWorkspacesRelations = relations(
	cloudWorkspaces,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [cloudWorkspaces.organization_id],
			references: [organizations.id],
		}),
		creator: one(users, {
			fields: [cloudWorkspaces.creator_id],
			references: [users.id],
		}),
		workspaces: many(workspaces),
	}),
);
