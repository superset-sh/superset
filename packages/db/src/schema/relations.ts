import { relations } from "drizzle-orm";

import {
	organizationMembers,
	organizations,
	repositories,
	tasks,
	users,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
	organizationMembers: many(organizationMembers),
	createdTasks: many(tasks, { relationName: "creator" }),
	assignedTasks: many(tasks, { relationName: "assignee" }),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(organizationMembers),
	repositories: many(repositories),
	tasks: many(tasks),
}));

export const organizationMembersRelations = relations(
	organizationMembers,
	({ one }) => ({
		organization: one(organizations, {
			fields: [organizationMembers.organizationId],
			references: [organizations.id],
		}),
		user: one(users, {
			fields: [organizationMembers.userId],
			references: [users.id],
		}),
	}),
);

export const repositoriesRelations = relations(
	repositories,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [repositories.organizationId],
			references: [organizations.id],
		}),
		tasks: many(tasks),
	}),
);

export const tasksRelations = relations(tasks, ({ one }) => ({
	repository: one(repositories, {
		fields: [tasks.repositoryId],
		references: [repositories.id],
	}),
	organization: one(organizations, {
		fields: [tasks.organizationId],
		references: [organizations.id],
	}),
	assignee: one(users, {
		fields: [tasks.assigneeId],
		references: [users.id],
		relationName: "assignee",
	}),
	creator: one(users, {
		fields: [tasks.creatorId],
		references: [users.id],
		relationName: "creator",
	}),
}));
