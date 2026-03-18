import type { Octokit } from "@octokit/rest";
import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { HostDb } from "./db";
import type { GitFactory } from "./git/types";
import type { PullRequestRuntimeManager } from "./runtime/pull-requests";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceRuntime {
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
}
