import type { Octokit } from "@octokit/rest";
import type { ChatService } from "@superset/chat/server/desktop";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { HostDb } from "./db";
import type { EventBus } from "./events";
import type { ChatRuntimeManager } from "./runtime/chat";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitCredentialProvider, GitFactory } from "./runtime/git";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";
import type {
	CanonicalSessionsRuntime,
	SessionsSyncHub,
} from "./runtime/sessions";
import type { TerminalAgentStore } from "./terminal-agents";
import type { ExecGh } from "./trpc/router/workspace-creation/utils/exec-gh";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
	/**
	 * Feature gate for the pre-release canonical sessions surface. Off by
	 * default; app.ts turns it on via SUPERSET_ACP_SESSIONS=1 (or a
	 * test-injected manager). When off, the sessions router rejects every
	 * call and /sessions/sync is not registered.
	 */
	acpSessionsEnabled: boolean;
	auth: ChatService;
	chat: ChatRuntimeManager;
	filesystem: WorkspaceFilesystemManager;
	pullRequests: PullRequestRuntimeManager;
	/**
	 * Canonical Host Sessions projection over the ACP session manager —
	 * serves the `sessions.*` router and /sessions/sync. Shares the
	 * acpSessionsEnabled feature gate.
	 */
	sessions: CanonicalSessionsRuntime;
	/**
	 * The /sessions/sync hub, when the gate is on. `sessions.list` stamps its
	 * host-stream head onto the tRPC host snapshot so clients subscribe from
	 * exactly where the snapshot was taken.
	 */
	sessionsSyncHub: SessionsSyncHub | null;
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
}
