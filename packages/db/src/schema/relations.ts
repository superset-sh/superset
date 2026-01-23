import { relations } from "drizzle-orm";

import {
	accounts,
	invitations,
	members,
	organizations,
	sessions,
	users,
} from "./auth";
import { cloudWorkspaceSessions, cloudWorkspaces } from "./cloud-workspace";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "./github";
import {
	integrationConnections,
	repositories,
	taskStatuses,
	tasks,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	members: many(members),
	invitations: many(invitations),
	createdTasks: many(tasks, { relationName: "creator" }),
	assignedTasks: many(tasks, { relationName: "assignee" }),
	connectedIntegrations: many(integrationConnections),
	createdCloudWorkspaces: many(cloudWorkspaces, { relationName: "creator" }),
	cloudWorkspaceSessions: many(cloudWorkspaceSessions),
	githubInstallations: many(githubInstallations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id],
	}),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
	members: many(members),
	invitations: many(invitations),
	repositories: many(repositories),
	tasks: many(tasks),
	taskStatuses: many(taskStatuses),
	integrations: many(integrationConnections),
	cloudWorkspaces: many(cloudWorkspaces),
	githubInstallations: many(githubInstallations),
}));

export const membersRelations = relations(members, ({ one }) => ({
	organization: one(organizations, {
		fields: [members.organizationId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [members.userId],
		references: [users.id],
	}),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
	organization: one(organizations, {
		fields: [invitations.organizationId],
		references: [organizations.id],
	}),
	inviter: one(users, {
		fields: [invitations.inviterId],
		references: [users.id],
	}),
}));

export const repositoriesRelations = relations(
	repositories,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [repositories.organizationId],
			references: [organizations.id],
		}),
		tasks: many(tasks),
		cloudWorkspaces: many(cloudWorkspaces),
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
	status: one(taskStatuses, {
		fields: [tasks.statusId],
		references: [taskStatuses.id],
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

export const taskStatusesRelations = relations(
	taskStatuses,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [taskStatuses.organizationId],
			references: [organizations.id],
		}),
		tasks: many(tasks),
	}),
);

export const integrationConnectionsRelations = relations(
	integrationConnections,
	({ one }) => ({
		organization: one(organizations, {
			fields: [integrationConnections.organizationId],
			references: [organizations.id],
		}),
		connectedBy: one(users, {
			fields: [integrationConnections.connectedByUserId],
			references: [users.id],
		}),
	}),
);

export const cloudWorkspacesRelations = relations(
	cloudWorkspaces,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [cloudWorkspaces.organizationId],
			references: [organizations.id],
		}),
		repository: one(repositories, {
			fields: [cloudWorkspaces.repositoryId],
			references: [repositories.id],
		}),
		creator: one(users, {
			fields: [cloudWorkspaces.creatorId],
			references: [users.id],
			relationName: "creator",
		}),
		sessions: many(cloudWorkspaceSessions),
	}),
);

export const cloudWorkspaceSessionsRelations = relations(
	cloudWorkspaceSessions,
	({ one }) => ({
		workspace: one(cloudWorkspaces, {
			fields: [cloudWorkspaceSessions.workspaceId],
			references: [cloudWorkspaces.id],
		}),
		user: one(users, {
			fields: [cloudWorkspaceSessions.userId],
			references: [users.id],
		}),
	}),
);

// GitHub relations
export const githubInstallationsRelations = relations(
	githubInstallations,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [githubInstallations.organizationId],
			references: [organizations.id],
		}),
		connectedBy: one(users, {
			fields: [githubInstallations.connectedByUserId],
			references: [users.id],
		}),
		repositories: many(githubRepositories),
	}),
);

export const githubRepositoriesRelations = relations(
	githubRepositories,
	({ one, many }) => ({
		installation: one(githubInstallations, {
			fields: [githubRepositories.installationId],
			references: [githubInstallations.id],
		}),
		pullRequests: many(githubPullRequests),
	}),
);

export const githubPullRequestsRelations = relations(
	githubPullRequests,
	({ one }) => ({
		repository: one(githubRepositories, {
			fields: [githubPullRequests.repositoryId],
			references: [githubRepositories.id],
		}),
	}),
);
