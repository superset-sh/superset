import { relations } from "drizzle-orm";

import {
	accounts,
	invitations,
	members,
	organizations,
	sessions,
	users,
} from "./auth";
import { chatMessages, chatParticipants, chatSessions } from "./chat";
import {
	githubInstallations,
	githubPullRequests,
	githubRepositories,
} from "./github";
import {
	integrationConnections,
	repositories,
	subscriptions,
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
	githubInstallations: many(githubInstallations),
	createdChatSessions: many(chatSessions, { relationName: "chatCreator" }),
	chatMessages: many(chatMessages, { relationName: "chatMessageCreator" }),
	chatParticipations: many(chatParticipants),
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
	repositories: many(repositories),
	tasks: many(tasks),
	taskStatuses: many(taskStatuses),
	integrations: many(integrationConnections),
	githubInstallations: many(githubInstallations),
	chatSessions: many(chatSessions),
	chatMessages: many(chatMessages),
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

export const repositoriesRelations = relations(
	repositories,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [repositories.organizationId],
			references: [organizations.id],
		}),
		tasks: many(tasks),
		chatSessions: many(chatSessions),
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

// Chat relations
export const chatSessionsRelations = relations(
	chatSessions,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [chatSessions.organizationId],
			references: [organizations.id],
		}),
		repository: one(repositories, {
			fields: [chatSessions.repositoryId],
			references: [repositories.id],
		}),
		createdBy: one(users, {
			fields: [chatSessions.createdById],
			references: [users.id],
			relationName: "chatCreator",
		}),
		messages: many(chatMessages),
		participants: many(chatParticipants),
	}),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	session: one(chatSessions, {
		fields: [chatMessages.sessionId],
		references: [chatSessions.id],
	}),
	organization: one(organizations, {
		fields: [chatMessages.organizationId],
		references: [organizations.id],
	}),
	createdBy: one(users, {
		fields: [chatMessages.createdById],
		references: [users.id],
		relationName: "chatMessageCreator",
	}),
}));

export const chatParticipantsRelations = relations(
	chatParticipants,
	({ one }) => ({
		session: one(chatSessions, {
			fields: [chatParticipants.sessionId],
			references: [chatSessions.id],
		}),
		user: one(users, {
			fields: [chatParticipants.userId],
			references: [users.id],
		}),
	}),
);
