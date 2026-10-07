import type { GitlabScope } from "./scope";

export interface GitlabCheckout {
	connectionId: string;
	projectId: string;
	pathWithNamespace: string;
	cloneUrl: string;
	defaultBranch: string;
}

export interface GitlabProjectCredentials {
	connectionId: string;
	token: string;
	config: GitlabScope & { host: string; scopeId?: string };
}
