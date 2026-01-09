import { relations } from "drizzle-orm";
import {
	agentMemory,
	executionLogs,
	orchestrationMessages,
	plans,
	planTasks,
	projects,
	workspaces,
	worktrees,
} from "./schema";

export const projectsRelations = relations(projects, ({ many }) => ({
	worktrees: many(worktrees),
	workspaces: many(workspaces),
	plans: many(plans),
	agentMemory: many(agentMemory),
	orchestrationMessages: many(orchestrationMessages),
}));

export const worktreesRelations = relations(worktrees, ({ one, many }) => ({
	project: one(projects, {
		fields: [worktrees.projectId],
		references: [projects.id],
	}),
	workspaces: many(workspaces),
	planTasks: many(planTasks),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	worktree: one(worktrees, {
		fields: [workspaces.worktreeId],
		references: [worktrees.id],
	}),
	planTasks: many(planTasks),
}));

// Plan relations
export const plansRelations = relations(plans, ({ one, many }) => ({
	project: one(projects, {
		fields: [plans.projectId],
		references: [projects.id],
	}),
	tasks: many(planTasks),
}));

export const planTasksRelations = relations(planTasks, ({ one, many }) => ({
	plan: one(plans, {
		fields: [planTasks.planId],
		references: [plans.id],
	}),
	workspace: one(workspaces, {
		fields: [planTasks.workspaceId],
		references: [workspaces.id],
	}),
	worktree: one(worktrees, {
		fields: [planTasks.worktreeId],
		references: [worktrees.id],
	}),
	executionLogs: many(executionLogs),
}));

export const executionLogsRelations = relations(executionLogs, ({ one }) => ({
	task: one(planTasks, {
		fields: [executionLogs.taskId],
		references: [planTasks.id],
	}),
}));

export const agentMemoryRelations = relations(agentMemory, ({ one }) => ({
	project: one(projects, {
		fields: [agentMemory.projectId],
		references: [projects.id],
	}),
}));

export const orchestrationMessagesRelations = relations(
	orchestrationMessages,
	({ one }) => ({
		project: one(projects, {
			fields: [orchestrationMessages.projectId],
			references: [projects.id],
		}),
	}),
);
