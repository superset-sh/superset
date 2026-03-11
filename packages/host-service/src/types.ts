import type { AppRouter } from "@superset/trpc";
import type { TRPCClient } from "@trpc/client";
import type { GitFactory } from "./git/types";

export type ApiClient = TRPCClient<AppRouter>;

export interface HostServiceContext {
	git: GitFactory;
	api: ApiClient | null;
}
