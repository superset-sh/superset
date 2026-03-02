import { relations } from "drizzle-orm";

import {
	accounts,
	invitations,
	members,
	organizations,
	sessions,
	users,
} from "./auth";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "./github";
import {
	agentCommands,
	chatSessions,
	devicePresence,
	integrationConnections,
	projects,
	sandboxImages,
	secrets,
	sessionHosts,
	subscriptions,
	taskStatuses,
	tasks,
	usersSlackUsers,
	workspaces,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	members: many(members),
	invitations: many(invitations),
	createdTasks: many(tasks, { relationName: "creator" }),
	assignedTasks: many(tasks, { relationName: "assignee" }),
	connectedIntegrations: many(integrationConnections),
	githubInstallations: many(githubInstallations),
	devicePresence: many(devicePresence),
	agentCommands: many(agentCommands),
	chatSessions: many(chatSessions),
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
	subscriptions: many(subscriptions),
	projects: many(projects),
	secrets: many(secrets),
	sandboxImages: many(sandboxImages),
	workspaces: many(workspaces),
	tasks: many(tasks),
	taskStatuses: many(taskStatuses),
	integrations: many(integrationConnections),
	githubInstallations: many(githubInstallations),
	devicePresence: many(devicePresence),
	agentCommands: many(agentCommands),
	chatSessions: many(chatSessions),
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

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
	organization: one(organizations, {
		fields: [subscriptions.referenceId],
		references: [organizations.id],
	}),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
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
		projects: many(projects),
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

// Agent relations
export const devicePresenceRelations = relations(devicePresence, ({ one }) => ({
	user: one(users, {
		fields: [devicePresence.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [devicePresence.organizationId],
		references: [organizations.id],
	}),
}));

export const agentCommandsRelations = relations(agentCommands, ({ one }) => ({
	user: one(users, {
		fields: [agentCommands.userId],
		references: [users.id],
	}),
	organization: one(organizations, {
		fields: [agentCommands.organizationId],
		references: [organizations.id],
	}),
	parentCommand: one(agentCommands, {
		fields: [agentCommands.parentCommandId],
		references: [agentCommands.id],
		relationName: "parentCommand",
	}),
}));

export const usersSlackUsersRelations = relations(
	usersSlackUsers,
	({ one }) => ({
		user: one(users, {
			fields: [usersSlackUsers.userId],
			references: [users.id],
		}),
		organization: one(organizations, {
			fields: [usersSlackUsers.organizationId],
			references: [organizations.id],
		}),
	}),
);

export const projectsRelations = relations(projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [projects.organizationId],
		references: [organizations.id],
	}),
	githubRepository: one(githubRepositories, {
		fields: [projects.githubRepositoryId],
		references: [githubRepositories.id],
	}),
	secrets: many(secrets),
	sandboxImage: one(sandboxImages),
	workspaces: many(workspaces),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
	organization: one(organizations, {
		fields: [secrets.organizationId],
		references: [organizations.id],
	}),
	project: one(projects, {
		fields: [secrets.projectId],
		references: [projects.id],
	}),
	createdBy: one(users, {
		fields: [secrets.createdByUserId],
		references: [users.id],
	}),
}));

export const sandboxImagesRelations = relations(sandboxImages, ({ one }) => ({
	organization: one(organizations, {
		fields: [sandboxImages.organizationId],
		references: [organizations.id],
	}),
	project: one(projects, {
		fields: [sandboxImages.projectId],
		references: [projects.id],
	}),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [workspaces.organizationId],
		references: [organizations.id],
	}),
	project: one(projects, {
		fields: [workspaces.projectId],
		references: [projects.id],
	}),
	createdBy: one(users, {
		fields: [workspaces.createdByUserId],
		references: [users.id],
	}),
	chatSessions: many(chatSessions),
}));

export const chatSessionsRelations = relations(
	chatSessions,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [chatSessions.organizationId],
			references: [organizations.id],
		}),
		createdBy: one(users, {
			fields: [chatSessions.createdBy],
			references: [users.id],
		}),
		workspace: one(workspaces, {
			fields: [chatSessions.workspaceId],
			references: [workspaces.id],
		}),
		sessionHosts: many(sessionHosts),
	}),
);

export const sessionHostsRelations = relations(sessionHosts, ({ one }) => ({
	chatSession: one(chatSessions, {
		fields: [sessionHosts.sessionId],
		references: [chatSessions.id],
	}),
	organization: one(organizations, {
		fields: [sessionHosts.organizationId],
		references: [organizations.id],
	}),
}));
