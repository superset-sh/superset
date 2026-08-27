import type { Octokit } from "@octokit/rest";
import type { ChatService } from "@superset/provider-auth/server";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { HostDb } from "./db";
import type { EventBus } from "./events";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";
import type { TerminalAgentStore } from "./terminal-agents";
import type { ExecGh } from "./trpc/router/workspace-creation/utils/exec-gh";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
	auth: ChatService;
	filesystem: WorkspaceFilesystemManager;
	pullRequests: PullRequestRuntimeManager;
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
	/**
	 * Set when the request authenticated with a per-workspace sandbox CLI
	 * token (not the host PSK) — the id of that workspace. A narrower
	 * principal than the PSK: protectedProcedure restricts it to own-workspace
	 * operations via the sandbox-token ACL. Undefined for PSK/desktop callers.
	 */
	sandboxWorkspaceId?: string;
	clientMachineId?: string;
	/** x-superset-hook-token header, verified for sandboxed workspaces. */
	agentHookHeaderToken?: string;
	/** Present only when a desktop app spawned this host (has browser panes). */
	browserBridge?: BrowserBridgeConfig;
}

export interface BrowserBridgeConfig {
	url: string;
	secret: string;
}
