export type ProviderId = "anthropic" | "openai";

export type ProviderConnectionState =
	| "connected"
	| "disconnected"
	| "needs_attention";

export type ProviderRemediation = "reconnect" | "add_api_key";

export type ProviderIssueCode = "expired";

export interface ProviderIssue {
	code: ProviderIssueCode;
	message: string;
	remediation?: ProviderRemediation;
}

export interface AuthStatusLike {
	authenticated: boolean;
	method: "api_key" | "oauth" | "env" | null;
	source: "external" | "managed" | null;
	issue: "expired" | null;
	hasManagedOAuth?: boolean;
}

export interface ProviderCapabilities {
	canUseChat: boolean;
	canGenerateWorkspaceTitle: boolean;
	canUseSmallModelTasks: boolean;
}

export interface ModelProviderStatus {
	providerId: ProviderId;
	connectionState: ProviderConnectionState;
	authenticated: boolean;
	authMethod: AuthStatusLike["method"];
	source: AuthStatusLike["source"];
	issue: ProviderIssue | null;
	capabilities: ProviderCapabilities;
}

export function getProviderName(providerId: ProviderId): string {
	return providerId === "anthropic" ? "Anthropic" : "OpenAI";
}

function getIssueFromAuthStatus(
	providerId: ProviderId,
	authStatus: AuthStatusLike,
): ProviderIssue | null {
	if (authStatus.issue === "expired") {
		return {
			code: "expired",
			remediation: "reconnect",
			message: `${getProviderName(providerId)} session expired`,
		};
	}

	return null;
}

export function deriveModelProviderStatus(params: {
	providerId: ProviderId;
	authStatus: AuthStatusLike;
}): ModelProviderStatus {
	const { providerId, authStatus } = params;
	const issue = getIssueFromAuthStatus(providerId, authStatus);

	let connectionState: ProviderConnectionState = "disconnected";
	if (authStatus.authenticated) {
		connectionState = issue ? "needs_attention" : "connected";
	} else if (issue || authStatus.source !== null) {
		connectionState = "needs_attention";
	}

	const canUse = authStatus.authenticated && !issue;
	const capabilities: ProviderCapabilities = {
		canUseChat: canUse,
		canGenerateWorkspaceTitle: canUse,
		canUseSmallModelTasks: canUse,
	};

	return {
		providerId,
		connectionState,
		authenticated: authStatus.authenticated,
		authMethod: authStatus.method,
		source: authStatus.source,
		issue,
		capabilities,
	};
}
