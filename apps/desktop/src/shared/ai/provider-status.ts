export type ProviderId = "anthropic" | "openai";

export type ProviderConnectionState =
	| "connected"
	| "disconnected"
	| "needs_attention";

export type ProviderCapability =
	| "chat"
	| "workspace_titles"
	| "small_model_tasks";

export type ProviderRemediation =
	| "reconnect"
	| "check_permissions"
	| "check_billing"
	| "add_api_key"
	| "try_again";

export type ProviderIssueCode =
	| "expired"
	| "missing_scope"
	| "forbidden"
	| "quota_exceeded"
	| "network_error"
	| "unsupported_credentials"
	| "empty_result"
	| "unknown_error";

export interface ProviderIssue {
	code: ProviderIssueCode;
	message: string;
	capability?: ProviderCapability;
	remediation?: ProviderRemediation;
	scope?: string | null;
}

export interface ProviderDiagnostic {
	providerId: ProviderId;
	issue: ProviderIssue | null;
	updatedAt: number | null;
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

export function classifyProviderIssue(params: {
	providerId: ProviderId;
	errorMessage: string;
}): ProviderIssue {
	const { providerId, errorMessage } = params;
	const normalized = errorMessage.trim();
	const lower = normalized.toLowerCase();

	const missingScopeMatch = normalized.match(
		/Missing scopes:\s*([A-Za-z0-9._,\s-]+)/i,
	);
	if (missingScopeMatch || lower.includes("insufficient permissions")) {
		const scope =
			missingScopeMatch?.[1]?.trim().replace(/[.,;:]+$/, "") ?? null;
		const providerName = getProviderName(providerId);
		return {
			code: "missing_scope",
			capability: "small_model_tasks",
			remediation: "check_permissions",
			scope,
			message: scope
				? `${providerName} needs permission ${scope}`
				: `${providerName} is missing permission for this action`,
		};
	}

	if (lower.includes("quota") || lower.includes("insufficient_quota")) {
		return {
			code: "quota_exceeded",
			capability: "small_model_tasks",
			remediation: "check_billing",
			message: `${getProviderName(providerId)} quota or billing needs attention`,
		};
	}

	if (lower.includes("forbidden") || lower.includes("status: 403")) {
		return {
			code: "forbidden",
			capability: "small_model_tasks",
			remediation: "check_permissions",
			message: `${getProviderName(providerId)} denied this request`,
		};
	}

	if (
		lower.includes("timed out") ||
		lower.includes("network") ||
		lower.includes("econn") ||
		lower.includes("fetch failed")
	) {
		return {
			code: "network_error",
			capability: "small_model_tasks",
			remediation: "try_again",
			message: `${getProviderName(providerId)} request failed due to a network error`,
		};
	}

	return {
		code: "unknown_error",
		capability: "small_model_tasks",
		remediation: "try_again",
		message: `${getProviderName(providerId)} could not complete this request`,
	};
}

function getIssueFromAuthStatus(
	providerId: ProviderId,
	authStatus: AuthStatusLike,
): ProviderIssue | null {
	if (authStatus.issue === "expired") {
		return {
			code: "expired",
			capability: "chat",
			remediation: "reconnect",
			message: `${getProviderName(providerId)} session expired`,
		};
	}

	return null;
}

export function deriveModelProviderStatus(params: {
	providerId: ProviderId;
	authStatus: AuthStatusLike;
	diagnostic?: ProviderDiagnostic | null;
}): ModelProviderStatus {
	const { providerId, authStatus, diagnostic } = params;
	const authIssue = getIssueFromAuthStatus(providerId, authStatus);
	const issue = authIssue ?? diagnostic?.issue ?? null;

	let connectionState: ProviderConnectionState = "disconnected";
	if (authStatus.authenticated) {
		connectionState = authIssue ? "needs_attention" : "connected";
	} else if (authIssue || authStatus.source !== null) {
		connectionState = "needs_attention";
	}

	const capabilities: ProviderCapabilities = {
		canUseChat: authStatus.authenticated,
		canGenerateWorkspaceTitle: authStatus.authenticated,
		canUseSmallModelTasks: authStatus.authenticated,
	};

	if (issue) {
		switch (issue.code) {
			case "expired":
				capabilities.canUseChat = false;
				capabilities.canGenerateWorkspaceTitle = false;
				capabilities.canUseSmallModelTasks = false;
				break;
			case "missing_scope":
			case "forbidden":
			case "quota_exceeded":
			case "network_error":
			case "unsupported_credentials":
			case "empty_result":
			case "unknown_error":
				if (issue.capability === "chat") {
					capabilities.canUseChat = false;
				}
				if (
					issue.capability === "small_model_tasks" ||
					issue.capability === "workspace_titles"
				) {
					capabilities.canGenerateWorkspaceTitle = false;
					capabilities.canUseSmallModelTasks = false;
				}
				break;
		}
	}

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
