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
	automationCapabilities,
	automationPromptVersions,
	automationRuns,
	automations,
	capabilityPackages,
	capabilityPackageVersions,
	chatMessages,
	chatSessions,
	devicePresence,
	integrationConnections,
	modelProviderModels,
	modelProviders,
	projectCapabilities,
	projects,
	sandboxImages,
	secrets,
	subscriptions,
	taskStatuses,
	tasks,
	usersSlackUsers,
	v2Clients,
	v2Hosts,
	v2Projects,
	v2UsersHosts,
	v2Workspaces,
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
	modelProviders: many(modelProviders),
	capabilityPackages: many(capabilityPackages),
	githubInstallations: many(githubInstallations),
	devicePresence: many(devicePresence),
	v2Hosts: many(v2Hosts),
	v2Clients: many(v2Clients),
	v2UsersHosts: many(v2UsersHosts),
	v2Workspaces: many(v2Workspaces),
	agentCommands: many(agentCommands),
	chatSessions: many(chatSessions),
	chatMessages: many(chatMessages),
	automations: many(automations),
	automationPromptVersions: many(automationPromptVersions),
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
	v2Workspaces: many(v2Workspaces),
	secrets: many(secrets),
	sandboxImages: many(sandboxImages),
	workspaces: many(workspaces),
	tasks: many(tasks),
	taskStatuses: many(taskStatuses),
	integrations: many(integrationConnections),
	modelProviders: many(modelProviders),
	capabilityPackages: many(capabilityPackages),
	githubInstallations: many(githubInstallations),
	githubRepositories: many(githubRepositories),
	githubPullRequests: many(githubPullRequests),
	devicePresence: many(devicePresence),
	agentCommands: many(agentCommands),
	chatSessions: many(chatSessions),
	chatMessages: many(chatMessages),
	automations: many(automations),
	automationRuns: many(automationRuns),
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

export const tasksRelations = relations(tasks, ({ one, many }) => ({
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
	project: one(v2Projects, {
		fields: [tasks.v2ProjectId],
		references: [v2Projects.id],
	}),
	workspaces: many(v2Workspaces),
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

export const modelProvidersRelations = relations(
	modelProviders,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [modelProviders.organizationId],
			references: [organizations.id],
		}),
		createdBy: one(users, {
			fields: [modelProviders.createdByUserId],
			references: [users.id],
		}),
		models: many(modelProviderModels),
	}),
);

export const modelProviderModelsRelations = relations(
	modelProviderModels,
	({ one }) => ({
		provider: one(modelProviders, {
			fields: [modelProviderModels.providerId],
			references: [modelProviders.id],
		}),
	}),
);

export const capabilityPackagesRelations = relations(
	capabilityPackages,
	({ one, many }) => ({
		organization: one(organizations, {
			fields: [capabilityPackages.organizationId],
			references: [organizations.id],
		}),
		owner: one(users, {
			fields: [capabilityPackages.ownerUserId],
			references: [users.id],
		}),
		currentVersion: one(capabilityPackageVersions, {
			fields: [capabilityPackages.currentVersionId],
			references: [capabilityPackageVersions.id],
		}),
		versions: many(capabilityPackageVersions),
		projectBindings: many(projectCapabilities),
		automationBindings: many(automationCapabilities),
	}),
);

export const capabilityPackageVersionsRelations = relations(
	capabilityPackageVersions,
	({ one, many }) => ({
		capability: one(capabilityPackages, {
			fields: [capabilityPackageVersions.capabilityId],
			references: [capabilityPackages.id],
		}),
		auditModelProvider: one(modelProviders, {
			fields: [capabilityPackageVersions.auditModelProviderId],
			references: [modelProviders.id],
		}),
		createdBy: one(users, {
			fields: [capabilityPackageVersions.createdByUserId],
			references: [users.id],
		}),
		projectBindings: many(projectCapabilities),
		automationBindings: many(automationCapabilities),
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

export const v2ProjectsRelations = relations(v2Projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [v2Projects.organizationId],
		references: [organizations.id],
	}),
	githubRepository: one(githubRepositories, {
		fields: [v2Projects.githubRepositoryId],
		references: [githubRepositories.id],
	}),
	tasks: many(tasks),
	workspaces: many(v2Workspaces),
	capabilities: many(projectCapabilities),
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
	workspaces: many(v2Workspaces),
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

export const v2WorkspacesRelations = relations(
	v2Workspaces,
	({ one, many }) => ({
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
		chatSessions: many(chatSessions),
		task: one(tasks, {
			fields: [v2Workspaces.taskId],
			references: [tasks.id],
		}),
	}),
);

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
		v2Workspace: one(v2Workspaces, {
			fields: [chatSessions.v2WorkspaceId],
			references: [v2Workspaces.id],
		}),
		messages: many(chatMessages),
	}),
);

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	session: one(chatSessions, {
		fields: [chatMessages.chatSessionId],
		references: [chatSessions.id],
	}),
	organization: one(organizations, {
		fields: [chatMessages.organizationId],
		references: [organizations.id],
	}),
	createdBy: one(users, {
		fields: [chatMessages.createdBy],
		references: [users.id],
	}),
}));

export const automationsRelations = relations(automations, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [automations.organizationId],
		references: [organizations.id],
	}),
	owner: one(users, {
		fields: [automations.ownerUserId],
		references: [users.id],
	}),
	modelProvider: one(modelProviders, {
		fields: [automations.modelProviderId],
		references: [modelProviders.id],
	}),
	project: one(v2Projects, {
		fields: [automations.v2ProjectId],
		references: [v2Projects.id],
	}),
	runs: many(automationRuns),
	promptVersions: many(automationPromptVersions),
	capabilities: many(automationCapabilities),
}));

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
	automation: one(automations, {
		fields: [automationRuns.automationId],
		references: [automations.id],
	}),
	organization: one(organizations, {
		fields: [automationRuns.organizationId],
		references: [organizations.id],
	}),
	chatSession: one(chatSessions, {
		fields: [automationRuns.chatSessionId],
		references: [chatSessions.id],
	}),
}));

export const automationPromptVersionsRelations = relations(
	automationPromptVersions,
	({ one }) => ({
		automation: one(automations, {
			fields: [automationPromptVersions.automationId],
			references: [automations.id],
		}),
		author: one(users, {
			fields: [automationPromptVersions.authorUserId],
			references: [users.id],
		}),
		restoredFromVersion: one(automationPromptVersions, {
			fields: [automationPromptVersions.restoredFromVersionId],
			references: [automationPromptVersions.id],
			relationName: "restoredFromVersion",
		}),
	}),
);

export const projectCapabilitiesRelations = relations(
	projectCapabilities,
	({ one }) => ({
		project: one(v2Projects, {
			fields: [projectCapabilities.projectId],
			references: [v2Projects.id],
		}),
		capability: one(capabilityPackages, {
			fields: [projectCapabilities.capabilityId],
			references: [capabilityPackages.id],
		}),
		version: one(capabilityPackageVersions, {
			fields: [projectCapabilities.capabilityVersionId],
			references: [capabilityPackageVersions.id],
		}),
	}),
);

export const automationCapabilitiesRelations = relations(
	automationCapabilities,
	({ one }) => ({
		automation: one(automations, {
			fields: [automationCapabilities.automationId],
			references: [automations.id],
		}),
		capability: one(capabilityPackages, {
			fields: [automationCapabilities.capabilityId],
			references: [capabilityPackages.id],
		}),
		version: one(capabilityPackageVersions, {
			fields: [automationCapabilities.capabilityVersionId],
			references: [capabilityPackageVersions.id],
		}),
	}),
);
