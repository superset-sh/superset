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
	integrationConnections,
	pageComments,
	pageCommentThreads,
	pages,
	pageVersions,
	projects,
	subscriptions,
	taskStatuses,
	tasks,
	v2Clients,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
	workspacePages,
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
	v2Hosts: many(v2Hosts),
	v2Clients: many(v2Clients),
	v2UsersHosts: many(v2UsersHosts),
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
	v2Hosts: many(v2Hosts),
	v2Clients: many(v2Clients),
	v2UsersHosts: many(v2UsersHosts),
	v2Projects: many(v2Projects),
	workspaces: many(workspaces),
	tasks: many(tasks),
	taskStatuses: many(taskStatuses),
	integrations: many(integrationConnections),
	githubInstallations: many(githubInstallations),
	githubRepositories: many(githubRepositories),
	githubPullRequests: many(githubPullRequests),
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
		organization: one(organizations, {
			fields: [githubRepositories.organizationId],
			references: [organizations.id],
		}),
		pullRequests: many(githubPullRequests),
		projects: many(projects),
		v2Projects: many(v2Projects),
	}),
);

export const githubPullRequestsRelations = relations(
	githubPullRequests,
	({ one }) => ({
		repository: one(githubRepositories, {
			fields: [githubPullRequests.repositoryId],
			references: [githubRepositories.id],
		}),
		organization: one(organizations, {
			fields: [githubPullRequests.organizationId],
			references: [organizations.id],
		}),
	}),
);

// Agent relations

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

export const projectsRelations = relations(projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [projects.organizationId],
		references: [organizations.id],
	}),
	githubRepository: one(githubRepositories, {
		fields: [projects.githubRepositoryId],
		references: [githubRepositories.id],
	}),
	workspaces: many(workspaces),
}));

export const v2ProjectsRelations = relations(v2Projects, ({ one }) => ({
	organization: one(organizations, {
		fields: [v2Projects.organizationId],
		references: [organizations.id],
	}),
	githubRepository: one(githubRepositories, {
		fields: [v2Projects.githubRepositoryId],
		references: [githubRepositories.id],
	}),
}));

export const v2HostsRelations = relations(v2Hosts, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [v2Hosts.organizationId],
		references: [organizations.id],
	}),
	createdBy: one(users, {
		fields: [v2Hosts.createdByUserId],
		references: [users.id],
	}),
	usersHosts: many(v2UsersHosts),
}));

export const v2ClientsRelations = relations(v2Clients, ({ one }) => ({
	organization: one(organizations, {
		fields: [v2Clients.organizationId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [v2Clients.userId],
		references: [users.id],
	}),
}));

export const v2UsersHostsRelations = relations(v2UsersHosts, ({ one }) => ({
	organization: one(organizations, {
		fields: [v2UsersHosts.organizationId],
		references: [organizations.id],
	}),
	user: one(users, {
		fields: [v2UsersHosts.userId],
		references: [users.id],
	}),
	host: one(v2Hosts, {
		fields: [v2UsersHosts.organizationId, v2UsersHosts.hostId],
		references: [v2Hosts.organizationId, v2Hosts.machineId],
	}),
}));

export const v2WorkspacesRelations = relations(v2Workspaces, ({ one }) => ({
	organization: one(organizations, {
		fields: [v2Workspaces.organizationId],
		references: [organizations.id],
	}),
	project: one(v2Projects, {
		fields: [v2Workspaces.projectId],
		references: [v2Projects.id],
	}),
	host: one(v2Hosts, {
		fields: [v2Workspaces.organizationId, v2Workspaces.hostId],
		references: [v2Hosts.organizationId, v2Hosts.machineId],
	}),
	createdBy: one(users, {
		fields: [v2Workspaces.createdByUserId],
		references: [users.id],
	}),
	task: one(tasks, {
		fields: [v2Workspaces.taskId],
		references: [tasks.id],
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

export const chatSessionsRelations = relations(chatSessions, ({ one }) => ({
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
}));

export const pagesRelations = relations(pages, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [pages.organizationId],
		references: [organizations.id],
	}),
	createdBy: one(users, {
		fields: [pages.createdByUserId],
		references: [users.id],
	}),
	versions: many(pageVersions),
	workspaceLinks: many(workspacePages),
	commentThreads: many(pageCommentThreads),
}));

export const pageVersionsRelations = relations(pageVersions, ({ one }) => ({
	page: one(pages, {
		fields: [pageVersions.pageId],
		references: [pages.id],
	}),
	createdBy: one(users, {
		fields: [pageVersions.createdByUserId],
		references: [users.id],
	}),
}));

export const pageCommentThreadsRelations = relations(
	pageCommentThreads,
	({ one, many }) => ({
		page: one(pages, {
			fields: [pageCommentThreads.pageId],
			references: [pages.id],
		}),
		version: one(pageVersions, {
			fields: [pageCommentThreads.pageVersionId],
			references: [pageVersions.id],
		}),
		createdBy: one(users, {
			fields: [pageCommentThreads.createdByUserId],
			references: [users.id],
		}),
		comments: many(pageComments),
	}),
);

export const pageCommentsRelations = relations(pageComments, ({ one }) => ({
	thread: one(pageCommentThreads, {
		fields: [pageComments.threadId],
		references: [pageCommentThreads.id],
	}),
	author: one(users, {
		fields: [pageComments.authorUserId],
		references: [users.id],
	}),
}));

export const workspacePagesRelations = relations(workspacePages, ({ one }) => ({
	page: one(pages, {
		fields: [workspacePages.pageId],
		references: [pages.id],
	}),
}));
