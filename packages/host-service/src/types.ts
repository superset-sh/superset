import type { Octokit } from "@octokit/rest";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { HostDb } from "./db";
import type { EventBus } from "./events";
import type { PageWatchManager } from "./page-watch/index.ts";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";
import type { TerminalAgentStore } from "./terminal-agents";
import type { ExecGh } from "./trpc/router/workspace-creation/utils/exec-gh";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
	filesystem: WorkspaceFilesystemManager;
	pullRequests: PullRequestRuntimeManager;
	pageWatch: PageWatchManager;
}

export interface HostServiceContext {
	git: GitFactory;
	credentials: GitCredentialProvider;
	github: () => Promise<Octokit>;
	execGh: ExecGh;
	api: ApiClient;
	db: HostDb;
	runtime: HostServiceRuntime;
	eventBus: EventBus;
	terminalAgentStore: TerminalAgentStore;
	organizationId: string;
	isAuthenticated: boolean;
	clientMachineId?: string;
	/**
	 * The user behind this request (`x-superset-user-id`): set by the relay
	 * from the verified JWT, or by a local caller holding the pre-shared
	 * secret. Absent for callers that predate the header. Stamped as
	 * `createdByUserId` on workspaces this request creates.
	 */
	userId?: string;
	/** Present only when a desktop app spawned this host (has browser panes). */
	browserBridge?: BrowserBridgeConfig;
}

export interface BrowserBridgeConfig {
	url: string;
	secret: string;
}
