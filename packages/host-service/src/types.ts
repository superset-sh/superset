import type { Octokit } from "@octokit/rest";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { HostDb } from "./db";
import type { ChatRuntimeManager } from "./runtime/chat";
import type { WorkspaceFilesystemManager } from "./runtime/filesystem";
import type { GitFactory } from "./runtime/git";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
	chat: ChatRuntimeManager;
	filesystem: WorkspaceFilesystemManager;
	pullRequests: PullRequestRuntimeManager;
}

export interface HostServiceContext {
	git: GitFactory;
	github: () => Promise<Octokit>;
	api: ApiClient | null;
	db: HostDb;
	runtime: HostServiceRuntime;
	deviceClientId: string | null;
	deviceName: string | null;
	isAuthenticated: boolean;
}
